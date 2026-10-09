import prisma from "@root/prisma";
import { creditBundledCredits } from "@/utils/walletUtils.js";

/**
 * One-off backfill for accounts that subscribed BEFORE the video-credit
 * wallet existed — their CreditWallet row was never created because nothing
 * has renewed/re-activated their subscription since. Safe to re-run: skips
 * any user who already has a CreditWallet row, so it only ever fills the
 * gap once per user and never re-resets an existing balance.
 */
export async function backfillCreditWallets() {
  console.log("🎬 Backfilling credit wallets for existing active subscriptions...");

  const activeSubscriptions = await prisma.subscription.findMany({
    where: { status: "ACTIVE" },
    include: { plan: true },
  });

  let created = 0;
  let skipped = 0;

  for (const sub of activeSubscriptions) {
    const existing = await prisma.creditWallet.findUnique({ where: { userId: sub.userId } });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.$transaction((tx) =>
      creditBundledCredits(tx, {
        userId: sub.userId,
        monthlyVideoCredits: sub.plan.monthlyVideoCredits,
        referenceId: `backfill_${sub.id}`,
        meta: { reason: "CREDIT_WALLET_BACKFILL", planId: sub.planId, planName: sub.plan.name },
      }),
    );
    created++;
  }

  console.log(`  ✅ Credit wallets backfilled: ${created} created, ${skipped} already existed`);
}
