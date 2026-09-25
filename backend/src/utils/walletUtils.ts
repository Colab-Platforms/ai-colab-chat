import { Prisma, WalletTransactionType, CreditTransactionType } from "@prisma/client";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";

interface CreateWalletTransactionParams {
  userId: number;
  walletId: number;
  amount: number;
  type: WalletTransactionType;
  referenceId?: string;
  meta?: any;
}

/**
 * Creates a WalletTransaction record within an existing Prisma transaction.
 * 
 * @param tx The Prisma transaction client
 * @param params Details of the wallet transaction
 */
export async function createWalletTransaction(
  tx: Prisma.TransactionClient,
  params: CreateWalletTransactionParams
) {
  return await tx.walletTransaction.create({
    data: {
      userId: params.userId,
      walletId: params.walletId,
      amount: params.amount,
      type: params.type,
      referenceId: params.referenceId,
      meta: params.meta,
    },
  });
}

/**
 * Calculates adjusted token usage when the user balance is insufficient.
 */
export function calculateAdjustedTokens(
  availableTokens: number,
  billablePrompt: number,
  billableCompletion: number,
  _tokenMultiplier: number = 1.0,
  rawPrompt: number = billablePrompt,
  rawCompletion: number = billableCompletion,
) {
  const actualAvailable = Math.max(0, availableTokens);
  const requestedTotal = billablePrompt + billableCompletion;
  const rawTotal = rawPrompt + rawCompletion;

  if (requestedTotal <= actualAvailable) {
    return {
      finalBillablePrompt: billablePrompt,
      finalBillableCompletion: billableCompletion,
      finalBillableTotal: requestedTotal,
      finalRawPrompt: rawPrompt,
      finalRawCompletion: rawCompletion,
      finalRawTotal: rawTotal,
    };
  }

  // Capped at available — scale the raw counts down proportionally so
  // promptTokens/completionTokens stay consistent with what was billed.
  // (Unreachable when tokenMultiplier is 0, since billable is always 0 then.)
  let finalBillablePrompt = billablePrompt;
  let finalBillableCompletion = billableCompletion;

  if (billablePrompt >= actualAvailable) {
    finalBillablePrompt = actualAvailable;
    finalBillableCompletion = 0;
  } else {
    finalBillablePrompt = billablePrompt;
    finalBillableCompletion = actualAvailable - billablePrompt;
  }

  const finalBillableTotal = finalBillablePrompt + finalBillableCompletion;
  const scale = requestedTotal > 0 ? finalBillableTotal / requestedTotal : 0;

  return {
    finalBillablePrompt,
    finalBillableCompletion,
    finalBillableTotal,
    finalRawPrompt: Math.ceil(rawPrompt * scale),
    finalRawCompletion: Math.ceil(rawCompletion * scale),
    finalRawTotal: Math.ceil(rawTotal * scale),
  };
}

interface DebitTokensParams {
  userId: number;
  walletId: number;
  amount: number;
  referenceId?: string;
  meta?: any;
}

/**
 * Shared token-wallet debit — decrements tokensRemaining, increments
 * tokensUsed, and logs the WalletTransaction, all inside the caller's
 * transaction. Replaces the copy-pasted decrement/increment/log block that
 * used to be duplicated at every chat.stream.ts and video.service.ts call
 * site.
 */
export async function debitTokens(tx: Prisma.TransactionClient, params: DebitTokensParams) {
  await tx.userWallet.update({
    where: { userId: params.userId },
    data: {
      tokensRemaining: { decrement: params.amount },
      tokensUsed: { increment: params.amount },
    },
  });

  await createWalletTransaction(tx, {
    userId: params.userId,
    walletId: params.walletId,
    amount: params.amount,
    type: "DEBIT",
    referenceId: params.referenceId,
    meta: params.meta,
  });
}

interface CreateCreditTransactionParams {
  userId: number;
  walletId: number;
  amount: number;
  type: CreditTransactionType;
  referenceId?: string;
  meta?: any;
}

export async function createCreditTransaction(
  tx: Prisma.TransactionClient,
  params: CreateCreditTransactionParams,
) {
  return await tx.creditTransaction.create({
    data: {
      userId: params.userId,
      walletId: params.walletId,
      amount: params.amount,
      type: params.type,
      referenceId: params.referenceId,
      meta: params.meta,
    },
  });
}

interface DebitCreditsParams {
  userId: number;
  amount: number;
  referenceId?: string;
  meta?: any;
}

/**
 * Debits video credits, spending bundledCredits first and only reaching into
 * topupCredits for whatever the bundled balance can't cover — bundled
 * credits reset to zero value every renewal, so they should be the first
 * thing burned, leaving paid-for topupCredits untouched as long as possible.
 * Throws if the combined balance can't cover the amount.
 */
export interface DebitCreditsResult {
  fromBundled: number;
  fromTopup: number;
  bundledRemaining: number;
  topupRemaining: number;
  totalRemaining: number;
}

export async function debitCredits(
  tx: Prisma.TransactionClient,
  params: DebitCreditsParams,
): Promise<DebitCreditsResult> {
  const wallet = await tx.creditWallet.findUnique({ where: { userId: params.userId } });
  const available = (wallet?.bundledCredits ?? 0) + (wallet?.topupCredits ?? 0);

  if (!wallet || available < params.amount) {
    throw new ApiError(
      `Insufficient video credits — this needs ${params.amount} credits, you have ${available}.`,
      STATUS_CODES.BAD_REQUEST,
    );
  }

  const fromBundled = Math.min(wallet.bundledCredits, params.amount);
  const fromTopup = params.amount - fromBundled;

  const updated = await tx.creditWallet.update({
    where: { userId: params.userId },
    data: {
      bundledCredits: { decrement: fromBundled },
      topupCredits: { decrement: fromTopup },
      creditsUsed: { increment: params.amount },
    },
  });

  await createCreditTransaction(tx, {
    userId: params.userId,
    walletId: wallet.id,
    amount: params.amount,
    type: "DEBIT",
    referenceId: params.referenceId,
    meta: params.meta,
  });

  // Returned so callers can log exactly which pool absorbed the spend —
  // useful when debugging why bundled credits ran out sooner than expected.
  return {
    fromBundled,
    fromTopup,
    bundledRemaining: updated.bundledCredits,
    topupRemaining: updated.topupCredits,
    totalRemaining: updated.bundledCredits + updated.topupCredits,
  };
}

/**
 * Resets bundledCredits to the plan's monthly grant (overwrite, not
 * increment) — called on subscription activation/renewal. topupCredits is
 * never touched here.
 */
export async function creditBundledCredits(
  tx: Prisma.TransactionClient,
  params: { userId: number; monthlyVideoCredits: number; referenceId?: string; meta?: any },
) {
  const wallet = await tx.creditWallet.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, bundledCredits: params.monthlyVideoCredits },
    update: { bundledCredits: params.monthlyVideoCredits },
  });

  await createCreditTransaction(tx, {
    userId: params.userId,
    walletId: wallet.id,
    amount: params.monthlyVideoCredits,
    type: "CREDIT_BUNDLED",
    referenceId: params.referenceId,
    meta: params.meta,
  });
}

/**
 * Refunds previously-debited credits (e.g. a failed video generation).
 * Always refunds into topupCredits rather than bundledCredits: bundled
 * credits reset to zero value on every renewal regardless of history, so a
 * refund landing there could be wiped before the user ever gets to use it.
 * topupCredits never resets, so a refund parked there is never lost.
 *
 * Use this for a FULL refund of a debit (nothing was consumed — e.g. a
 * generation that never ran). For a PARTIAL refund of a debit that already
 * paid for something real, use refundCreditsToSource instead — dumping a
 * partial refund into topupCredits while the original spend came out of
 * bundledCredits silently drains a user's monthly allowance and inflates
 * their top-up balance with credits they never bought.
 */
export async function refundCredits(
  tx: Prisma.TransactionClient,
  params: { userId: number; amount: number; referenceId?: string; meta?: any },
) {
  const wallet = await tx.creditWallet.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, topupCredits: params.amount },
    update: {
      topupCredits: { increment: params.amount },
      creditsUsed: { decrement: params.amount },
    },
  });

  await createCreditTransaction(tx, {
    userId: params.userId,
    walletId: wallet.id,
    amount: params.amount,
    type: "CREDIT_TOPUP",
    referenceId: params.referenceId,
    meta: params.meta,
  });
}

/**
 * Refunds credits back into the SAME pools they were originally debited
 * from, up to `bundledPortion` going back to bundledCredits and the rest to
 * topupCredits — mirrors the original debit split instead of always
 * crediting topupCredits. Needed for reconciliation refunds (the reservation
 * came out of bundled+topup in some ratio; a partial refund should undo that
 * ratio, not silently convert bundled spend into topup credit).
 */
export async function refundCreditsToSource(
  tx: Prisma.TransactionClient,
  params: { userId: number; amount: number; bundledPortion: number; referenceId?: string; meta?: any },
) {
  const toBundled = Math.max(0, Math.min(params.bundledPortion, params.amount));
  const toTopup = params.amount - toBundled;

  const wallet = await tx.creditWallet.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, bundledCredits: toBundled, topupCredits: toTopup },
    update: {
      bundledCredits: { increment: toBundled },
      topupCredits: { increment: toTopup },
      creditsUsed: { decrement: params.amount },
    },
  });

  await createCreditTransaction(tx, {
    userId: params.userId,
    walletId: wallet.id,
    amount: params.amount,
    type: "CREDIT_TOPUP",
    referenceId: params.referenceId,
    meta: { ...params.meta, refundedToBundled: toBundled, refundedToTopup: toTopup },
  });
}

// 1 credit's real-world cost basis — $0.03, pegged to 1 second of Seedance
// 2.0 Mini at 480p text-to-video (the cheapest video model/resolution). This
// is fixed by design, unlike CreditPricingConfig.costPerCreditInr (the same
// figure converted to INR at the FX rate used when pricing was set, which
// can be re-tuned without touching this USD peg).
export const USD_PER_CREDIT = 0.03;

/** For logging/debugging: what N credits actually cost in USD and INR. */
export function creditsToCostBreakdown(credits: number, costPerCreditInr: number) {
  return {
    credits,
    usd: Number((credits * USD_PER_CREDIT).toFixed(4)),
    inr: Number((credits * costPerCreditInr).toFixed(2)),
  };
}

/**
 * Converts a top-up payment into a credit count: strip GST, take the
 * configured margin off the top, then convert whatever's left to credits at
 * raw cost. The single source of truth for this math — the webhook and the
 * frontend's live preview must agree exactly, or a user could see one
 * number and be charged for another.
 */
export function calculateTopUpCredits(
  amountInr: number,
  pricing: { costPerCreditInr: number; marginPercent: number; gstPercent: number },
): number {
  const preTax = amountInr / (1 + pricing.gstPercent / 100);
  const netOfMargin = preTax * (1 - pricing.marginPercent / 100);
  return Math.floor(netOfMargin / pricing.costPerCreditInr);
}

/**
 * Adds paid top-up credits — always additive, never reset by renewal.
 */
export async function creditTopupCredits(
  tx: Prisma.TransactionClient,
  params: { userId: number; amount: number; referenceId?: string; meta?: any },
) {
  const wallet = await tx.creditWallet.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, topupCredits: params.amount },
    update: { topupCredits: { increment: params.amount } },
  });

  await createCreditTransaction(tx, {
    userId: params.userId,
    walletId: wallet.id,
    amount: params.amount,
    type: "CREDIT_TOPUP",
    referenceId: params.referenceId,
    meta: params.meta,
  });
}
