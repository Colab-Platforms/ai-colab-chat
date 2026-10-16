import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import type { OrgBillKind, Prisma } from "@prisma/client";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import PaymentCashfreeService from "@/modules/payments/payment.cashfree.service.js";
import { grantSeatQuota, revokeSeatQuota } from "./org.quota.js";
import { countSeatsInUse } from "./org.service.js";
import { renderOrgBillPdf, sendOrgBillEmail } from "./org.invoice.service.js";
import {
  CYCLE_MONTHS,
  GRACE_DAYS,
  RENEWAL_LEAD_DAYS,
  cycleBase,
  prorateSeatAdd,
  withGst,
  type BillingCycle,
} from "./org.billing.math.js";

type Db = Prisma.TransactionClient | typeof prisma;

const billNumber = (id: number) => `OB-${dayjs().format("YYYYMM")}-${String(id).padStart(6, "0")}`;

async function gstPercent(db: Db): Promise<number> {
  const cfg = await db.creditPricingConfig.findFirst({ orderBy: { id: "desc" } });
  return cfg ? Number(cfg.gstPercent) : 18;
}

const currentSub = (db: Db, orgId: number) =>
  db.orgSubscription.findFirst({
    where: { orgId, status: { in: ["ACTIVE", "PENDING", "EXPIRED"] } },
    orderBy: { createdAt: "desc" },
  });

/** Creates the bill row (number assigned from its id). Callers do PDF + email after commit. */
async function createBill(
  db: Db,
  p: {
    orgId: number;
    orgSubscriptionId: number;
    kind: OrgBillKind;
    seats: number;
    pricePerSeat: number;
    months: number;
    periodStart: Date;
    periodEnd: Date;
    base: number;
    dueDate: Date;
    meta?: Record<string, unknown>;
  },
) {
  const amounts = withGst(p.base, await gstPercent(db));
  const bill = await db.orgBill.create({
    data: {
      orgId: p.orgId,
      orgSubscriptionId: p.orgSubscriptionId,
      number: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: p.kind,
      seats: p.seats,
      pricePerSeat: p.pricePerSeat,
      months: p.months,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      dueDate: p.dueDate,
      meta: (p.meta ?? undefined) as any,
      ...amounts,
    },
  });
  return db.orgBill.update({ where: { id: bill.id }, data: { number: billNumber(bill.id) } });
}

/** Issue = after the DB commit: render PDF, email it. Never throws. */
async function issue(billId: number) {
  const pdf = await renderOrgBillPdf(billId);
  await sendOrgBillEmail(billId, "ISSUED", pdf);
}

type Actor = { userId: number; orgId: number; ip?: string };

class OrgBillingService {
  private cashfree = new PaymentCashfreeService();

  // ── Creating bills ───────────────────────────────────────────────────────

  /** First bill of a new org (called inside org creation's transaction). */
  async createInitialBill(
    tx: Prisma.TransactionClient,
    sub: { id: number; orgId: number; seatsPurchased: number; pricePerSeat: unknown; billingCycle: BillingCycle },
  ) {
    const months = CYCLE_MONTHS[sub.billingCycle];
    const start = new Date();
    return createBill(tx, {
      orgId: sub.orgId,
      orgSubscriptionId: sub.id,
      kind: "INITIAL",
      seats: sub.seatsPurchased,
      pricePerSeat: Number(sub.pricePerSeat),
      months,
      periodStart: start,
      periodEnd: dayjs(start).add(months, "month").toDate(),
      base: cycleBase(sub.seatsPurchased, Number(sub.pricePerSeat), months),
      dueDate: dayjs(start).add(RENEWAL_LEAD_DAYS, "day").toDate(),
    });
  }

  issueBill = issue;

  // ── Overview for the org owner ───────────────────────────────────────────
  async getOverview(orgId: number) {
    const sub = await currentSub(prisma, orgId);
    if (!sub) throw new ApiError("No subscription found", STATUS_CODES.NOT_FOUND);
    const [seatsInUse, bills] = await Promise.all([
      countSeatsInUse(prisma, orgId),
      prisma.orgBill.findMany({ where: { orgId, status: { not: "VOID" } }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const overdue = sub.status === "ACTIVE" && !!sub.currentPeriodEnd && sub.currentPeriodEnd < new Date();
    return {
      subscription: {
        id: sub.id,
        status: sub.status,
        billingMode: sub.billingMode,
        billingCycle: sub.billingCycle,
        seatsPurchased: sub.seatsPurchased,
        minSeats: sub.minSeats,
        pricePerSeat: sub.pricePerSeat,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        nextBillingDate: sub.nextBillingDate,
        pendingSeatChange: sub.pendingSeatChange,
        overdue,
        accessEndsAt: overdue ? dayjs(sub.currentPeriodEnd).add(GRACE_DAYS, "day").toDate() : null,
      },
      seatsInUse,
      bills,
    };
  }

  // ── Seat changes ─────────────────────────────────────────────────────────
  private async seatChangeQuote(orgId: number, newSeats: number) {
    const sub = await currentSub(prisma, orgId);
    if (!sub || sub.status !== "ACTIVE" || !sub.currentPeriodStart || !sub.currentPeriodEnd) {
      throw new ApiError("Seats can be changed once the subscription is active.", STATUS_CODES.CONFLICT);
    }
    if (newSeats < sub.minSeats) {
      throw new ApiError(`The minimum is ${sub.minSeats} seats.`, STATUS_CODES.BAD_REQUEST);
    }
    const months = CYCLE_MONTHS[sub.billingCycle];
    const price = Number(sub.pricePerSeat);

    if (newSeats > sub.seatsPurchased) {
      const extra = newSeats - sub.seatsPurchased;
      const pr = prorateSeatAdd({
        extraSeats: extra,
        pricePerSeat: price,
        months,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
      });
      return { sub, direction: "INCREASE" as const, extra, months, price, pr, amounts: withGst(pr.base, await gstPercent(prisma)) };
    }
    return { sub, direction: newSeats < sub.seatsPurchased ? ("DECREASE" as const) : ("NONE" as const), extra: 0, months, price, pr: null, amounts: null };
  }

  async previewSeatChange(orgId: number, newSeats: number) {
    const q = await this.seatChangeQuote(orgId, newSeats);
    return {
      direction: q.direction,
      currentSeats: q.sub.seatsPurchased,
      newSeats,
      extraSeats: q.extra,
      remainingDays: q.pr?.remainingDays ?? null,
      totalDays: q.pr?.totalDays ?? null,
      amounts: q.amounts,
      effectiveAt: q.direction === "DECREASE" ? q.sub.currentPeriodEnd : null,
    };
  }

  async requestSeatChange(actor: Actor, newSeats: number) {
    const q = await this.seatChangeQuote(actor.orgId, newSeats);

    if (q.direction === "DECREASE") {
      const inUse = await countSeatsInUse(prisma, actor.orgId);
      if (newSeats < inUse) {
        throw new ApiError(`${inUse} seats are in use or reserved. Remove members or revoke invites first.`, STATUS_CODES.CONFLICT);
      }
    }

    if (q.direction !== "INCREASE") {
      await prisma.$transaction([
        prisma.orgSubscription.update({
          where: { id: q.sub.id },
          data: { pendingSeatChange: q.direction === "DECREASE" ? { seats: newSeats, effectiveAt: q.sub.currentPeriodEnd } : (null as any) },
        }),
        prisma.orgAuditLog.create({
          data: { orgId: actor.orgId, actorUserId: actor.userId, action: q.direction === "DECREASE" ? "SEATS_REDUCTION_SCHEDULED" : "SEATS_CHANGE_CLEARED", targetType: "OrgSubscription", targetId: String(q.sub.id), meta: { seats: newSeats }, ip: actor.ip?.slice(0, 64) },
        }),
      ]);
      return { direction: q.direction, bill: null };
    }

    const bill = await prisma.$transaction(async (tx) => {
      // A newer quote replaces an unpaid earlier one.
      await tx.orgBill.updateMany({ where: { orgId: actor.orgId, kind: "SEAT_ADD", status: "DUE" }, data: { status: "VOID" } });
      const created = await createBill(tx, {
        orgId: actor.orgId,
        orgSubscriptionId: q.sub.id,
        kind: "SEAT_ADD",
        seats: newSeats,
        pricePerSeat: q.price,
        months: q.months,
        periodStart: new Date(),
        periodEnd: q.sub.currentPeriodEnd!,
        base: q.pr!.base,
        dueDate: dayjs().add(RENEWAL_LEAD_DAYS, "day").toDate(),
        meta: { extraSeats: q.extra, remainingDays: q.pr!.remainingDays, totalDays: q.pr!.totalDays, fromSeats: q.sub.seatsPurchased },
      });
      await tx.orgAuditLog.create({
        data: { orgId: actor.orgId, actorUserId: actor.userId, action: "SEATS_INCREASE_REQUESTED", targetType: "OrgBill", targetId: String(created.id), meta: { from: q.sub.seatsPurchased, to: newSeats }, ip: actor.ip?.slice(0, 64) },
      });
      return created;
    });
    void issue(bill.id);
    return { direction: q.direction, bill };
  }

  // ── Paying ───────────────────────────────────────────────────────────────
  /** Owner pays a bill online. Only for CASHFREE-mode orgs. */
  async startCashfreePayment(actor: Actor, billId: number) {
    const bill = await prisma.orgBill.findFirst({
      where: { id: billId, orgId: actor.orgId },
      include: { subscription: true, organization: true },
    });
    if (!bill) throw new ApiError("Invoice not found", STATUS_CODES.NOT_FOUND);
    if (bill.status !== "DUE") throw new ApiError("This invoice is not payable.", STATUS_CODES.CONFLICT);
    if (bill.kind === "SEAT_ADD" && bill.subscription.currentPeriodEnd?.getTime() !== bill.periodEnd.getTime()) {
      throw new ApiError("This invoice is out of date. Request the seat change again.", STATUS_CODES.CONFLICT);
    }
    if (bill.subscription.billingMode !== "CASHFREE") {
      throw new ApiError("This organization pays by bank transfer. Quote the invoice number as the reference.", STATUS_CODES.CONFLICT);
    }
    const user = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);

    const orderId = `orgbill_${bill.id}_${Date.now()}`;
    const digits = String(user.phoneNumber ?? "").replace(/\D/g, "");
    const order = await this.cashfree.createOrder({
      orderId,
      orderAmount: Number(bill.totalAmount),
      customerId: `org_${bill.orgId}`,
      customerName: bill.organization.name.slice(0, 100),
      customerEmail: bill.organization.billingEmail,
      customerPhone: digits.length >= 10 ? digits.slice(-15) : "9999999999",
      returnPath: "/org/billing?paid=1",
    });

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          userId: actor.userId,
          orgId: bill.orgId,
          type: "ONE_TIME",
          purpose: "ORG_BILLING",
          provider: "CASHFREE",
          providerOrderId: orderId,
          amount: bill.totalAmount,
          baseAmount: bill.baseAmount,
          taxPercent: bill.taxPercent,
          taxAmount: bill.taxAmount,
          currency: bill.currency,
          status: "PENDING",
          metadata: { billId: bill.id },
        },
      }),
      prisma.orgBill.update({ where: { id: bill.id }, data: { providerOrderId: orderId } }),
    ]);

    return { order_id: order.order_id, payment_session_id: order.payment_session_id };
  }

  /** Cashfree webhook for `orgbill_*` orders. */
  async handleCashfreeWebhook(orderId: string, paymentId: string | null, success: boolean, failed: boolean) {
    const payment = await prisma.payment.findFirst({ where: { providerOrderId: orderId, purpose: "ORG_BILLING" } });
    if (!payment) return { ignored: true, reason: "Org billing payment not found" };
    if (payment.status !== "PENDING") return { ignored: true, reason: "Already processed" };

    const billId = Number((payment.metadata as any)?.billId);
    if (!Number.isFinite(billId)) return { ignored: true, reason: "No bill on payment" };

    if (success) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", providerPaymentId: paymentId } });
      try {
        await this.markPaid(billId, { method: "CASHFREE", reference: paymentId ?? orderId });
      } catch (e: any) {
        // Money was collected but the invoice can no longer be applied (cancelled or
        // outdated). Don't make Cashfree retry forever surface it for a manual refund.
        console.error(`[org-billing] PAYMENT RECEIVED BUT NOT APPLIED: bill ${billId}, order ${orderId}, payment ${paymentId} ${e?.message}`);
        return { ignored: true, reason: "Payment received for an invoice that could not be applied" };
      }
      return { ignored: false, processed: "success" };
    }
    if (failed) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", providerPaymentId: paymentId } });
      return { ignored: false, processed: "failed" };
    }
    return { ignored: true, reason: "Unhandled event" };
  }

  /**
   * Settles a bill and applies its effect. Idempotent: a bill already PAID
   * (e.g. webhook retry) is returned untouched.
   */
  async markPaid(billId: number, p: { method: "CASHFREE" | "BANK_TRANSFER"; reference?: string | null; actorUserId?: number }) {
    const result = await prisma.$transaction(
      async (tx) => {
        const bill = await tx.orgBill.findUnique({ where: { id: billId }, include: { subscription: true } });
        if (!bill) throw new ApiError("Invoice not found", STATUS_CODES.NOT_FOUND);
        if (bill.status === "PAID") return { bill, already: true };
        if (bill.status === "VOID") throw new ApiError("This invoice was cancelled.", STATUS_CODES.CONFLICT);

        const sub = bill.subscription;
        if (bill.kind === "SEAT_ADD") {
          if (sub.status !== "ACTIVE") {
            throw new ApiError("The subscription isn't active. Pay the renewal invoice first.", STATUS_CODES.CONFLICT);
          }
          // Quoted against an earlier period, or no longer an increase: the quote is stale.
          if (sub.currentPeriodEnd?.getTime() !== bill.periodEnd.getTime() || bill.seats <= sub.seatsPurchased) {
            throw new ApiError("This invoice is out of date. Request the seat change again.", STATUS_CODES.CONFLICT);
          }
        }
        const now = new Date();
        const months = CYCLE_MONTHS[sub.billingCycle];
        const wasLive = sub.status === "ACTIVE";

        // Period handling per kind. A renewal paid on time chains onto the old
        // period; paid after expiry (or an initial bill) restarts from now.
        let start = sub.currentPeriodStart;
        let end = sub.currentPeriodEnd;
        if (bill.kind === "INITIAL" || (bill.kind === "RENEWAL" && (!wasLive || !sub.currentPeriodEnd))) {
          start = now;
          end = dayjs(now).add(months, "month").toDate();
        } else if (bill.kind === "RENEWAL") {
          start = bill.periodStart;
          end = bill.periodEnd;
        }

        await tx.orgSubscription.update({
          where: { id: sub.id },
          data: {
            status: "ACTIVE",
            seatsPurchased: bill.seats,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            nextBillingDate: end,
            ...(bill.kind === "RENEWAL" ? { pendingSeatChange: null as any } : {}),
          },
        });

        const paid = await tx.orgBill.update({
          where: { id: bill.id },
          data: {
            status: "PAID",
            paidAt: now,
            paymentMethod: p.method,
            paymentReference: p.reference ?? null,
            ...(bill.kind === "INITIAL" || (bill.kind === "RENEWAL" && !wasLive)
              ? { periodStart: start!, periodEnd: end! }
              : {}),
          },
        });

        // Bringing the plan to life (first payment, or paying after a lapse)
        // refills every active seat right away.
        if (!wasLive) {
          const members = await tx.orgMember.findMany({ where: { orgId: bill.orgId, status: "ACTIVE", takesSeat: true }, include: { role: true } });
          for (const m of members) {
            await grantSeatQuota(tx, {
              userId: m.userId,
              tokens: m.role.monthlyTokens,
              videoCredits: m.role.monthlyVideoCredits,
              reason: "ORG_SUBSCRIPTION_ACTIVATED",
              meta: { orgId: bill.orgId, billId: bill.id },
            });
          }
        }

        await tx.orgAuditLog.create({
          data: {
            orgId: bill.orgId,
            actorUserId: p.actorUserId ?? 0,
            action: "BILL_PAID",
            targetType: "OrgBill",
            targetId: String(bill.id),
            meta: { method: p.method, reference: p.reference ?? null, kind: bill.kind, seats: bill.seats },
          },
        });
        return { bill: paid, already: false };
      },
      { isolationLevel: "Serializable" },
    );

    if (!result.already) {
      void (async () => {
        const pdf = await renderOrgBillPdf(billId);
        await sendOrgBillEmail(billId, "PAID", pdf);
      })();
    }
    return result.bill;
  }

  /** Platform admin: confirm a bank transfer. */
  async markPaidManually(orgId: number, billId: number, reference: string, adminUserId: number) {
    const bill = await prisma.orgBill.findFirst({ where: { id: billId, orgId } });
    if (!bill) throw new ApiError("Invoice not found", STATUS_CODES.NOT_FOUND);
    return this.markPaid(billId, { method: "BANK_TRANSFER", reference, actorUserId: adminUserId });
  }

  async listBillsForAdmin(orgId: number) {
    return prisma.orgBill.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  }

  // ── Scheduled work ───────────────────────────────────────────────────────

  /** Issues renewal invoices RENEWAL_LEAD_DAYS before a period ends. */
  async generateRenewalBills(now = new Date()) {
    const horizon = dayjs(now).add(RENEWAL_LEAD_DAYS, "day").toDate();
    const subs = await prisma.orgSubscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: { not: null, lte: horizon },
        organization: { status: "ACTIVE", isDeleted: false },
      },
    });

    let created = 0;
    for (const sub of subs) {
      try {
        const periodStart = sub.currentPeriodEnd!;
        const exists = await prisma.orgBill.findFirst({
          where: { orgSubscriptionId: sub.id, kind: "RENEWAL", status: { not: "VOID" }, periodStart },
          select: { id: true },
        });
        if (exists) continue;

        const months = CYCLE_MONTHS[sub.billingCycle];
        const pending = sub.pendingSeatChange as { seats?: number } | null;
        const inUse = await countSeatsInUse(prisma, sub.orgId);
        // A scheduled reduction never drops below minimum or seats currently in use.
        const seats = Math.max(pending?.seats ?? sub.seatsPurchased, sub.minSeats, inUse);

        const bill = await prisma.$transaction(async (tx) => {
          // An unpaid seat-add quote was prorated against the period that is ending.
          await tx.orgBill.updateMany({ where: { orgSubscriptionId: sub.id, kind: "SEAT_ADD", status: "DUE" }, data: { status: "VOID" } });
          return createBill(tx, {
            orgId: sub.orgId,
            orgSubscriptionId: sub.id,
            kind: "RENEWAL",
            seats,
            pricePerSeat: Number(sub.pricePerSeat),
            months,
            periodStart,
            periodEnd: dayjs(periodStart).add(months, "month").toDate(),
            base: cycleBase(seats, Number(sub.pricePerSeat), months),
            dueDate: periodStart,
          });
        });
        await prisma.orgBill.update({ where: { id: bill.id }, data: { reminderCount: 1 } });
        void issue(bill.id);
        created++;
      } catch (e) {
        console.error(`[org-billing] renewal bill failed for sub ${sub.id}:`, e);
      }
    }
    return created;
  }

  /** Day-before reminder and overdue notice for unpaid renewals. */
  async sendReminders(now = new Date()) {
    const bills = await prisma.orgBill.findMany({
      where: { kind: "RENEWAL", status: "DUE", reminderCount: { in: [1, 2] }, subscription: { status: "ACTIVE" } },
    });
    let sent = 0;
    for (const b of bills) {
      const daysToDue = Math.ceil((b.dueDate.getTime() - now.getTime()) / 86_400_000);
      if (b.reminderCount === 1 && daysToDue <= 1 && daysToDue >= 0) {
        await sendOrgBillEmail(b.id, "REMINDER");
        await prisma.orgBill.update({ where: { id: b.id }, data: { reminderCount: 2 } });
        sent++;
      } else if (daysToDue < 0 && b.reminderCount <= 2) {
        await sendOrgBillEmail(b.id, "OVERDUE");
        await prisma.orgBill.update({ where: { id: b.id }, data: { reminderCount: 3 } });
        sent++;
      }
    }
    return sent;
  }

  /** After the grace period, an unpaid org drops to Free: plan EXPIRED, seat quota revoked. */
  async expireLapsed(now = new Date()) {
    const cutoff = dayjs(now).subtract(GRACE_DAYS, "day").toDate();
    const subs = await prisma.orgSubscription.findMany({
      where: { status: "ACTIVE", currentPeriodEnd: { not: null, lt: cutoff } },
    });

    let expired = 0;
    for (const sub of subs) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.orgSubscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
          const members = await tx.orgMember.findMany({ where: { orgId: sub.orgId, status: "ACTIVE" }, select: { userId: true } });
          for (const m of members) await revokeSeatQuota(tx, m.userId, "ORG_SUBSCRIPTION_EXPIRED");
          await tx.orgAuditLog.create({
            data: { orgId: sub.orgId, actorUserId: 0, action: "SUBSCRIPTION_EXPIRED", targetType: "OrgSubscription", targetId: String(sub.id) },
          });
        });
        const due = await prisma.orgBill.findFirst({ where: { orgSubscriptionId: sub.id, kind: "RENEWAL", status: "DUE" }, orderBy: { createdAt: "desc" } });
        if (due) await sendOrgBillEmail(due.id, "EXPIRED");
        expired++;
      } catch (e) {
        console.error(`[org-billing] expiry failed for sub ${sub.id}:`, e);
      }
    }
    return expired;
  }
}

export default OrgBillingService;
