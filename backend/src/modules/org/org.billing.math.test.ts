import test from "node:test";
import assert from "node:assert/strict";
import { CYCLE_MONTHS, cycleBase, prorateSeatAdd, withGst } from "./org.billing.math.js";

test("withGst adds tax on top and rounds once to paise", () => {
  const a = withGst(1000, 18);
  assert.deepEqual(a, { baseAmount: 1000, taxPercent: 18, taxAmount: 180, totalAmount: 1180 });

  // 333.33 * 18% = 59.9994 -> 60.00; total is the sum of the rounded parts.
  const b = withGst(333.33, 18);
  assert.equal(b.taxAmount, 60);
  assert.equal(b.totalAmount, 393.33);
});

test("withGst with a 0% rate charges no tax", () => {
  assert.equal(withGst(500, 0).totalAmount, 500);
});

test("cycleBase bills seats x monthly price x months", () => {
  assert.equal(cycleBase(10, 499, CYCLE_MONTHS.MONTHLY), 4990);
  assert.equal(cycleBase(10, 499, CYCLE_MONTHS.QUARTERLY), 14970);
  assert.equal(cycleBase(10, 499, CYCLE_MONTHS.YEARLY), 59880);
});

const DAY = 86_400_000;
const start = new Date("2026-01-01T00:00:00Z");
const end = new Date(start.getTime() + 30 * DAY);

test("prorateSeatAdd charges the full period when added on day 0", () => {
  const p = prorateSeatAdd({ extraSeats: 2, pricePerSeat: 500, months: 1, periodStart: start, periodEnd: end, now: start });
  assert.equal(p.totalDays, 30);
  assert.equal(p.remainingDays, 30);
  assert.equal(p.base, 1000);
});

test("prorateSeatAdd charges half when half the period is left", () => {
  const now = new Date(start.getTime() + 15 * DAY);
  const p = prorateSeatAdd({ extraSeats: 2, pricePerSeat: 500, months: 1, periodStart: start, periodEnd: end, now });
  assert.equal(p.remainingDays, 15);
  assert.equal(p.base, 500);
});

test("prorateSeatAdd rounds a part day up and never goes negative", () => {
  const nearlyOver = new Date(end.getTime() - DAY / 2);
  assert.equal(
    prorateSeatAdd({ extraSeats: 1, pricePerSeat: 300, months: 1, periodStart: start, periodEnd: end, now: nearlyOver }).remainingDays,
    1,
  );
  const afterEnd = new Date(end.getTime() + 5 * DAY);
  const p = prorateSeatAdd({ extraSeats: 1, pricePerSeat: 300, months: 1, periodStart: start, periodEnd: end, now: afterEnd });
  assert.equal(p.remainingDays, 0);
  assert.equal(p.base, 0);
});

test("prorateSeatAdd never charges more than the full period", () => {
  const before = new Date(start.getTime() - 10 * DAY);
  const p = prorateSeatAdd({ extraSeats: 1, pricePerSeat: 300, months: 1, periodStart: start, periodEnd: end, now: before });
  assert.equal(p.remainingDays, 30);
  assert.equal(p.base, 300);
});
