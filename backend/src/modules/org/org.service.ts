import { createHash, randomBytes } from "node:crypto";
import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import type { OrgMemberRole, Prisma } from "@prisma/client";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { sendOrgInviteEmail } from "./org.mail.js";
import { adjustSeatQuota, grantSeatQuota, revokeSeatQuota } from "./org.quota.js";
import { roleRank } from "./org.access.js";

const INVITE_TTL_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type Actor = { userId: number; orgId: number; memberRole: OrgMemberRole; ip?: string };

const audit = (
  db: Prisma.TransactionClient | typeof prisma,
  actor: Actor,
  action: string,
  targetType?: string,
  targetId?: number | string,
  meta?: Record<string, unknown>,
) =>
  db.orgAuditLog.create({
    data: {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : undefined,
      meta: (meta ?? undefined) as any,
      ip: actor.ip?.slice(0, 64),
    },
  });

/** The org's current (latest non-expired) subscription. */
export const getCurrentOrgSubscription = (db: Prisma.TransactionClient | typeof prisma, orgId: number) =>
  db.orgSubscription.findFirst({
    where: { orgId, status: { in: ["ACTIVE", "PENDING"] } },
    orderBy: { createdAt: "desc" },
  });

/**
 * Seats in use = ACTIVE members + still-pending invites (so two admins can't
 * both invite into the last seat). `excludeInviteId` lets an accept ignore its
 * own reservation.
 */
export async function countSeatsInUse(
  db: Prisma.TransactionClient | typeof prisma,
  orgId: number,
  excludeInviteId?: number,
) {
  const [members, invites] = await Promise.all([
    db.orgMember.count({ where: { orgId, status: "ACTIVE", takesSeat: true } }),
    db.orgInvite.count({
      where: {
        orgId,
        takesSeat: true,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(excludeInviteId ? { id: { not: excludeInviteId } } : {}),
      },
    }),
  ]);
  return members + invites;
}

class OrgService {
  // ── Me ────────────────────────────────────────────────────────────────────
  async getMe(userId: number, orgId: number) {
    const member = await prisma.orgMember.findFirst({
      where: { userId, orgId },
      include: { role: true, organization: { select: { id: true, name: true, status: true } } },
    });
    if (!member) throw new ApiError("Not an organization member", STATUS_CODES.FORBIDDEN);

    const sub = await getCurrentOrgSubscription(prisma, orgId);
    const active = sub?.status === "ACTIVE";
    const isAdmin = roleRank(member.memberRole) >= roleRank("ADMIN");
    const r = member.role;

    return {
      organization: member.organization,
      member: { id: member.id, memberRole: member.memberRole, status: member.status, takesSeat: member.takesSeat },
      subscriptionActive: active,
      // Billing figures only for admins.
      subscription:
        isAdmin && sub
          ? {
              status: sub.status,
              billingMode: sub.billingMode,
              seatsPurchased: sub.seatsPurchased,
              currentPeriodEnd: sub.currentPeriodEnd,
            }
          : null,
      role: { id: r.id, name: r.name },
      capabilities: {
        documentGenEnabled: active && r.documentGenEnabled,
        imageGenEnabled: active && r.imageGenEnabled,
        videoGenEnabled: active && r.videoGenEnabled,
        codeWorkspaceEnabled: active && r.codeWorkspaceEnabled,
        voiceEnabled: active && r.voiceEnabled,
        monthlyVideoCredits: r.monthlyVideoCredits,
        monthlyTokens: r.monthlyTokens,
        modelPolicy: r.modelPolicy,
        videoModelIds: r.videoModelIds,
        dailyTokenCap: r.dailyTokenCap,
      },
    };
  }

  // ── Members (metrics only never chat content) ──────────────────────────
  async listMembers(orgId: number, query: { status?: string; roleId?: number; search?: string }) {
    const search = query.search?.trim();
    const members = await prisma.orgMember.findMany({
      where: {
        orgId,
        ...(query.status ? { status: query.status as any } : { status: { not: "REMOVED" } }),
        ...(query.roleId ? { orgRoleId: query.roleId } : {}),
        ...(search
          ? {
              user: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userWallet: { select: { tokensRemaining: true, tokensUsed: true } },
          },
        },
        role: { select: { id: true, name: true, monthlyTokens: true } },
      },
    });

    const lastActive = members.length
      ? await prisma.usageLog.groupBy({
          by: ["userId"],
          where: { userId: { in: members.map((m) => m.userId) } },
          _max: { createdAt: true },
        })
      : [];
    const lastByUser = new Map(lastActive.map((l) => [l.userId, l._max.createdAt]));

    return members.map((m) => ({
      id: m.id,
      memberRole: m.memberRole,
      status: m.status,
      takesSeat: m.takesSeat,
      role: m.role,
      user: {
        id: m.user.id,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
      },
      tokensRemaining: m.user.userWallet?.tokensRemaining ?? 0,
      tokensUsed: m.user.userWallet?.tokensUsed ?? 0,
      lastActiveAt: lastByUser.get(m.userId) ?? null,
    }));
  }

  async updateMember(
    actor: Actor,
    memberId: number,
    data: { orgRoleId?: number; memberRole?: OrgMemberRole; status?: "ACTIVE" | "SUSPENDED"; takesSeat?: boolean },
  ) {
    const target = await prisma.orgMember.findFirst({
      where: { id: memberId, orgId: actor.orgId },
      include: { role: true },
    });
    if (!target) throw new ApiError("Member not found", STATUS_CODES.NOT_FOUND);
    if (target.status === "REMOVED" && data.status !== "ACTIVE") {
      throw new ApiError("This member was removed.", STATUS_CODES.CONFLICT);
    }

    const isSelf = target.userId === actor.userId;
    if (data.takesSeat !== undefined && actor.memberRole !== "OWNER") {
      throw new ApiError("Only an owner can change who uses a seat.", STATUS_CODES.FORBIDDEN);
    }
    // Admins manage plain members; touching an admin/owner needs an owner.
    if (actor.memberRole !== "OWNER" && target.memberRole !== "MEMBER") {
      throw new ApiError("Only an owner can change admins or owners.", STATUS_CODES.FORBIDDEN);
    }
    if (data.memberRole && data.memberRole !== target.memberRole && actor.memberRole !== "OWNER") {
      throw new ApiError("Only an owner can change member permissions.", STATUS_CODES.FORBIDDEN);
    }
    if (isSelf && data.status === "SUSPENDED") {
      throw new ApiError("You can't suspend yourself.", STATUS_CODES.BAD_REQUEST);
    }
    if (target.memberRole === "OWNER" && data.memberRole && data.memberRole !== "OWNER") {
      const owners = await prisma.orgMember.count({ where: { orgId: actor.orgId, memberRole: "OWNER", status: "ACTIVE" } });
      if (owners <= 1) throw new ApiError("An organization needs at least one owner.", STATUS_CODES.CONFLICT);
    }
    if (target.memberRole === "OWNER" && data.status === "SUSPENDED") {
      throw new ApiError("Transfer ownership before suspending an owner.", STATUS_CODES.CONFLICT);
    }

    let newRole = target.role;
    if (data.orgRoleId && data.orgRoleId !== target.orgRoleId) {
      const role = await prisma.orgRole.findFirst({ where: { id: data.orgRoleId, orgId: actor.orgId, isDeleted: false } });
      if (!role) throw new ApiError("Role not found", STATUS_CODES.NOT_FOUND);
      newRole = role;
    }

    // Seat holding after this change. Plain members always hold one.
    const nextMemberRole = data.memberRole ?? target.memberRole;
    if (data.takesSeat === false && nextMemberRole === "MEMBER") {
      throw new ApiError("Members always use a seat. Make them an admin first.", STATUS_CODES.BAD_REQUEST);
    }
    const nextTakesSeat = nextMemberRole === "MEMBER" ? true : (data.takesSeat ?? target.takesSeat);
    const nextStatus = data.status ?? target.status;
    const wasHoldingSeat = target.takesSeat && target.status === "ACTIVE";
    const willHoldSeat = nextTakesSeat && nextStatus === "ACTIVE";
    const gainsSeat = willHoldSeat && !wasHoldingSeat;
    const losesSeat = wasHoldingSeat && !willHoldSeat;

    return prisma.$transaction(async (tx) => {
      if (gainsSeat) {
        const sub = await getCurrentOrgSubscription(tx, actor.orgId);
        if (!sub || sub.status !== "ACTIVE") {
          throw new ApiError("The organization subscription isn't active.", STATUS_CODES.CONFLICT);
        }
        if ((await countSeatsInUse(tx, actor.orgId)) >= sub.seatsPurchased) {
          throw new ApiError("No free seats. Add seats in Billing first.", STATUS_CODES.CONFLICT);
        }
      }

      const updated = await tx.orgMember.update({
        where: { id: memberId },
        data: {
          ...(data.orgRoleId ? { orgRoleId: data.orgRoleId } : {}),
          ...(data.memberRole ? { memberRole: data.memberRole } : {}),
          takesSeat: nextTakesSeat,
          ...(data.status
            ? {
                status: data.status,
                suspendedAt: data.status === "SUSPENDED" ? new Date() : null,
                removedAt: null,
              }
            : {}),
        },
      });

      if (losesSeat) await revokeSeatQuota(tx, target.userId, data.status === "SUSPENDED" ? "ORG_SEAT_SUSPENDED" : "ORG_SEAT_RELEASED");
      if (gainsSeat) {
        await grantSeatQuota(tx, {
          userId: target.userId,
          tokens: newRole.monthlyTokens,
          videoCredits: newRole.monthlyVideoCredits,
          reason: "ORG_SEAT_REACTIVATED",
          meta: { orgId: actor.orgId },
        });
      }

      await audit(tx, actor, "MEMBER_UPDATED", "OrgMember", memberId, {
        ...data,
        previousRoleId: target.orgRoleId,
        previousMemberRole: target.memberRole,
      });
      return updated;
    });
  }

  async removeMember(actor: Actor, memberId: number) {
    const target = await prisma.orgMember.findFirst({ where: { id: memberId, orgId: actor.orgId } });
    if (!target) throw new ApiError("Member not found", STATUS_CODES.NOT_FOUND);
    if (target.userId === actor.userId) throw new ApiError("You can't remove yourself.", STATUS_CODES.BAD_REQUEST);
    if (target.memberRole !== "MEMBER" && actor.memberRole !== "OWNER") {
      throw new ApiError("Only an owner can remove admins or owners.", STATUS_CODES.FORBIDDEN);
    }
    if (target.memberRole === "OWNER") {
      const owners = await prisma.orgMember.count({ where: { orgId: actor.orgId, memberRole: "OWNER", status: "ACTIVE" } });
      if (owners <= 1) throw new ApiError("An organization needs at least one owner.", STATUS_CODES.CONFLICT);
    }

    await prisma.$transaction(async (tx) => {
      await tx.orgMember.update({
        where: { id: memberId },
        data: { status: "REMOVED", removedAt: new Date(), tokenBonus: 0 },
      });
      await revokeSeatQuota(tx, target.userId, "ORG_SEAT_REVOKED");
      await audit(tx, actor, "MEMBER_REMOVED", "OrgMember", memberId);
    });
  }

  /** One-off extra tokens for a seat this cycle (resets at the next refill). */
  async topUpMember(actor: Actor, memberId: number, tokens: number) {
    const target = await prisma.orgMember.findFirst({ where: { id: memberId, orgId: actor.orgId } });
    if (!target) throw new ApiError("Member not found", STATUS_CODES.NOT_FOUND);
    if (target.status !== "ACTIVE") throw new ApiError("Only active members can receive tokens.", STATUS_CODES.CONFLICT);

    return prisma.$transaction(async (tx) => {
      await adjustSeatQuota(tx, { userId: target.userId, tokenDelta: tokens, reason: "ORG_ADMIN_TOPUP", meta: { orgId: actor.orgId, byUserId: actor.userId } });
      const updated = await tx.orgMember.update({ where: { id: memberId }, data: { tokenBonus: { increment: tokens } } });
      await audit(tx, actor, "MEMBER_TOPUP", "OrgMember", memberId, { tokens });
      const wallet = await tx.userWallet.findUnique({ where: { userId: target.userId }, select: { tokensRemaining: true } });
      return { tokenBonus: updated.tokenBonus, tokensRemaining: wallet?.tokensRemaining ?? 0 };
    });
  }

  /**
   * Usage metrics for one seat: totals, a daily series, a per-model split and
   * wallet state. Deliberately returns no chat/message identifiers or content.
   */
  async getMemberUsage(orgId: number, memberId: number, days = 30) {
    const member = await prisma.orgMember.findFirst({
      where: { id: memberId, orgId },
      include: {
        role: { select: { id: true, name: true, monthlyTokens: true, monthlyVideoCredits: true, dailyTokenCap: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userWallet: { select: { tokensRemaining: true, tokensUsed: true, currentPeriodEnd: true } },
            creditWallet: { select: { bundledCredits: true, topupCredits: true, creditsUsed: true } },
          },
        },
      },
    });
    if (!member) throw new ApiError("Member not found", STATUS_CODES.NOT_FOUND);

    const since = dayjs().subtract(days - 1, "day").startOf("day");
    const rows = await prisma.usageLog.findMany({
      where: { userId: member.userId, createdAt: { gte: since.toDate() } },
      select: { createdAt: true, billableTotalTokens: true, modelId: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    });

    const perDay = new Map<string, number>();
    for (let i = 0; i < days; i++) perDay.set(since.add(i, "day").format("YYYY-MM-DD"), 0);
    const perModel = new Map<number, { tokens: number; requests: number }>();
    let totalTokens = 0;
    for (const r of rows) {
      const key = dayjs(r.createdAt).format("YYYY-MM-DD");
      perDay.set(key, (perDay.get(key) ?? 0) + r.billableTotalTokens);
      const pm = perModel.get(r.modelId) ?? { tokens: 0, requests: 0 };
      pm.tokens += r.billableTotalTokens;
      pm.requests += 1;
      perModel.set(r.modelId, pm);
      totalTokens += r.billableTotalTokens;
    }

    const models = perModel.size
      ? await prisma.model.findMany({ where: { id: { in: [...perModel.keys()] } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(models.map((m) => [m.id, m.name]));

    return {
      member: {
        id: member.id,
        memberRole: member.memberRole,
        status: member.status,
        tokenBonus: member.tokenBonus,
        role: member.role,
        user: { id: member.user.id, firstName: member.user.firstName, lastName: member.user.lastName, email: member.user.email },
      },
      wallet: {
        tokensRemaining: member.user.userWallet?.tokensRemaining ?? 0,
        tokensUsed: member.user.userWallet?.tokensUsed ?? 0,
        refillsAt: member.user.userWallet?.currentPeriodEnd ?? null,
        videoCreditsRemaining: (member.user.creditWallet?.bundledCredits ?? 0) + (member.user.creditWallet?.topupCredits ?? 0),
      },
      periodDays: days,
      totals: { tokens: totalTokens, requests: rows.length },
      daily: [...perDay].map(([date, tokens]) => ({ date, tokens })),
      byModel: [...perModel]
        .map(([id, v]) => ({ modelId: id, name: nameById.get(id) ?? `Model ${id}`, ...v }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 8),
    };
  }

  // ── Invites ──────────────────────────────────────────────────────────────
  async listInvites(orgId: number) {
    return prisma.orgInvite.findMany({
      where: { orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        memberRole: true,
        expiresAt: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
    });
  }

  private sendInviteEmail(email: string, orgName: string, inviteUrl: string) {
    return sendOrgInviteEmail(email, orgName, inviteUrl);
  }

  async createInvites(
    actor: Actor,
    items: { email: string; orgRoleId: number; memberRole: "ADMIN" | "MEMBER"; takesSeat?: boolean }[],
  ) {
    const org = await prisma.organization.findUnique({ where: { id: actor.orgId } });
    if (!org || org.isDeleted || org.status !== "ACTIVE") {
      throw new ApiError("Organization is not active.", STATUS_CODES.FORBIDDEN);
    }
    const sub = await getCurrentOrgSubscription(prisma, actor.orgId);
    if (!sub || sub.status !== "ACTIVE") {
      throw new ApiError("The organization subscription isn't active yet.", STATUS_CODES.CONFLICT);
    }
    if (items.some((i) => i.memberRole === "ADMIN") && actor.memberRole !== "OWNER") {
      throw new ApiError("Only an owner can invite admins.", STATUS_CODES.FORBIDDEN);
    }

    const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
    const results: {
      email: string;
      ok: boolean;
      error?: string;
      inviteUrl?: string;
      emailSent?: boolean;
    }[] = [];

    for (const item of items) {
      const email = item.email.toLowerCase();
      try {
        if (org.allowedEmailDomains.length && !org.allowedEmailDomains.includes(email.split("@")[1])) {
          throw new ApiError("Email domain isn't allowed for this organization.", STATUS_CODES.BAD_REQUEST);
        }
        if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
          throw new ApiError("This email already has an account. Use a different work email.", STATUS_CODES.CONFLICT);
        }
        const role = await prisma.orgRole.findFirst({
          where: { id: item.orgRoleId, orgId: actor.orgId, isDeleted: false },
          select: { id: true },
        });
        if (!role) throw new ApiError("Role not found.", STATUS_CODES.NOT_FOUND);

        const token = randomBytes(32).toString("hex");
        // Only admins can be manage-only; plain members always take a seat.
        const takesSeat = item.memberRole === "MEMBER" ? true : (item.takesSeat ?? true);
        await prisma.$transaction(
          async (tx) => {
            // Re-inviting the same email replaces its earlier pending invite.
            await tx.orgInvite.updateMany({
              where: { orgId: actor.orgId, email, acceptedAt: null, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            if (takesSeat && (await countSeatsInUse(tx, actor.orgId)) >= sub.seatsPurchased) {
              throw new ApiError("No free seats. Add seats in Billing first.", STATUS_CODES.CONFLICT);
            }
            const invite = await tx.orgInvite.create({
              data: {
                orgId: actor.orgId,
                email,
                orgRoleId: item.orgRoleId,
                memberRole: item.memberRole,
                takesSeat,
                tokenHash: hashToken(token),
                expiresAt: dayjs().add(INVITE_TTL_DAYS, "day").toDate(),
                invitedByUserId: actor.userId,
              },
            });
            await audit(tx, actor, "MEMBER_INVITED", "OrgInvite", invite.id, { email, orgRoleId: item.orgRoleId, memberRole: item.memberRole });
          },
          { isolationLevel: "Serializable" },
        );

        const inviteUrl = `${frontendUrl}/join/${token}`;
        results.push({ email, ok: true, inviteUrl, emailSent: await this.sendInviteEmail(email, org.name, inviteUrl) });
      } catch (e: any) {
        results.push({ email, ok: false, error: e?.message ?? "Failed to invite" });
      }
    }
    return results;
  }

  async revokeInvite(actor: Actor, inviteId: number) {
    const invite = await prisma.orgInvite.findFirst({
      where: { id: inviteId, orgId: actor.orgId, acceptedAt: null, revokedAt: null },
    });
    if (!invite) throw new ApiError("Invite not found", STATUS_CODES.NOT_FOUND);
    await prisma.$transaction([
      prisma.orgInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } }),
      audit(prisma, actor, "INVITE_REVOKED", "OrgInvite", inviteId, { email: invite.email }),
    ]);
  }

  // ── Roles ────────────────────────────────────────────────────────────────
  async listRoles(orgId: number) {
    const roles = await prisma.orgRole.findMany({
      where: { orgId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { members: { where: { status: { not: "REMOVED" } } } } } },
    });
    return roles.map(({ _count, ...r }) => ({ ...r, memberCount: _count.members }));
  }

  private async assertVideoModelIds(ids?: number[]) {
    if (!ids?.length) return;
    const found = await prisma.model.count({ where: { id: { in: ids }, isDeleted: false } });
    if (found !== new Set(ids).size) throw new ApiError("One or more video models don't exist.", STATUS_CODES.BAD_REQUEST);
  }

  async createRole(actor: Actor, data: any) {
    await this.assertVideoModelIds(data.videoModelIds);
    try {
      return await prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.orgRole.updateMany({ where: { orgId: actor.orgId }, data: { isDefault: false } });
        const role = await tx.orgRole.create({ data: { ...data, orgId: actor.orgId } });
        await audit(tx, actor, "ROLE_CREATED", "OrgRole", role.id, { name: role.name });
        return role;
      });
    } catch (e: any) {
      if (e?.code === "P2002") throw new ApiError("A role with this name already exists.", STATUS_CODES.CONFLICT);
      throw e;
    }
  }

  async updateRole(actor: Actor, roleId: number, data: any) {
    const existing = await prisma.orgRole.findFirst({ where: { id: roleId, orgId: actor.orgId, isDeleted: false } });
    if (!existing) throw new ApiError("Role not found", STATUS_CODES.NOT_FOUND);
    await this.assertVideoModelIds(data.videoModelIds);
    const { applyNow, ...roleData } = data;
    try {
      return await prisma.$transaction(async (tx) => {
        if (roleData.isDefault) await tx.orgRole.updateMany({ where: { orgId: actor.orgId }, data: { isDefault: false } });
        const role = await tx.orgRole.update({ where: { id: roleId }, data: roleData });

        // Optional: shift current balances by the quota change instead of waiting for the next refill.
        let adjusted = 0;
        if (applyNow) {
          const tokenDelta = role.monthlyTokens - existing.monthlyTokens;
          const creditDelta = role.monthlyVideoCredits - existing.monthlyVideoCredits;
          if (tokenDelta || creditDelta) {
            const members = await tx.orgMember.findMany({
              where: { orgId: actor.orgId, orgRoleId: roleId, status: "ACTIVE" },
              select: { userId: true },
            });
            for (const m of members) {
              await adjustSeatQuota(tx, { userId: m.userId, tokenDelta, creditDelta, reason: "ORG_ROLE_QUOTA_CHANGED", meta: { roleId } });
            }
            adjusted = members.length;
          }
        }

        await audit(tx, actor, "ROLE_UPDATED", "OrgRole", roleId, { changed: Object.keys(roleData), applyNow: Boolean(applyNow), membersAdjusted: adjusted });
        return role;
      });
    } catch (e: any) {
      if (e?.code === "P2002") throw new ApiError("A role with this name already exists.", STATUS_CODES.CONFLICT);
      throw e;
    }
  }

  async deleteRole(actor: Actor, roleId: number) {
    const role = await prisma.orgRole.findFirst({ where: { id: roleId, orgId: actor.orgId, isDeleted: false } });
    if (!role) throw new ApiError("Role not found", STATUS_CODES.NOT_FOUND);

    const [members, invites] = await Promise.all([
      prisma.orgMember.count({ where: { orgRoleId: roleId, status: { not: "REMOVED" } } }),
      prisma.orgInvite.count({
        where: { orgRoleId: roleId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    // Deliberately blocked, never auto-moved: reassign people first.
    if (members > 0 || invites > 0) {
      throw new ApiError(
        `This role is used by ${members} member(s) and ${invites} pending invite(s). Reassign them first.`,
        STATUS_CODES.CONFLICT,
      );
    }
    if (role.isDefault) {
      throw new ApiError("Make another role the default before deleting this one.", STATUS_CODES.CONFLICT);
    }

    await prisma.$transaction([
      // Free the name for reuse.
      prisma.orgRole.update({
        where: { id: roleId },
        data: { isDeleted: true, name: `${role.name}__deleted_${roleId}` },
      }),
      audit(prisma, actor, "ROLE_DELETED", "OrgRole", roleId, { name: role.name }),
    ]);
  }
}

export default OrgService;
