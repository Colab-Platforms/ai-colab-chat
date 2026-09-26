import { USD_PER_CREDIT, DEFAULT_USD_PER_TOKEN } from "./walletUtils.js";

export interface PlanPricingInput {
  /** Nominal USD price tag for the plan, tax-exclusive (e.g. 49 for "$49"). */
  priceUsd: number;
  /** % of priceUsd kept as margin — the rest is the real-cost budget split below. Default 50. */
  marginPercent?: number;
  /** % of the real-cost budget allocated to video credits; the remainder goes to chat/image/doc tokens. Default 50. */
  videoSplitPercent?: number;
  /** INR per USD used only to derive the displayed INR price — does not affect the credit/token math, which is entirely USD-denominated. */
  fxRate?: number;
  quarterlyMultiplier?: number;
  yearlyMultiplier?: number;
  /** Override the live video-credit peg — normally leave unset so it matches production billing (USD_PER_CREDIT). */
  usdPerCredit?: number;
  /** Override the live token peg — pass the current CreditPricingConfig.usdPerToken (via getUsdPerToken()) so this never drifts from what billing actually charges. */
  usdPerToken?: number;
}

export interface PlanPricingResult {
  priceUsd: number;
  marginPercent: number;
  videoSplitPercent: number;
  monthlyPriceInr: number;
  quarterlyPriceInr: number;
  yearlyPriceInr: number;
  realCostBudgetUsd: number;
  videoBudgetUsd: number;
  tokenBudgetUsd: number;
  monthlyVideoCredits: number;
  tokenLimit: number;
}

// Live USD/INR rate (update this when the real rate moves meaningfully —
// it only affects the displayed INR price via roundToPricePoint below, which
// absorbs small drift anyway, so this doesn't need to track the market tick
// by tick). Last set 2026-09-26 at Rs.95.81/$.
const DEFAULT_FX_RATE = 95.81;

/** Rounds an INR amount down to the nearest "...99" price point (Rs.1804 -> Rs.1799), matching the existing plans' pricing convention. */
function roundToPricePoint(amountInr: number): number {
  return Math.floor(amountInr / 100) * 100 - 1;
}

/**
 * The single generic pricing calculator every plan should be built from:
 * given a nominal USD price and a margin, it splits the real-cost budget
 * between video credits and chat/image/doc tokens using the SAME fixed
 * pegs billing actually runs on (USD_PER_CREDIT, usdPerToken) — so a plan
 * built from this function can never quietly drift out of its intended
 * margin the way hand-picking a tokenLimit/monthlyVideoCredits number and
 * hoping the math works out could.
 *
 * Changing a plan's price later means calling this again with the new
 * priceUsd and updating the plan's tokenLimit/monthlyVideoCredits/prices to
 * match the new result — the pegs themselves (usdPerCredit, usdPerToken)
 * never need to change just because a plan's price did.
 */
export function computePlanPricing(input: PlanPricingInput): PlanPricingResult {
  const marginPercent = input.marginPercent ?? 50;
  const videoSplitPercent = input.videoSplitPercent ?? 50;
  const fxRate = input.fxRate ?? DEFAULT_FX_RATE;
  const usdPerCredit = input.usdPerCredit ?? USD_PER_CREDIT;
  const usdPerToken = input.usdPerToken ?? DEFAULT_USD_PER_TOKEN;
  const quarterlyMultiplier = input.quarterlyMultiplier ?? 3;
  const yearlyMultiplier = input.yearlyMultiplier ?? 12;

  const realCostBudgetUsd = input.priceUsd * (marginPercent / 100);
  const videoBudgetUsd = realCostBudgetUsd * (videoSplitPercent / 100);
  const tokenBudgetUsd = realCostBudgetUsd - videoBudgetUsd;

  const monthlyVideoCredits = Math.floor(videoBudgetUsd / usdPerCredit);
  const tokenLimit = Math.floor(tokenBudgetUsd / usdPerToken);

  const monthlyPriceInr = roundToPricePoint(input.priceUsd * fxRate);

  return {
    priceUsd: input.priceUsd,
    marginPercent,
    videoSplitPercent,
    monthlyPriceInr,
    quarterlyPriceInr: monthlyPriceInr * quarterlyMultiplier,
    yearlyPriceInr: monthlyPriceInr * yearlyMultiplier,
    realCostBudgetUsd,
    videoBudgetUsd,
    tokenBudgetUsd,
    monthlyVideoCredits,
    tokenLimit,
  };
}
