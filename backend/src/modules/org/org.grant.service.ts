import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { grantSeatQuota } from "./org.quota.js";

/**
 * Monthly refill for org seats. A seat is due once its wallet window
 * (UserWallet.currentPeriodEnd, always one month see grantSeatQuota) has
 * passed, so the same query handles monthly, quarterly and yearly orgs and a
 * second run in the same window is a no-op.
 *
 * Only seats of an ACTIVE org with an ACTIVE subscription are refilled;
 * everything else simply stops receiving quota (billing lapse handling lives
 * with the subscription, not here).
 */
export async function grantDueOrgSeats(now = new Date()) {
  const due = await prisma.orgMember.findMany({
    where: {
      status: "ACTIVE",
      takesSeat: true,
      organization: {
        status: "ACTIVE",
        isDeleted: false,
        subscriptions: { some: { status: "ACTIVE" } },
      },
      user: {
        userWallet: { is: { OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }] } },
      },
    },
    include: { role: true, user: { select: { userWallet: true } } },
  });

  let granted = 0;
  let failed = 0;

  for (const m of due) {
    try {
      const prevEnd = m.user.userWallet?.currentPeriodEnd;
      // Anchor to the previous window so a late run never drifts the schedule.
      let start = prevEnd ?? now;
      let end = dayjs(start).add(1, "month");
      while (!end.isAfter(now)) {
        start = end.toDate();
        end = dayjs(start).add(1, "month");
      }

      await prisma.$transaction(async (tx) => {
        await grantSeatQuota(tx, {
          userId: m.userId,
          tokens: m.role.monthlyTokens,
          videoCredits: m.role.monthlyVideoCredits,
          periodStart: start,
          periodEnd: end.toDate(),
          reason: "ORG_MONTHLY_GRANT",
          meta: { orgId: m.orgId, roleId: m.orgRoleId },
        });
        // Admin top-ups are per-cycle extras: they don't carry into the new month.
        if (m.tokenBonus) await tx.orgMember.update({ where: { id: m.id }, data: { tokenBonus: 0 } });
      });
      granted++;
    } catch (e) {
      failed++;
      console.error(`[org-grant] failed for member ${m.id}:`, e);
    }
  }

  return { due: due.length, granted, failed };
}
