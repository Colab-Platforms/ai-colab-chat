import dayjs from "dayjs";
import type { Prisma } from "@prisma/client";
import { createWalletTransaction, creditBundledCredits } from "@/utils/walletUtils.js";

/**
 * Seat wallet funding. Each org seat keeps its own UserWallet / CreditWallet  
 * the org only tops them up so none of the chat/doc/image/video deduction
 * code needs to know about orgs.
 */

/**
 * Overwrites a seat's balances with its role's grant, the same "clear leftover
 * then credit" shape the monthly personal reset uses.
 */
export async function grantSeatQuota(
  tx: Prisma.TransactionClient,
  params: {
    userId: number;
    tokens: number;
    videoCredits: number;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    reason: string;
    meta?: Record<string, unknown>;
  },
) {
  const { userId, tokens, videoCredits, reason } = params;
  const meta = { reason, ...(params.meta ?? {}) };

  let wallet = await tx.userWallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await tx.userWallet.create({ data: { userId, tokensRemaining: 0, tokensUsed: 0 } });
  }

  if (wallet.tokensRemaining > 0) {
    await createWalletTransaction(tx, {
      userId,
      walletId: wallet.id,
      amount: wallet.tokensRemaining,
      type: "DEBIT",
      meta: { ...meta, step: "CLEAR_LEFTOVER" },
    });
  }

  // Seats refill monthly no matter how the org is billed (monthly/quarterly/
  // yearly), so the wallet window is always one month; the grant cron keys off it.
  const periodStart = params.periodStart ?? new Date();
  const updated = await tx.userWallet.update({
    where: { id: wallet.id },
    data: {
      tokensRemaining: tokens,
      tokensUsed: 0,
      currentPeriodStart: periodStart,
      currentPeriodEnd: params.periodEnd ?? dayjs(periodStart).add(1, "month").toDate(),
    },
  });

  if (tokens > 0) {
    await createWalletTransaction(tx, {
      userId,
      walletId: updated.id,
      amount: tokens,
      type: "CREDIT",
      meta: { ...meta, step: "GRANT" },
    });
  }

  const creditWallet = await tx.creditWallet.findUnique({ where: { userId } });
  if (videoCredits > 0 || (creditWallet && creditWallet.bundledCredits > 0)) {
    await creditBundledCredits(tx, { userId, monthlyVideoCredits: videoCredits, meta });
  }
}

/** Zeroes what the org funded when a seat is suspended or removed. */
export async function revokeSeatQuota(tx: Prisma.TransactionClient, userId: number, reason: string) {
  const wallet = await tx.userWallet.findUnique({ where: { userId } });
  if (wallet && wallet.tokensRemaining > 0) {
    await createWalletTransaction(tx, {
      userId,
      walletId: wallet.id,
      amount: wallet.tokensRemaining,
      type: "DEBIT",
      meta: { reason },
    });
    await tx.userWallet.update({ where: { id: wallet.id }, data: { tokensRemaining: 0 } });
  }

  const creditWallet = await tx.creditWallet.findUnique({ where: { userId } });
  if (creditWallet && creditWallet.bundledCredits > 0) {
    await creditBundledCredits(tx, { userId, monthlyVideoCredits: 0, meta: { reason } });
  }
}

/**
 * Moves a seat's current balances by a delta without a full reset used when a
 * role's quota is edited with "apply now", and for admin top-ups. Never goes below 0.
 */
export async function adjustSeatQuota(
  tx: Prisma.TransactionClient,
  params: { userId: number; tokenDelta?: number; creditDelta?: number; reason: string; meta?: Record<string, unknown> },
) {
  const meta = { reason: params.reason, ...(params.meta ?? {}) };

  if (params.tokenDelta) {
    const wallet = await tx.userWallet.findUnique({ where: { userId: params.userId } });
    if (wallet) {
      const next = Math.max(0, wallet.tokensRemaining + params.tokenDelta);
      const applied = next - wallet.tokensRemaining;
      if (applied !== 0) {
        await tx.userWallet.update({ where: { id: wallet.id }, data: { tokensRemaining: next } });
        await createWalletTransaction(tx, {
          userId: params.userId,
          walletId: wallet.id,
          amount: Math.abs(applied),
          type: applied > 0 ? "CREDIT" : "DEBIT",
          meta,
        });
      }
    }
  }

  if (params.creditDelta) {
    const cw = await tx.creditWallet.findUnique({ where: { userId: params.userId } });
    const next = Math.max(0, (cw?.bundledCredits ?? 0) + params.creditDelta);
    if (next !== (cw?.bundledCredits ?? 0)) {
      await creditBundledCredits(tx, { userId: params.userId, monthlyVideoCredits: next, meta });
    }
  }
}
