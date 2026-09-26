import { createHash } from "crypto";

export type BillingCycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface CashfreePlanSource {
  id: number;
  name: string;
  monthlyPrice: unknown;
  quarterlyPrice: unknown;
  yearlyPrice: unknown;
  tokenLimit: number;
}

export function toPaise(amount: unknown): number {
  return Math.round(Number(amount) * 100);
}

function normalizeInrAmount(amount: unknown): number {
  return Number(Number(amount).toFixed(2));
}

function getCycleAmount(plan: CashfreePlanSource, billingCycle: BillingCycle): unknown {
  switch (billingCycle) {
    case "MONTHLY":
      return plan.monthlyPrice;
    case "QUARTERLY":
      return plan.quarterlyPrice;
    case "YEARLY":
      return plan.yearlyPrice;
  }
}

/**
 * Plan prices (Plan.monthlyPrice etc.) are stored tax-EXCLUSIVE — GST is
 * added on top here, at the single point where an amount is actually about
 * to be charged, rather than baked into the stored price. Callers must pass
 * the live CreditPricingConfig.gstPercent (same rate credit top-ups already
 * use) rather than hardcoding it, so a rate change take effect everywhere
 * at once.
 */
export function applyGst(baseAmount: number, gstPercent: number): number {
  return normalizeInrAmount(baseAmount * (1 + gstPercent / 100));
}

export function getCashfreePlanId(
  plan: CashfreePlanSource,
  billingCycle: BillingCycle,
  gstPercent: number,
): string {
  // gstPercent is part of the hash so a GST-rate change (not just a price
  // change) also produces a new plan_id — otherwise Cashfree would keep
  // treating it as the same already-registered plan while the amount we
  // send for it silently changed.
  const raw = `${plan.id}|${billingCycle}|${String(getCycleAmount(plan, billingCycle))}|${gstPercent}|${plan.tokenLimit}`;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 12);
  return `pl_${plan.id}_${billingCycle.toLowerCase()}_${hash}`.slice(0, 40);
}

export function getCashfreePlanRecurringAmountPaise(
  plan: CashfreePlanSource,
  billingCycle: BillingCycle,
  gstPercent: number,
): number {
  // NOTE: despite historical name, Cashfree PG plan APIs expect INR amount units
  // (same as subscription create payload), not paise.
  return applyGst(normalizeInrAmount(getCycleAmount(plan, billingCycle)), gstPercent);
}

export function getCashfreePlanIntervalType(
  billingCycle: BillingCycle,
): "MONTH" | "YEAR" {
  switch (billingCycle) {
    case "MONTHLY":
      return "MONTH";
    case "QUARTERLY":
      // Cashfree periodic plans support MONTH with intervals=3 for quarterly cadence.
      return "MONTH";
    case "YEARLY":
      return "YEAR";
  }
}

export function getCashfreePlanIntervals(
  billingCycle: BillingCycle,
): number {
  return billingCycle === "QUARTERLY" ? 3 : 1;
}

