export const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as const;
export type BillingCycle = keyof typeof CYCLE_MONTHS;

export const GRACE_DAYS = 7;
/** Renewal invoices are issued this many days before the paid period ends. */
export const RENEWAL_LEAD_DAYS = 7;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Amounts {
  baseAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
}

/** GST is added on top of the base; every figure is rounded to paise once, here. */
export function withGst(base: number, gstPercent: number): Amounts {
  const baseAmount = round2(base);
  const taxAmount = round2((baseAmount * gstPercent) / 100);
  return { baseAmount, taxPercent: gstPercent, taxAmount, totalAmount: round2(baseAmount + taxAmount) };
}

/** pricePerSeat is per seat per MONTH; a cycle bills `months` of it. */
export function cycleBase(seats: number, pricePerSeat: number, months: number): number {
  return seats * pricePerSeat * months;
}

/**
 * Charge for adding seats part-way through a paid period: only the unexpired
 * share of the period, by whole days remaining (rounded up so the org never
 * gets a free partial day).
 */
export function prorateSeatAdd(params: {
  extraSeats: number;
  pricePerSeat: number;
  months: number;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const DAY = 86_400_000;
  const totalDays = Math.max(1, Math.round((params.periodEnd.getTime() - params.periodStart.getTime()) / DAY));
  const remainingDays = Math.min(totalDays, Math.max(0, Math.ceil((params.periodEnd.getTime() - now.getTime()) / DAY)));
  const fraction = remainingDays / totalDays;
  return {
    totalDays,
    remainingDays,
    base: cycleBase(params.extraSeats, params.pricePerSeat, params.months) * fraction,
  };
}
