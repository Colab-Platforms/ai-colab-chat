import prisma from "@root/prisma.js";
import dayjs from "dayjs";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { CreateSubscriptionBody } from "./subscription.types.js";
import { createWalletTransaction, creditBundledCredits } from "@/utils/walletUtils.js";
import SubscriptionCashfreeService from "./subscription.cashfree.service.js";
import { CashfreePlanSource } from "@/utils/cashfreePlan.js";

class SubscriptionService {
    private cashfreeService = new SubscriptionCashfreeService();
    private static readonly PENDING_AUTH_WINDOW_MINUTES = Number(process.env.SUBSCRIPTION_PENDING_AUTH_WINDOW_MINUTES ?? 15);

    /**
     * Plan prices are stored tax-exclusive — this is the live rate GST gets
     * added at the point of actually charging Cashfree (same CreditPricingConfig
     * row credit top-ups already read). Falls back to 18% only if the config
     * row is somehow missing.
     */
    private async getGstPercent(): Promise<number> {
        const pricing = await prisma.creditPricingConfig.findFirst({ orderBy: { id: "desc" } });
        return pricing ? Number(pricing.gstPercent) : 18;
    }

    // For paid plans, we keep subscription PENDING until we receive the real debit success.
    // The expiry window should start when mandate authorization happens, not when the user initially clicks "Subscribe".
    private getPendingExpiry(baseAt: Date): Date {
        return dayjs(baseAt)
            .add(SubscriptionService.PENDING_AUTH_WINDOW_MINUTES, "minute")
            .toDate();
    }

    private async expirePendingSubscriptionIfNeeded(subscription: {
        id: number;
        startedAt: Date;
        cashfreeSubscriptionId: string | null;
    }): Promise<boolean> {
        const now = new Date();
        const pendingExpiry = this.getPendingExpiry(subscription.startedAt);
        const isExpired = now > pendingExpiry;
        if (!isExpired) return false;

        if (subscription.cashfreeSubscriptionId) {
            try {
                await this.cashfreeService.cancelSubscription(subscription.cashfreeSubscriptionId);
            } catch (cancelError: any) {
                console.warn(
                    "Cashfree pending subscription cancel warning:",
                    cancelError?.message ?? cancelError,
                );
            }
        }

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: "CANCELLED",
                autoRenew: false,
                expiresAt: now,
            },
        });
        return true;
    }

    async create(userId: number, data: CreateSubscriptionBody) {
        const now = new Date();
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);
        }

        const plan = await prisma.plan.findFirst({
            where: { id: data.planId, isActive: true, isDeleted: false },
        });

        if (!plan) {
            throw new ApiError("Plan not found", STATUS_CODES.NOT_FOUND);
        }

        const existingSub = await prisma.subscription.findFirst({
            where: { userId, status: { in: ["ACTIVE", "PENDING"] } },
            include: { plan: true },
            orderBy: { createdAt: "desc" },
        });

        if (existingSub) {
            const existingIsFree =
                Number(existingSub.plan.monthlyPrice) === 0 ||
                existingSub.plan.name.trim().toLowerCase() === "free";
            const targetIsPaid =
                Number(plan.monthlyPrice) > 0 &&
                plan.name.trim().toLowerCase() !== "free";
            const isSamePlan = existingSub.planId === plan.id;

            if (existingSub.status === "PENDING") {
                const pendingExpiry = this.getPendingExpiry(existingSub.startedAt);
                const isExpired = now > pendingExpiry;
                // Note: pending expiry is based on startedAt (auth moment), not createdAt.

                if (!isExpired && !data.forceRetry) {
                    throw new ApiError(
                        "You already have a pending subscription authorization",
                        STATUS_CODES.CONFLICT,
                    );
                }

                if (existingSub.cashfreeSubscriptionId) {
                    try {
                        await this.cashfreeService.cancelSubscription(existingSub.cashfreeSubscriptionId);
                    } catch (cancelError: any) {
                        console.warn(
                            "Cashfree pending subscription cancel warning:",
                            cancelError?.message ?? cancelError,
                        );
                    }
                }

                await prisma.subscription.update({
                    where: { id: existingSub.id },
                    data: {
                        status: "CANCELLED",
                        autoRenew: false,
                        expiresAt: now,
                    },
                });
            }

            // Allow switching/upgrading from an existing ACTIVE plan to a different paid plan.
            // Keep current ACTIVE plan until the new mandate is successfully activated by webhook.
            if (existingSub.status === "ACTIVE") {
                if (isSamePlan) {
                    throw new ApiError("You are already on this plan", STATUS_CODES.CONFLICT);
                }

                if (existingIsFree && targetIsPaid) {
                    // Allowed: Free -> Paid
                } else if (!existingIsFree && targetIsPaid) {
                    // Allowed: Paid -> Paid (upgrade/downgrade switch)
                } else {
                    throw new ApiError("Plan switch is only supported for paid plans", STATUS_CODES.CONFLICT);
                }
            }
        }

        // Free plans: immediately activate and credit wallet (no Cashfree integration).
        if (Number(plan.monthlyPrice) === 0) {
            const freePlanAlreadyUsed = await prisma.subscription.findFirst({
                where: {
                    plan: {
                        isDeleted: false,
                        OR: [
                            { name: { equals: "free", mode: "insensitive" } },
                            { monthlyPrice: 0 },
                        ],
                    },
                    user: {
                        email: user.email,
                    },
                },
                select: { id: true },
            });

            if (freePlanAlreadyUsed) {
                throw new ApiError(
                    "Free plan can only be availed once",
                    STATUS_CODES.CONFLICT,
                );
            }

            return prisma.$transaction(async (tx) => {
                const subscription = await tx.subscription.create({
                    data: {
                        userId,
                        planId: data.planId,
                        billingCycle: data.billingCycle,
                        status: "ACTIVE",
                        autoRenew: false,
                        startedAt: now,
                        expiresAt: addCycle(now, data.billingCycle),
                    },
                });

                const wallet = await tx.userWallet.upsert({
                    where: { userId },
                    create: {
                        userId,
                        tokensRemaining: plan.tokenLimit,
                        tokensUsed: 0,
                        currentPeriodStart: now,
                        currentPeriodEnd: addCycle(now, data.billingCycle),
                    },
                    update: {
                        // Plan switch: carry forward unused tokens from the previous plan
                        // instead of wiping them.
                        tokensRemaining: { increment: plan.tokenLimit },
                        tokensUsed: 0,
                        currentPeriodStart: now,
                        currentPeriodEnd: addCycle(now, data.billingCycle),
                    },
                });

                await createWalletTransaction(tx, {
                    userId,
                    walletId: wallet.id,
                    amount: plan.tokenLimit,
                    type: "CREDIT",
                    referenceId: "free_subscription_activation",
                    meta: { reason: "FREE_PLAN_ACTIVATION", planId: plan.id, planName: plan.name },
                });

                // Bundled video credits reset (overwrite) to this plan's grant —
                // unlike tokens above, they never carry forward across a switch.
                await creditBundledCredits(tx, {
                    userId,
                    monthlyVideoCredits: plan.monthlyVideoCredits,
                    referenceId: `free_subscription_activation_${subscription.id}`,
                    meta: { reason: "FREE_PLAN_ACTIVATION", planId: plan.id, planName: plan.name },
                });

                return { subscription, auth_link: null };
            });
        }

        // Paid plans: create local subscription in PENDING state.
        // Wallet is zeroed until Cashfree sends SUBSCRIPTION_STATUS_CHANGE (ACTIVE) webhook.
        // Use API-safe identifiers (alphanumeric + underscore).
        const cashfreeSubscriptionId = `sub_${userId}_${Date.now()}`;

        const subscription = await prisma.subscription.create({
            data: {
                userId,
                planId: data.planId,
                billingCycle: data.billingCycle,
                status: "PENDING",
                autoRenew: true,
                startedAt: now,
                cashfreeSubscriptionId,
            },
        });

        try {
            const gstPercent = await this.getGstPercent();

            // Best-effort sync. Subscription creation should not fail only because
            // Cashfree plan-sync endpoint is temporarily failing.
            try {
                await this.cashfreeService.syncPlan(
                    plan as unknown as CashfreePlanSource,
                    data.billingCycle,
                    gstPercent,
                );
            } catch (syncError: any) {
                console.warn("Cashfree plan sync warning:", syncError?.message ?? syncError);
            }

            const { auth_link, subscription_session_id } = await this.cashfreeService.createSubscription(
                user,
                plan as unknown as CashfreePlanSource,
                data.billingCycle,
                cashfreeSubscriptionId,
                undefined,
                gstPercent,
            );

            return { subscription, auth_link, subscription_session_id };
        } catch (e: any) {
            await prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: "CANCELLED",
                    autoRenew: false,
                },
            });
            throw e;
        }
    }

    async getCurrent(userId: number) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });

        if (!user) {
            throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);
        }

        const currentSubscription = await prisma.subscription.findFirst({
            where: { userId, status: { in: ["ACTIVE", "TRIAL"] } },
            include: { plan: true },
            orderBy: { createdAt: "desc" },
        });
        const pendingSubscription = await prisma.subscription.findFirst({
            where: { userId, status: "PENDING" },
            include: { plan: true },
            orderBy: { createdAt: "desc" },
        });
        let activePendingSubscription = pendingSubscription;
        if (activePendingSubscription) {
            const expired = await this.expirePendingSubscriptionIfNeeded(activePendingSubscription);
            if (expired) {
                activePendingSubscription = null;
            }
        }

        const freePlanTaken = !!(await prisma.subscription.findFirst({
            where: {
                user: { email: user.email },
                plan: {
                    isDeleted: false,
                    OR: [
                        { name: { equals: "free", mode: "insensitive" } },
                        { monthlyPrice: 0 },
                    ],
                },
            },
            select: { id: true },
        }));

        const pendingExpiresAt =
            activePendingSubscription
                ? this.getPendingExpiry(activePendingSubscription.startedAt)
                : null;

        const pendingAuthLink =
            activePendingSubscription?.cashfreeSubscriptionId
                ? await this.cashfreeService.getSubscriptionAuthLink(activePendingSubscription.cashfreeSubscriptionId)
                : null;
        const pendingSubscriptionSessionId =
            activePendingSubscription?.cashfreeSubscriptionId
                ? await this.cashfreeService.getSubscriptionSessionId(activePendingSubscription.cashfreeSubscriptionId)
                : null;

        return {
            subscription: currentSubscription ?? null,
            pendingSubscription: activePendingSubscription ?? null,
            freePlanTaken,
            pendingExpiresAt,
            pendingAuthLink,
            pendingSubscriptionSessionId,
        };
    }

    async cancel(userId: number) {
        const subscription = await prisma.subscription.findFirst({
            where: { userId, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } },
            orderBy: { createdAt: "desc" },
        });

        if (!subscription) {
            throw new ApiError("No active or pending subscription found", STATUS_CODES.NOT_FOUND);
        }

        // If cashfreeSubscriptionId exists, cancel on Cashfree first.
        if (subscription.cashfreeSubscriptionId) {
            await this.cashfreeService.cancelSubscription(subscription.cashfreeSubscriptionId);
        }

        return prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "CANCELLED", autoRenew: false },
        });
    }

    // Cancel only a PENDING subscription (used for "Cancel payment" flows).
    // This prevents accidentally cancelling an ACTIVE subscription if the user completed payment.
    async cancelPending(userId: number) {
        const subscription = await prisma.subscription.findFirst({
            where: { userId, status: "PENDING" },
            orderBy: { createdAt: "desc" },
        });

        if (!subscription) {
            throw new ApiError("No pending subscription found", STATUS_CODES.NOT_FOUND);
        }

        const now = new Date();

        // If cashfreeSubscriptionId exists, cancel on Cashfree first.
        if (subscription.cashfreeSubscriptionId) {
            await this.cashfreeService.cancelSubscription(subscription.cashfreeSubscriptionId);
        }

        return prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "CANCELLED", autoRenew: false, expiresAt: now },
        });
    }

    async enableAutoPay(userId: number, data: CreateSubscriptionBody) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);
        }

        const plan = await prisma.plan.findFirst({
            where: { id: data.planId, isActive: true, isDeleted: false },
        });
        if (!plan) {
            throw new ApiError("Plan not found", STATUS_CODES.NOT_FOUND);
        }

        const activeSub = await prisma.subscription.findFirst({
            where: {
                userId,
                status: "ACTIVE",
                planId: data.planId,
                billingCycle: data.billingCycle,
            },
            orderBy: { createdAt: "desc" },
        });
        if (!activeSub) {
            throw new ApiError("Active paid subscription not found for AutoPay enablement", STATUS_CODES.NOT_FOUND);
        }

        if (activeSub.cashfreeSubscriptionId && activeSub.autoRenew) {
            throw new ApiError("AutoPay is already enabled", STATUS_CODES.CONFLICT);
        }

        const hasPending = await prisma.subscription.findFirst({
            where: { userId, status: "PENDING" },
            select: { id: true },
        });
        if (hasPending) {
            throw new ApiError("Please complete existing pending payment first", STATUS_CODES.CONFLICT);
        }

        const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
        const autoPayReturnUrl =
            frontendUrl.startsWith("https://")
                ? `${frontendUrl}/profile/subscription`
                : undefined;

        const cashfreeSubscriptionId = `sub_${userId}_${Date.now()}`;
        const { auth_link, subscription_session_id } = await this.cashfreeService.createSubscription(
            user,
            plan as unknown as CashfreePlanSource,
            data.billingCycle,
            cashfreeSubscriptionId,
            autoPayReturnUrl,
            await this.getGstPercent(),
        );

        await prisma.subscription.update({
            where: { id: activeSub.id },
            data: {
                autoRenew: true,
                cashfreeSubscriptionId,
            },
        });

        return {
            auth_link,
            subscription_session_id,
            cashfreeSubscriptionId,
        };
    }

    async disableAutoPay(userId: number) {
        const activeSub = await prisma.subscription.findFirst({
            where: {
                userId,
                status: "ACTIVE",
                autoRenew: true,
                cashfreeSubscriptionId: { not: null },
            },
            orderBy: { createdAt: "desc" },
        });
        if (!activeSub) {
            throw new ApiError("AutoPay is already disabled", STATUS_CODES.CONFLICT);
        }

        if (activeSub.cashfreeSubscriptionId) {
            try {
                await this.cashfreeService.cancelSubscription(activeSub.cashfreeSubscriptionId);
            } catch (e: any) {
                console.warn("Cashfree cancel mandate warning:", e?.message ?? e);
            }
        }

        return prisma.subscription.update({
            where: { id: activeSub.id },
            data: {
                autoRenew: false,
            },
        });
    }
}

export default SubscriptionService;

function addCycle(now: Date, cycle: "MONTHLY" | "QUARTERLY" | "YEARLY"): Date {
    switch (cycle) {
        case "MONTHLY":
            return dayjs(now).add(1, "month").toDate();
        case "QUARTERLY":
            return dayjs(now).add(3, "month").toDate();
        case "YEARLY":
            return dayjs(now).add(1, "year").toDate();
    }
}

// Intentionally no helpers below - the payment/user details come from DB.
