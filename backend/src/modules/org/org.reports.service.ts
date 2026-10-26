import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { countSeatsInUse } from "./org.service.js";

/**
 * Org-wide metrics. Everything is aggregated from UsageLog through the
 * member's user id token counts, request counts and model ids only; there is
 * deliberately no path from here to chat or message content.
 */

const TZ = "Asia/Kolkata";

export interface UsageRange {
  from: Date;
  to: Date;
}

export function resolveRange(days: number): UsageRange {
  const d = Math.min(365, Math.max(1, days));
  return { from: dayjs().subtract(d - 1, "day").startOf("day").toDate(), to: dayjs().endOf("day").toDate() };
}

async function memberUserIds(orgId: number): Promise<number[]> {
  const rows = await prisma.orgMember.findMany({ where: { orgId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function dailySeries(userIds: number[], range: UsageRange) {
  const days: { date: string; tokens: number; requests: number }[] = [];
  const idx = new Map<string, number>();
  for (let d = dayjs(range.from); !d.isAfter(range.to); d = d.add(1, "day")) {
    idx.set(d.format("YYYY-MM-DD"), days.length);
    days.push({ date: d.format("YYYY-MM-DD"), tokens: 0, requests: 0 });
  }
  if (!userIds.length) return days;

  const rows = await prisma.$queryRaw<{ day: string; tokens: bigint | null; requests: bigint }[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day,
           COALESCE(SUM("billableTotalTokens"), 0) AS tokens,
           COUNT(*) AS requests
    FROM "UsageLog"
    WHERE "userId" IN (${Prisma.join(userIds)})
      AND "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
    GROUP BY 1
  `);
  for (const r of rows) {
    const i = idx.get(r.day);
    if (i != null) {
      days[i].tokens = Number(r.tokens ?? 0);
      days[i].requests = Number(r.requests);
    }
  }
  return days;
}

class OrgReportsService {
  /** Per-member, per-role and per-model totals for a range. */
  async usage(orgId: number, range: UsageRange) {
    const members = await prisma.orgMember.findMany({
      where: { orgId },
      select: {
        userId: true,
        status: true,
        role: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    const userIds = members.map((m) => m.userId);

    const [daily, perUserModel] = await Promise.all([
      dailySeries(userIds, range),
      userIds.length
        ? prisma.usageLog.groupBy({
            by: ["userId", "modelId"],
            where: { userId: { in: userIds }, createdAt: { gte: range.from, lte: range.to } },
            _sum: { billableTotalTokens: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const byUser = new Map<number, { tokens: number; requests: number }>();
    const byModelMap = new Map<number, { tokens: number; requests: number }>();
    for (const r of perUserModel) {
      const t = r._sum.billableTotalTokens ?? 0;
      const u = byUser.get(r.userId) ?? { tokens: 0, requests: 0 };
      u.tokens += t;
      u.requests += r._count._all;
      byUser.set(r.userId, u);
      const m = byModelMap.get(r.modelId) ?? { tokens: 0, requests: 0 };
      m.tokens += t;
      m.requests += r._count._all;
      byModelMap.set(r.modelId, m);
    }

    const byMember = members
      .map((m) => ({
        userId: m.userId,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: m.user.email,
        role: m.role.name,
        status: m.status,
        ...(byUser.get(m.userId) ?? { tokens: 0, requests: 0 }),
      }))
      .sort((a, b) => b.tokens - a.tokens);

    const roleMap = new Map<string, { role: string; tokens: number; requests: number; members: number }>();
    for (const m of byMember) {
      const r = roleMap.get(m.role) ?? { role: m.role, tokens: 0, requests: 0, members: 0 };
      r.tokens += m.tokens;
      r.requests += m.requests;
      r.members += 1;
      roleMap.set(m.role, r);
    }

    const modelNames = byModelMap.size
      ? await prisma.model.findMany({ where: { id: { in: [...byModelMap.keys()] } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(modelNames.map((m) => [m.id, m.name]));
    const byModel = [...byModelMap]
      .map(([id, v]) => ({ modelId: id, name: nameById.get(id) ?? `Model ${id}`, ...v }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    const totals = byMember.reduce((a, m) => ({ tokens: a.tokens + m.tokens, requests: a.requests + m.requests }), { tokens: 0, requests: 0 });

    return {
      range: { from: range.from, to: range.to },
      totals,
      daily,
      byMember,
      byRole: [...roleMap.values()].sort((a, b) => b.tokens - a.tokens),
      byModel,
    };
  }

  async usageCsv(orgId: number, range: UsageRange): Promise<string> {
    const u = await this.usage(orgId, range);
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      // Names/emails are user-controlled neutralise spreadsheet formulas.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Name", "Email", "Role", "Status", "Requests", "Tokens"].join(",")];
    for (const m of u.byMember) lines.push([m.name, m.email, m.role, m.status, m.requests, m.tokens].map(esc).join(","));
    return lines.join("\n");
  }

  /** Landing page of the console: seats, billing state, 30-day usage. */
  async overview(orgId: number) {
    const range = resolveRange(30);
    const [org, sub, seatsInUse, statusCounts, usage, dueBills] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, status: true } }),
      prisma.orgSubscription.findFirst({ where: { orgId }, orderBy: { createdAt: "desc" } }),
      countSeatsInUse(prisma, orgId),
      prisma.orgMember.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
      this.usage(orgId, range),
      prisma.orgBill.count({ where: { orgId, status: "DUE" } }),
    ]);
    if (!org) throw new ApiError("Organization not found", STATUS_CODES.NOT_FOUND);

    const counts = Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all]));
    const activeSince = dayjs().subtract(7, "day").toDate();
    const userIds = await memberUserIds(orgId);
    const active7d = userIds.length
      ? (await prisma.usageLog.groupBy({ by: ["userId"], where: { userId: { in: userIds }, createdAt: { gte: activeSince } } })).length
      : 0;

    return {
      organization: org,
      subscription: sub && {
        status: sub.status,
        seatsPurchased: sub.seatsPurchased,
        currentPeriodEnd: sub.currentPeriodEnd,
        billingCycle: sub.billingCycle,
      },
      seats: { purchased: sub?.seatsPurchased ?? 0, inUse: seatsInUse },
      members: { active: counts.ACTIVE ?? 0, suspended: counts.SUSPENDED ?? 0, active7d },
      dueBills,
      totals: usage.totals,
      daily: usage.daily,
      topMembers: usage.byMember.slice(0, 5),
      byRole: usage.byRole,
    };
  }

  // ── Audit log ────────────────────────────────────────────────────────────
  async audit(orgId: number, query: { page?: number; action?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = 25;
    const where = { orgId, ...(query.action ? { action: query.action } : {}) };
    const [rows, total, actions] = await Promise.all([
      prisma.orgAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.orgAuditLog.count({ where }),
      prisma.orgAuditLog.groupBy({ by: ["action"], where: { orgId } }),
    ]);

    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id) => id > 0))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      actions: actions.map((a) => a.action).sort(),
      data: rows.map((r) => {
        const a = actorById.get(r.actorUserId);
        return {
          id: r.id,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          meta: r.meta,
          createdAt: r.createdAt,
          // actorUserId 0 = a system job (e.g. plan expiry); platform admins act as their own user id.
          actor: a ? { name: `${a.firstName} ${a.lastName}`.trim(), email: a.email } : { name: r.actorUserId === 0 ? "System" : "Colab AI team", email: null },
        };
      }),
    };
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings(orgId: number) {
    return prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, gstin: true, billingEmail: true, billingAddress: true, allowedEmailDomains: true },
    });
  }

  async updateSettings(
    actor: { userId: number; orgId: number; ip?: string },
    data: { name?: string; gstin?: string | null; billingEmail?: string; billingAddress?: Record<string, unknown> | null; allowedEmailDomains?: string[] },
  ) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: actor.orgId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.gstin !== undefined ? { gstin: data.gstin || null } : {}),
          ...(data.billingEmail !== undefined ? { billingEmail: data.billingEmail } : {}),
          ...(data.billingAddress !== undefined ? { billingAddress: (data.billingAddress ?? Prisma.DbNull) as any } : {}),
          ...(data.allowedEmailDomains !== undefined ? { allowedEmailDomains: data.allowedEmailDomains } : {}),
        },
        select: { id: true, name: true, gstin: true, billingEmail: true, billingAddress: true, allowedEmailDomains: true },
      });
      await tx.orgAuditLog.create({
        data: { orgId: actor.orgId, actorUserId: actor.userId, action: "SETTINGS_UPDATED", targetType: "Organization", targetId: String(actor.orgId), meta: { changed: Object.keys(data) }, ip: actor.ip?.slice(0, 64) },
      });
      return updated;
    });
  }

  /** The owner hands the owner role to another active member and becomes an admin. */
  async transferOwnership(actor: { userId: number; orgId: number; ip?: string }, memberId: number) {
    const target = await prisma.orgMember.findFirst({ where: { id: memberId, orgId: actor.orgId } });
    if (!target || target.status !== "ACTIVE") throw new ApiError("Choose an active member.", STATUS_CODES.BAD_REQUEST);
    if (target.userId === actor.userId) throw new ApiError("You're already the owner.", STATUS_CODES.BAD_REQUEST);

    await prisma.$transaction([
      prisma.orgMember.update({ where: { id: target.id }, data: { memberRole: "OWNER" } }),
      prisma.orgMember.updateMany({ where: { orgId: actor.orgId, userId: actor.userId }, data: { memberRole: "ADMIN" } }),
      prisma.orgAuditLog.create({
        data: { orgId: actor.orgId, actorUserId: actor.userId, action: "OWNERSHIP_TRANSFERRED", targetType: "OrgMember", targetId: String(target.id), ip: actor.ip?.slice(0, 64) },
      }),
    ]);
  }
}

export default OrgReportsService;
