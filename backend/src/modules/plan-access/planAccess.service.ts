import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import type { Model, Plan } from "@prisma/client";

export interface OrgModelPolicy {
  mode: "ALL" | "ALLOWLIST" | "BLOCKLIST";
  modelIds: number[];
}

/** The org-role policy governing a seat present on PlanContext only for org members. */
export interface OrgPolicy {
  orgId: number;
  memberId: number;
  memberRole: "OWNER" | "ADMIN" | "MEMBER";
  roleId: number;
  roleName: string;
  codeWorkspaceEnabled: boolean;
  voiceEnabled: boolean;
  modelPolicy: OrgModelPolicy;
  videoModelIds: number[];
  dailyTokenCap: number | null;
  perRequestTokenCap: number | null;
}

export interface PlanContext {
  plan: Plan;
  subscriptionId: number | null;
  org?: OrgPolicy;
}

/**
 * Resolves the plan that currently governs a user's access. Falls back to
 * the Free plan (by name) if the user has no ACTIVE subscription this is
 * the single place "what plan is this user on right now" gets decided, so
 * every module (chat, video, document) sees the same answer.
 */
export async function getUserPlanContext(userId: number): Promise<PlanContext> {
  // Org seats are governed by their org's plan + role policy. Everyone else
  // (and everything when the feature flag is off) takes the unchanged
  // personal path below.
  if (isEnterpriseEnabled()) {
    const orgCtx = await getOrgPlanContext(userId);
    if (orgCtx) return orgCtx;
  }
  return getPersonalPlanContext(userId);
}

/**
 * Plan context for an active org seat, or null when the user isn't one or
 * when their org is suspended / has no ACTIVE subscription, in which case the
 * seat falls back to the personal path (Free for an org-created account).
 */
export async function getOrgPlanContext(userId: number): Promise<PlanContext | null> {
  const member = await prisma.orgMember.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      // Manage-only admins aren't seats: they use the personal plan path.
      takesSeat: true,
      organization: { status: "ACTIVE", isDeleted: false },
    },
    include: {
      role: true,
      organization: {
        include: {
          subscriptions: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { plan: true },
          },
        },
      },
    },
  });
  if (!member || member.role.isDeleted) return null;

  const orgSub = member.organization.subscriptions[0];
  if (!orgSub) return null;

  const role = member.role;
  // Role flags replace the plan's flags so the existing assertCan* helpers and
  // requirePlanCapability keep working without knowing about orgs.
  const plan: Plan = {
    ...orgSub.plan,
    restrictToFreeModels: false,
    imageGenEnabled: role.imageGenEnabled,
    documentGenEnabled: role.documentGenEnabled,
    videoGenEnabled: role.videoGenEnabled,
    monthlyVideoCredits: role.monthlyVideoCredits,
    tokenLimit: role.monthlyTokens,
  };

  return {
    plan,
    subscriptionId: null,
    org: {
      orgId: member.orgId,
      memberId: member.id,
      memberRole: member.memberRole,
      roleId: role.id,
      roleName: role.name,
      codeWorkspaceEnabled: role.codeWorkspaceEnabled,
      voiceEnabled: role.voiceEnabled,
      modelPolicy: role.modelPolicy as unknown as OrgModelPolicy,
      videoModelIds: role.videoModelIds,
      dailyTokenCap: role.dailyTokenCap,
      perRequestTokenCap: role.perRequestTokenCap,
    },
  };
}

async function getPersonalPlanContext(userId: number): Promise<PlanContext> {
  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });

  if (activeSubscription) {
    return { plan: activeSubscription.plan, subscriptionId: activeSubscription.id };
  }

  const freePlan = await prisma.plan.findFirst({
    where: { name: "Free", isDeleted: false },
  });

  if (!freePlan) {
    // Misconfiguration (Free plan deleted/renamed) fail closed rather than
    // silently granting access.
    throw new ApiError("No active plan found for this account", STATUS_CODES.FORBIDDEN);
  }

  return { plan: freePlan, subscriptionId: null };
}

export function assertCanGenerateImage(ctx: PlanContext) {
  if (!ctx.plan.imageGenEnabled) {
    throw new ApiError(
      "Image generation isn't included in your current plan.",
      STATUS_CODES.FORBIDDEN,
    );
  }
}

export function assertCanGenerateDocument(ctx: PlanContext) {
  if (!ctx.plan.documentGenEnabled) {
    throw new ApiError(
      "Document generation isn't included in your current plan.",
      STATUS_CODES.FORBIDDEN,
    );
  }
}

export async function assertCanGenerateVideo(ctx: PlanContext, model: Pick<Model, "id" | "name">) {
  if (!ctx.plan.videoGenEnabled) {
    throw new ApiError(
      "Video generation isn't included in your current plan.",
      STATUS_CODES.FORBIDDEN,
    );
  }

  // Org seats: the role's own video-model list replaces the plan allow-list.
  const allowed = ctx.org
    ? ctx.org.videoModelIds.includes(model.id)
    : await prisma.planVideoModel.findUnique({
        where: { planId_modelId: { planId: ctx.plan.id, modelId: model.id } },
      });

  if (!allowed) {
    throw new ApiError(
      `${model.name} isn't available on your current plan upgrade to unlock it.`,
      STATUS_CODES.FORBIDDEN,
    );
  }
}
