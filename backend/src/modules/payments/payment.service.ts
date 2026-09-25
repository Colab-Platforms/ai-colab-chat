import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { createWalletTransaction, creditBundledCredits, creditTopupCredits, calculateTopUpCredits } from "@/utils/walletUtils.js";
import PaymentCashfreeService from "./payment.cashfree.service.js";
import BillingService from "@/modules/billing/billing.service.js";
import InvoiceService from "@/modules/billing/invoice.service.js";

class PaymentService {
  private cashfreeService = new PaymentCashfreeService();
  private billingService = new BillingService();
  private invoiceService = new InvoiceService();

  private normalizePhone(phoneNumber: string | null | undefined): string {
    const digits = String(phoneNumber ?? "").replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return digits;
    if (digits.length > 15) return digits.slice(-15);
    return "9999999999";
  }

  private addCycle(now: Date, cycle: "MONTHLY" | "QUARTERLY" | "YEARLY"): Date {
    switch (cycle) {
      case "MONTHLY":
        return dayjs(now).add(1, "month").toDate();
      case "QUARTERLY":
        return dayjs(now).add(3, "month").toDate();
      case "YEARLY":
        return dayjs(now).add(1, "year").toDate();
    }
  }

  async createSubscriptionOneTimePayment(userId: number, data: { planId: number; billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" }) {
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);
    }

    const plan = await prisma.plan.findFirst({
      where: { id: data.planId, isActive: true, isDeleted: false },
    });
    if (!plan) {
      throw new ApiError("Plan not found", STATUS_CODES.NOT_FOUND);
    }

    const amount = Number(
      data.billingCycle === "MONTHLY"
        ? plan.monthlyPrice
        : data.billingCycle === "QUARTERLY"
          ? plan.quarterlyPrice
          : plan.yearlyPrice,
    );
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError("Plan is not payable via one-time payment", STATUS_CODES.CONFLICT);
    }

    const pendingSub = await prisma.subscription.findFirst({
      where: { userId, status: "PENDING" },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (pendingSub) {
      throw new ApiError("You already have a pending payment", STATUS_CODES.CONFLICT);
    }

    const localSubscription = await prisma.subscription.create({
      data: {
        userId,
        planId: data.planId,
        billingCycle: data.billingCycle,
        status: "PENDING",
        autoRenew: false,
        startedAt: now,
      },
    });

    const orderId = `subpay_${userId}_${localSubscription.id}_${Date.now()}`;
    const customerName =
      [user.firstName, user.lastName]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join(" ")
        .trim() || user.email.split("@")[0] || `user_${user.id}`;

    try {
      const order = await this.cashfreeService.createOrder({
        orderId,
        orderAmount: amount,
        customerId: `user_${user.id}`,
        customerName,
        customerEmail: user.email,
        customerPhone: this.normalizePhone(user.phoneNumber),
      });

      await prisma.payment.create({
        data: {
          userId,
          subscriptionId: localSubscription.id,
          type: "ONE_TIME",
          provider: "CASHFREE",
          providerOrderId: orderId,
          amount,
          currency: "INR",
          status: "PENDING",
        },
      });

      return {
        localSubscriptionId: localSubscription.id,
        order_id: order.order_id,
        payment_session_id: order.payment_session_id,
      };
    } catch (error) {
      await prisma.subscription.update({
        where: { id: localSubscription.id },
        data: { status: "CANCELLED", autoRenew: false, expiresAt: now },
      });
      throw error;
    }
  }

  /**
   * Pay-as-you-go video-credit top-up — a standalone Cashfree order with no
   * subscriptionId, distinguished from a plan purchase by the "credittopup_"
   * order-id prefix and Payment.purpose. Reuses the same one-time-order
   * plumbing as createSubscriptionOneTimePayment.
   */
  async createCreditTopUp(userId: number, amountInr: number) {
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      throw new ApiError("Top-up amount must be a positive number", STATUS_CODES.BAD_REQUEST);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);
    }

    const orderId = `credittopup_${userId}_${Date.now()}`;
    const customerName =
      [user.firstName, user.lastName]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join(" ")
        .trim() || user.email.split("@")[0] || `user_${user.id}`;

    const order = await this.cashfreeService.createOrder({
      orderId,
      orderAmount: amountInr,
      customerId: `user_${user.id}`,
      customerName,
      customerEmail: user.email,
      customerPhone: this.normalizePhone(user.phoneNumber),
      returnPath: "/profile/wallet/topup-success",
    });

    await prisma.payment.create({
      data: {
        userId,
        type: "ONE_TIME",
        purpose: "CREDIT_TOPUP",
        provider: "CASHFREE",
        providerOrderId: orderId,
        amount: amountInr,
        currency: "INR",
        status: "PENDING",
      },
    });

    return {
      order_id: order.order_id,
      payment_session_id: order.payment_session_id,
    };
  }

  private async handleCreditTopUpWebhook(
    orderId: string,
    normalizedPaymentId: string | null,
    success: boolean,
    failed: boolean,
  ) {
    const payment = await prisma.payment.findFirst({
      where: { providerOrderId: orderId, purpose: "CREDIT_TOPUP" },
    });
    if (!payment) {
      return { ignored: true, reason: "Credit top-up payment not found" };
    }
    if (payment.status !== "PENDING") {
      return { ignored: true, reason: "Credit top-up already processed" };
    }

    if (success) {
      const pricing = await prisma.creditPricingConfig.findFirst({ orderBy: { id: "desc" } });
      if (!pricing) {
        throw new ApiError("Credit pricing isn't configured", STATUS_CODES.SERVER_ERROR);
      }
      const credits = calculateTopUpCredits(Number(payment.amount), {
        costPerCreditInr: Number(pricing.costPerCreditInr),
        marginPercent: Number(pricing.marginPercent),
        gstPercent: Number(pricing.gstPercent),
      });

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "COMPLETED",
            providerPaymentId: normalizedPaymentId,
            creditsGranted: credits,
          },
        });

        await creditTopupCredits(tx, {
          userId: payment.userId,
          amount: credits,
          referenceId: `credit_topup_${payment.id}`,
          meta: { reason: "CREDIT_TOPUP", orderId, paymentId: normalizedPaymentId, amountInr: payment.amount },
        });
      });

      return { ignored: false, processed: "success", creditsGranted: credits };
    }

    if (failed) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", providerPaymentId: normalizedPaymentId },
      });
      return { ignored: false, processed: "failed" };
    }

    return { ignored: true, reason: "Unhandled event" };
  }

  async handleCashfreePaymentWebhook(req: any) {
    this.cashfreeService.verifyWebhookSignature(req);

    const eventType = req.body?.type;
    const { event: webhookEvent, duplicate } = await this.billingService.recordWebhookEvent({
      eventType: String(eventType ?? "UNKNOWN"),
      timestamp: req.headers["x-webhook-timestamp"],
      rawBody: (req.rawBody as Buffer | undefined)?.toString("utf8") ?? JSON.stringify(req.body ?? ""),
    });
    if (duplicate) {
      return { ignored: true, reason: "Duplicate webhook" };
    }
    const data = req.body?.data ?? {};
    const orderId =
      data?.order?.order_id ??
      data?.order_id ??
      data?.payment?.order_id ??
      data?.payment_details?.order_id ??
      data?.cf_order_id ??
      req.body?.order?.order_id ??
      null;
    const paymentStatus =
      String(
        data?.payment?.payment_status ??
          data?.payment_status ??
          data?.order?.order_status ??
          data?.payment_details?.payment_status ??
          "",
      ).toUpperCase();
    const paymentId =
      data?.payment?.cf_payment_id ??
      data?.cf_payment_id ??
      data?.payment_id ??
      data?.payment?.payment_id ??
      null;
    const normalizedPaymentId = paymentId != null ? String(paymentId) : null;

    if (!orderId) {
      return { ignored: true, reason: "No order id on webhook payload" };
    }

    const normalizedType = String(eventType ?? "").toUpperCase();
    const success =
      normalizedType.includes("PAYMENT_SUCCESS") ||
      normalizedType === "ORDER_PAID" ||
      paymentStatus === "SUCCESS" ||
      paymentStatus === "PAID";
    const failed =
      normalizedType.includes("PAYMENT_FAILED") ||
      normalizedType === "PAYMENT_USER_DROPPED" ||
      paymentStatus === "FAILED" ||
      paymentStatus === "CANCELLED";

    if (String(orderId).startsWith("credittopup_")) {
      const result = await this.handleCreditTopUpWebhook(String(orderId), normalizedPaymentId, success, failed);
      await this.billingService.markWebhookEvent(webhookEvent?.id, "PROCESSED");
      return result;
    }

    if (!String(orderId).startsWith("subpay_")) {
      return { ignored: true, reason: "Not a subscription one-time order" };
    }
    const parts = String(orderId).split("_");
    const localSubscriptionId = Number(parts[2]);
    if (!Number.isFinite(localSubscriptionId) || localSubscriptionId <= 0) {
      return { ignored: true, reason: "Invalid order mapping" };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: localSubscriptionId },
      include: { plan: true },
    });
    if (!subscription) {
      return { ignored: true, reason: "Local subscription not found" };
    }

    if (success) {
      const now = new Date();
      const nextPeriodEnd = this.addCycle(now, subscription.billingCycle);
      const tokenLimit = subscription.plan.tokenLimit;
      const amount = Number(
        subscription.billingCycle === "MONTHLY"
          ? subscription.plan.monthlyPrice
          : subscription.billingCycle === "QUARTERLY"
            ? subscription.plan.quarterlyPrice
            : subscription.plan.yearlyPrice,
      );

      const paymentId = await prisma.$transaction(async (tx) => {
        const currentSub = await tx.subscription.findUnique({
          where: { id: subscription.id },
        });
        if (!currentSub) return null;
        if (
          currentSub.lastPaymentId &&
          normalizedPaymentId &&
          currentSub.lastPaymentId === normalizedPaymentId
        ) return null;

        await tx.subscription.updateMany({
          where: {
            userId: subscription.userId,
            id: { not: subscription.id },
            status: "ACTIVE",
          },
          data: {
            status: "CANCELLED",
            autoRenew: false,
            expiresAt: now,
          },
        });

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            autoRenew: false,
            startedAt: now,
            expiresAt: nextPeriodEnd,
            currentPeriodStart: now,
            currentPeriodEnd: nextPeriodEnd,
            nextBillingDate: nextPeriodEnd,
            lastPaymentId: normalizedPaymentId ?? String(orderId),
          },
        });

        const existingWallet = await tx.userWallet.findUnique({
          where: { userId: subscription.userId },
        });

        // Every one-time-payment order creates a fresh PENDING subscription (there's no
        // auto-renew on this flow), so reaching here always means an explicit plan
        // purchase/switch by the user — carry forward unused tokens instead of wiping them.
        const isPlanSwitch = currentSub.status !== "ACTIVE";

        if (!isPlanSwitch && existingWallet && existingWallet.tokensRemaining > 0) {
          await createWalletTransaction(tx, {
            userId: subscription.userId,
            walletId: existingWallet.id,
            amount: existingWallet.tokensRemaining,
            type: "DEBIT",
            referenceId: "upgrade_previous_tokens_removed",
            meta: {
              reason: "UPGRADE_PREVIOUS_TOKENS_REMOVED",
              orderId,
              paymentId: normalizedPaymentId,
            },
          });
        }

        const wallet = await tx.userWallet.upsert({
          where: { userId: subscription.userId },
          create: {
            userId: subscription.userId,
            tokensRemaining: tokenLimit,
            tokensUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: nextPeriodEnd,
          },
          update: isPlanSwitch
            ? {
                tokensRemaining: { increment: tokenLimit },
                tokensUsed: 0,
                currentPeriodStart: now,
                currentPeriodEnd: nextPeriodEnd,
              }
            : {
                tokensRemaining: tokenLimit,
                tokensUsed: 0,
                currentPeriodStart: now,
                currentPeriodEnd: nextPeriodEnd,
              },
        });

        await createWalletTransaction(tx, {
          userId: subscription.userId,
          walletId: wallet.id,
          amount: tokenLimit,
          type: "CREDIT",
          referenceId: "one_time_subscription_activation",
          meta: {
            reason: "ONE_TIME_PAYMENT_SUCCESS",
            orderId,
            paymentId: normalizedPaymentId,
          },
        });

        // Bundled video credits reset (overwrite) to this plan's monthly
        // grant on every activation/renewal — unlike tokens above, they
        // never carry forward. topupCredits is untouched.
        await creditBundledCredits(tx, {
          userId: subscription.userId,
          monthlyVideoCredits: subscription.plan.monthlyVideoCredits,
          referenceId: `one_time_subscription_activation_${subscription.id}`,
          meta: { reason: "ONE_TIME_PAYMENT_SUCCESS", orderId, paymentId: normalizedPaymentId },
        });

        return this.billingService.createPaymentAndInvoice(tx, {
          userId: subscription.userId,
          walletId: wallet.id,
          subscriptionId: subscription.id,
          type: "ONE_TIME",
          providerOrderId: String(orderId),
          providerPaymentId: normalizedPaymentId,
          amount,
        });
      });

      if (paymentId) {
        await this.invoiceService.generateAndUploadInvoice(paymentId);
      }
      await this.billingService.markWebhookEvent(webhookEvent?.id, "PROCESSED");
      return { ignored: false, processed: "success" };
    }

    if (failed) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          autoRenew: false,
          lastPaymentId: normalizedPaymentId ?? String(orderId),
        },
      });
      await this.billingService.markPaymentFailed({
        userId: subscription.userId,
        type: "ONE_TIME",
        subscriptionId: subscription.id,
        providerOrderId: String(orderId),
        providerPaymentId: normalizedPaymentId,
        amount: Number(
          subscription.billingCycle === "MONTHLY"
            ? subscription.plan.monthlyPrice
            : subscription.billingCycle === "QUARTERLY"
              ? subscription.plan.quarterlyPrice
              : subscription.plan.yearlyPrice,
        ),
      });
      await this.billingService.markWebhookEvent(webhookEvent?.id, "PROCESSED");
      return { ignored: false, processed: "failed" };
    }

    return { ignored: true, reason: "Unhandled event" };
  }
}

export default PaymentService;

