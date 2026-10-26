import { createHash, randomBytes } from "node:crypto";
import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { formatPaginationResponse, getPaginationOptions } from "@/utils/paginationUtils.js";
import { grantSeatQuota, revokeSeatQuota } from "./org.quota.js";
import OrgBillingService from "./org.billing.service.js";
import { sendOrgInviteEmail } from "./org.mail.js";

const BUSINESS_PLAN_NAME = "Business";
const INVITE_TTL_DAYS = 7;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";

interface CreateOrgInput {
  name: string;
  gstin?: string | null;
  billingEmail: string;
  billingAddress?: Record<string, unknown> | null;
  ownerEmail: string;
  allowedEmailDomains: string[];
  demoRequestId?: number | null;
  ownerTakesSeat: boolean;
  billingMode: "CASHFREE" | "MANUAL_INVOICE";
  billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY";
  seats: number;
  minSeats: number;
  pricePerSeat: number;
  defaultRole: { name: string; monthlyTokens: number; monthlyVideoCredits: number };
}

/**
 * Platform-admin side of organizations: create / list / inspect / suspend and
 * activate (manual-invoice payment). Everything the org's own admins do lives
 * in the org console modules, not here.
 */
class OrgAdminService {
  private billing = new OrgBillingService();

  /**
   * The Business plan is only a label + flag carrier: per-seat price lives on
   * OrgSubscription and entitlements come from each OrgRole, so it has no
   * prices and is deliberately NOT synced to Cashfree.
   */
  private async ensureBusinessPlan() {
    const existing = await prisma.plan.findFirst({
      where: { name: BUSINESS_PLAN_NAME, isEnterprise: true, isDeleted: false },
    });
    if (existing) return existing;
    return prisma.plan.create({
      data: {
        name: BUSINESS_PLAN_NAME,
        monthlyPrice: 0,
        quarterlyPrice: 0,
        yearlyPrice: 0,
        tokenLimit: 1,
        features: {},
        isEnterprise: true,
        isActive: true,
      },
    });
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name);
    for (let i = 0; i < 5; i++) {
      const slug = i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
      if (!(await prisma.organization.findUnique({ where: { slug }, select: { id: true } }))) return slug;
    }
    return `${base}-${randomBytes(4).toString("hex")}`;
  }

  async create(data: CreateOrgInput, adminUserId: number) {
    const ownerEmail = data.ownerEmail.toLowerCase();

    // Org seats are always fresh accounts: an existing account can't be pulled in.
    const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
    if (existingUser) {
      throw new ApiError(
        "This email already has an account. Use a different work email for the owner.",
        STATUS_CODES.CONFLICT,
      );
    }

    if (data.allowedEmailDomains.length && !data.allowedEmailDomains.includes(ownerEmail.split("@")[1])) {
      throw new ApiError("Owner email must be on one of the allowed email domains.", STATUS_CODES.BAD_REQUEST);
    }
    if (data.seats < data.minSeats) {
      throw new ApiError(`Seats must be at least the minimum of ${data.minSeats}.`, STATUS_CODES.BAD_REQUEST);
    }

    if (data.demoRequestId) {
      const demo = await prisma.demoRequest.findFirst({
        where: { id: data.demoRequestId, isDeleted: false },
        select: { id: true },
      });
      if (!demo) throw new ApiError("Demo request not found", STATUS_CODES.NOT_FOUND);
      if (await prisma.organization.findUnique({ where: { demoRequestId: data.demoRequestId }, select: { id: true } })) {
        throw new ApiError("An organization was already created from this demo request.", STATUS_CODES.CONFLICT);
      }
    }

    const plan = await this.ensureBusinessPlan();
    const slug = await this.uniqueSlug(data.name);
    const token = randomBytes(32).toString("hex");

    let initialBillId = 0;
    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: data.name,
          slug,
          gstin: data.gstin || null,
          billingEmail: data.billingEmail,
          billingAddress: (data.billingAddress ?? undefined) as any,
          allowedEmailDomains: data.allowedEmailDomains,
          createdByAdminId: adminUserId,
          demoRequestId: data.demoRequestId ?? null,
        },
      });

      const role = await tx.orgRole.create({
        data: {
          orgId: created.id,
          name: data.defaultRole.name,
          isDefault: true,
          monthlyTokens: data.defaultRole.monthlyTokens,
          monthlyVideoCredits: data.defaultRole.monthlyVideoCredits,
        },
      });

      const sub = await tx.orgSubscription.create({
        data: {
          orgId: created.id,
          planId: plan.id,
          status: "PENDING",
          billingMode: data.billingMode,
          billingCycle: data.billingCycle,
          seatsPurchased: data.seats,
          minSeats: data.minSeats,
          pricePerSeat: data.pricePerSeat,
        },
      });
      initialBillId = (await this.billing.createInitialBill(tx, sub)).id;

      await tx.orgInvite.create({
        data: {
          orgId: created.id,
          email: ownerEmail,
          orgRoleId: role.id,
          memberRole: "OWNER",
          takesSeat: data.ownerTakesSeat,
          tokenHash: hashToken(token),
          expiresAt: dayjs().add(INVITE_TTL_DAYS, "day").toDate(),
          invitedByUserId: adminUserId,
        },
      });

      await tx.orgAuditLog.create({
        data: {
          orgId: created.id,
          actorUserId: adminUserId,
          action: "ORG_CREATED",
          targetType: "Organization",
          targetId: String(created.id),
          meta: { seats: data.seats, billingMode: data.billingMode, ownerEmail },
        },
      });

      return created;
    });

    const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
    const ownerInviteUrl = `${frontendUrl}/join/${token}`;

    // The owner's sign-up link goes to the owner's own email; the invoice goes to the billing address.
    const ownerInviteEmailSent = await sendOrgInviteEmail(ownerEmail, org.name, ownerInviteUrl, { owner: true });
    void this.billing.issueBill(initialBillId);

    return {
      organization: org,
      // The raw token exists only in this response; only its hash is stored.
      ownerInviteUrl,
      ownerInviteEmailSent,
      ownerEmail,
    };
  }

  async list(query: { page?: number; pageSize?: number; status?: string; search?: string }) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 20);
    const search = query.search?.trim();
    const where = {
      isDeleted: false,
      ...(query.status ? { status: query.status as any } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { billingEmail: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { members: { where: { status: "ACTIVE" } } } },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return formatPaginationResponse(orgs, total, page, pageSize);
  }

  async getById(orgId: number) {
    const org = await prisma.organization.findFirst({
      where: { id: orgId, isDeleted: false },
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: { select: { id: true, name: true } } } },
        roles: { where: { isDeleted: false } },
        invites: { where: { acceptedAt: null, revokedAt: null }, select: { id: true, email: true, memberRole: true, expiresAt: true } },
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
    });
    if (!org) throw new ApiError("Organization not found", STATUS_CODES.NOT_FOUND);
    return org;
  }

  async setStatus(orgId: number, status: "ACTIVE" | "SUSPENDED", adminUserId: number) {
    const org = await prisma.organization.findFirst({ where: { id: orgId, isDeleted: false } });
    if (!org) throw new ApiError("Organization not found", STATUS_CODES.NOT_FOUND);
    if (org.status === "CLOSED") {
      throw new ApiError("A closed organization can't be changed.", STATUS_CODES.CONFLICT);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({ where: { id: orgId }, data: { status } });
      const members = await tx.orgMember.findMany({ where: { orgId, status: "ACTIVE", takesSeat: true }, include: { role: true } });

      if (status === "SUSPENDED") {
        // Members fall back to Free, so what the org funded must not stay spendable.
        for (const m of members) await revokeSeatQuota(tx, m.userId, "ORG_SUSPENDED");
      } else if (org.status === "SUSPENDED") {
        const live = await tx.orgSubscription.findFirst({ where: { orgId, status: "ACTIVE" } });
        if (live) {
          for (const m of members) {
            await grantSeatQuota(tx, {
              userId: m.userId,
              tokens: m.role.monthlyTokens,
              videoCredits: m.role.monthlyVideoCredits,
              reason: "ORG_REACTIVATED",
              meta: { orgId },
            });
          }
        }
      }

      await tx.orgAuditLog.create({
        data: {
          orgId,
          actorUserId: adminUserId,
          action: status === "SUSPENDED" ? "ORG_SUSPENDED" : "ORG_REACTIVATED",
          targetType: "Organization",
          targetId: String(orgId),
        },
      });
      return updated;
    });
  }

  /**
   * Convenience for manual-invoice orgs: settles the first (INITIAL) invoice as a
   * bank transfer and starts the subscription. For any other invoice, or to record
   * a transfer reference, use markBillPaid.
   */
  async activateSubscription(orgId: number, adminUserId: number) {
    const sub = await prisma.orgSubscription.findFirst({ where: { orgId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
    if (!sub) throw new ApiError("No pending subscription for this organization.", STATUS_CODES.NOT_FOUND);
    if (sub.billingMode !== "MANUAL_INVOICE") {
      throw new ApiError("Only manual-invoice subscriptions are activated by hand.", STATUS_CODES.BAD_REQUEST);
    }

    let bill = await prisma.orgBill.findFirst({ where: { orgId, orgSubscriptionId: sub.id, kind: "INITIAL", status: "DUE" } });
    if (!bill) {
      // Orgs created before invoicing existed have no bill yet.
      bill = await prisma.$transaction((tx) => this.billing.createInitialBill(tx, sub));
    }
    return this.billing.markPaidManually(orgId, bill.id, "manual-activation", adminUserId);
  }

  /**
   * Ends an organization for good: members become ordinary Free users (their
   * accounts and chats are untouched), funded tokens are zeroed, open invoices
   * are voided and the plan is cancelled. Invoices and the audit trail are kept.
   */
  async closeOrg(orgId: number, adminUserId: number) {
    const org = await prisma.organization.findFirst({ where: { id: orgId, isDeleted: false } });
    if (!org) throw new ApiError("Organization not found", STATUS_CODES.NOT_FOUND);
    if (org.status === "CLOSED") throw new ApiError("This organization is already closed.", STATUS_CODES.CONFLICT);

    return prisma.$transaction(async (tx) => {
      const members = await tx.orgMember.findMany({ where: { orgId, status: { in: ["ACTIVE", "SUSPENDED"] } }, select: { id: true, userId: true } });
      for (const m of members) await revokeSeatQuota(tx, m.userId, "ORG_CLOSED");
      await tx.orgMember.updateMany({ where: { orgId, status: { in: ["ACTIVE", "SUSPENDED", "INVITED"] } }, data: { status: "REMOVED", removedAt: new Date(), tokenBonus: 0 } });
      await tx.orgInvite.updateMany({ where: { orgId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.orgBill.updateMany({ where: { orgId, status: "DUE" }, data: { status: "VOID" } });
      await tx.orgSubscription.updateMany({ where: { orgId, status: { in: ["ACTIVE", "PENDING", "EXPIRED"] } }, data: { status: "CANCELLED" } });
      const closed = await tx.organization.update({ where: { id: orgId }, data: { status: "CLOSED" } });
      await tx.orgAuditLog.create({
        data: { orgId, actorUserId: adminUserId, action: "ORG_CLOSED", targetType: "Organization", targetId: String(orgId), meta: { membersReleased: members.length } },
      });
      return closed;
    });
  }

  markBillPaid(orgId: number, billId: number, reference: string, adminUserId: number) {
    return this.billing.markPaidManually(orgId, billId, reference, adminUserId);
  }

  listBills(orgId: number) {
    return this.billing.listBillsForAdmin(orgId);
  }
}

export default OrgAdminService;
