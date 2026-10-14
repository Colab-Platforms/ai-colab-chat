import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { createWalletTransaction, creditBundledCredits } from "@/utils/walletUtils.js";

/**
 * Yearly one-time plans: the user pays for 12 months up front (no autopay) and
 * each month's tokens + bundled video credits are ADDED to their balance on the
 * monthly anniversary of the purchase. Unused balance is never wiped (unlike
 * monthly plans, which reset). The first month is granted at payment time by the
 * Cashfree webhook (payment.service.ts); this file handles months 2..N.
 */

/** Month `issued` is due at anchor + `issued` months (anchored, so no day-of-month drift). */
export const nextGrantDate = (anchor: Date, issued: number) =>
  dayjs(anchor).add(issued, "month").toDate();

/**
 * Grant bookkeeping for a yearly subscription. Rows created before this feature
 * have no anchor: they were refilled by the old calendar-month token reset, so
 * count every month since they started as already given and carry on from there.
 */
export function grantStateFor(
  sub: { grantAnchorAt: Date | null; grantsIssued: number; startedAt: Date },
  now: Date,
) {
  if (sub.grantAnchorAt) return { anchor: sub.grantAnchorAt, issued: sub.grantsIssued };
  return { anchor: sub.startedAt, issued: dayjs(now).diff(sub.startedAt, "month") + 1 };
}

const YEARLY_ONE_TIME = { billingCycle: "YEARLY", autoRenew: false } as const;

async function adoptLegacySubscriptions(now: Date) {
  const legacy = await prisma.subscription.findMany({
    where: { ...YEARLY_ONE_TIME, status: "ACTIVE", grantAnchorAt: null, expiresAt: { not: null } },
    select: { id: true, startedAt: true, grantsIssued: true, grantAnchorAt: true },
  });
  for (const sub of legacy) {
    const { anchor, issued } = grantStateFor(sub, now);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { grantAnchorAt: anchor, grantsIssued: issued, nextGrantAt: nextGrantDate(anchor, issued) },
    });
  }
  return legacy.length;
}

/** Grants one month. Returns false if another run already claimed it. */
async function grantOneMonth(
  sub: { id: number; userId: number; planId: number; expiresAt: Date; plan: { tokenLimit: number; monthlyVideoCredits: number } },
  anchor: Date,
  issued: number,
  now: Date,
) {
  const due = nextGrantDate(anchor, issued);
  const following = nextGrantDate(anchor, issued + 1);
  const periodEnd = following < sub.expiresAt ? following : sub.expiresAt;

  return prisma.$transaction(async (tx) => {
    // Compare-and-set on grantsIssued: if the cron overlaps itself or the manual
    // script runs at the same time, only one of them gets to grant this month.
    const claimed = await tx.subscription.updateMany({
      where: { id: sub.id, status: "ACTIVE", grantsIssued: issued },
      data: { grantsIssued: { increment: 1 }, nextGrantAt: following },
    });
    if (claimed.count === 0) return false;

    const wallet = await tx.userWallet.upsert({
      where: { userId: sub.userId },
      create: {
        userId: sub.userId,
        tokensRemaining: sub.plan.tokenLimit,
        tokensUsed: 0,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      update: {
        tokensRemaining: { increment: sub.plan.tokenLimit },
        tokensUsed: 0,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await createWalletTransaction(tx, {
      userId: sub.userId,
      walletId: wallet.id,
      amount: sub.plan.tokenLimit,
      type: "CREDIT",
      referenceId: `yearly_grant_${sub.id}_${issued}`,
      meta: { reason: "YEARLY_MONTHLY_GRANT", planId: sub.planId, monthNumber: issued + 1, dueAt: due },
    });

    if (sub.plan.monthlyVideoCredits > 0) {
      await creditBundledCredits(tx, {
        userId: sub.userId,
        monthlyVideoCredits: sub.plan.monthlyVideoCredits,
        mode: "add",
        referenceId: `yearly_grant_${sub.id}_${issued}`,
        meta: { reason: "YEARLY_MONTHLY_GRANT", planId: sub.planId, monthNumber: issued + 1 },
      });
    }
    return true;
  });
}

/**
 * Grants every month that has come due for active yearly one-time subscriptions.
 * If the server missed some months, each missed month is granted (they are
 * additive, so nothing is lost by catching up). Safe to call repeatedly.
 */
export async function grantDueYearlyMonths(now = new Date()) {
  const adopted = await adoptLegacySubscriptions(now);

  const subs = await prisma.subscription.findMany({
    where: {
      ...YEARLY_ONE_TIME,
      status: "ACTIVE",
      grantAnchorAt: { not: null },
      nextGrantAt: { lte: now },
      expiresAt: { gt: now },
    },
    include: { plan: { select: { tokenLimit: true, monthlyVideoCredits: true } } },
  });

  let months = 0;
  let subscriptions = 0;
  for (const sub of subs) {
    const expiresAt = sub.expiresAt!;
    const anchor = sub.grantAnchorAt!;
    let issued = sub.grantsIssued;
    let grantedForSub = 0;
    try {
      // A month is only granted while it falls before the plan's end.
      while (nextGrantDate(anchor, issued) <= now && nextGrantDate(anchor, issued) < expiresAt) {
        const ok = await grantOneMonth({ ...sub, expiresAt }, anchor, issued, now);
        if (!ok) break;
        issued += 1;
        grantedForSub += 1;
      }
    } catch (error) {
      console.error(`[yearly-grant] failed for subscription=${sub.id}:`, error);
    }
    if (grantedForSub > 0) {
      subscriptions += 1;
      months += grantedForSub;
    }
  }

  return { adopted, subscriptions, months };
}
