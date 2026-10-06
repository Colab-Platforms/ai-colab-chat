import {
  calculateAdjustedTokens,
  computeBillableTokens,
  createWalletTransaction,
  getUsdPerToken,
} from "@/utils/walletUtils.js";

/** Usage accumulated across every LLM call a content turn makes. */
export interface UsageTally {
  promptTokens: number;
  completionTokens: number;
  /** Sum of real costs; null as soon as any call failed to report one. */
  costUsd: number | null;
  calls: number;
}

export const newTally = (): UsageTally => ({
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  calls: 0,
});

export function addUsage(
  tally: UsageTally,
  usage: {
    promptTokens: number;
    completionTokens: number;
    costUsd: number | null;
  },
) {
  tally.promptTokens += usage.promptTokens;
  tally.completionTokens += usage.completionTokens;
  tally.calls += 1;
  // One call without a reported cost makes the sum unreliable - fall back to
  // the multiplier path rather than under-billing.
  tally.costUsd =
    tally.costUsd === null || usage.costUsd === null
      ? null
      : tally.costUsd + usage.costUsd;
}

/**
 * Bills a whole content turn as ONE UsageLog + wallet debit, matching how a
 * normal chat turn is recorded. Runs inside the caller's transaction so the
 * saved content and the charge commit together.
 */
export async function settleUsage(
  tx: any,
  params: {
    userId: number;
    model: { id: number; tokenMultiplier: number | null };
    chatId?: number | null;
    messageId?: number | null;
    tally: UsageTally;
    referenceId: string;
    reason: string;
  },
) {
  const { userId, model, tally } = params;
  const usdPerToken = await getUsdPerToken();
  const multiplier = model.tokenMultiplier ?? 1.0;

  const billable = computeBillableTokens({
    rawPromptTokens: tally.promptTokens,
    rawCompletionTokens: tally.completionTokens,
    costUsd: tally.costUsd,
    tokenMultiplier: multiplier,
    usdPerToken,
  });

  const wallet = await tx.userWallet.findUnique({ where: { userId } });
  const adjusted = calculateAdjustedTokens(
    wallet?.tokensRemaining ?? 0,
    billable.billablePromptTokens,
    billable.billableCompletionTokens,
    multiplier,
    tally.promptTokens,
    tally.completionTokens,
  );

  await tx.usageLog.create({
    data: {
      userId,
      modelId: model.id,
      chatId: params.chatId ?? null,
      messageId: params.messageId ?? null,
      capability: "STANDARD",
      promptTokens: adjusted.finalRawPrompt,
      completionTokens: adjusted.finalRawCompletion,
      totalTokens: adjusted.finalRawTotal,
      billablePromptTokens: adjusted.finalBillablePrompt,
      billableCompletionTokens: adjusted.finalBillableCompletion,
      billableTotalTokens: adjusted.finalBillableTotal,
    },
  });

  if (wallet && adjusted.finalBillableTotal > 0) {
    const updated = await tx.userWallet.update({
      where: { userId },
      data: {
        tokensRemaining: { decrement: adjusted.finalBillableTotal },
        tokensUsed: { increment: adjusted.finalBillableTotal },
      },
    });
    await createWalletTransaction(tx, {
      userId,
      walletId: updated.id,
      amount: adjusted.finalBillableTotal,
      type: "DEBIT",
      referenceId: params.referenceId,
      meta: {
        reason: params.reason,
        chatId: params.chatId ?? null,
        messageId: params.messageId ?? null,
        llmCalls: tally.calls,
      },
    });
  }

  return adjusted;
}
