import cron from "node-cron";
import prisma from "@root/prisma.js";
import dayjs from "dayjs";
import { createWalletTransaction, creditBundledCredits } from "@/utils/walletUtils.js";

// Monthly token reset — runs at midnight on the 1st of every month
const task = () => {
    cron.schedule("0 0 1 * *", async () => {
        console.log("🔄 Running monthly token reset...");

        try {
            const activeSubscriptions = await prisma.subscription.findMany({
                where: { status: "ACTIVE" },
                include: { plan: true },
            });

            for (const sub of activeSubscriptions) {
                await prisma.$transaction(async (tx) => {
                    const wallet = await tx.userWallet.findUnique({
                        where: { userId: sub.userId },
                    });

                    if (wallet && wallet.tokensRemaining > 0) {
                        const unusedTokens = wallet.tokensRemaining;
                        await tx.userWallet.update({
                            where: { id: wallet.id },
                            data: { tokensRemaining: 0 },
                        });

                        await createWalletTransaction(tx, {
                            userId: sub.userId,
                            walletId: wallet.id,
                            amount: unusedTokens,
                            type: "DEBIT",
                            meta: { reason: "MONTHLY_TOKEN_RESET_CLEAR", planId: sub.planId },
                        });
                    }

                    const updatedWallet = await tx.userWallet.update({
                        where: { userId: sub.userId },
                        data: {
                            tokensRemaining: sub.plan.tokenLimit,
                            tokensUsed: 0,
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: dayjs().add(1, "month").toDate(),
                        },
                    });

                    await createWalletTransaction(tx, {
                        userId: sub.userId,
                        walletId: updatedWallet.id,
                        amount: sub.plan.tokenLimit,
                        type: "CREDIT",
                        meta: { reason: "MONTHLY_TOKEN_RESET_CREDIT", planId: sub.planId },
                    });

                    // Bundled video credits reset (overwrite) alongside tokens —
                    // topupCredits is untouched by creditBundledCredits.
                    await creditBundledCredits(tx, {
                        userId: sub.userId,
                        monthlyVideoCredits: sub.plan.monthlyVideoCredits,
                        meta: { reason: "MONTHLY_CREDIT_RESET", planId: sub.planId },
                    });
                });
            }

            console.log(`✅ Token reset completed for ${activeSubscriptions.length} subscriptions`);
        } catch (error) {
            console.error("❌ Token reset cron error:", error);
        }
    });
};

export default task;
