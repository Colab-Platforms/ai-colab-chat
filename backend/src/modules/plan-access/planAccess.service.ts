import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import type { Model, Plan } from "@prisma/client";

export interface PlanContext {
  plan: Plan;
  subscriptionId: number | null;
}

/**
 * Resolves the plan that currently governs a user's access. Falls back to
 * the Free plan (by name) if the user has no ACTIVE subscription — this is
 * the single place "what plan is this user on right now" gets decided, so
 * every module (chat, video, document) sees the same answer.
 */
export async function getUserPlanContext(userId: number): Promise<PlanContext> {
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
    // Misconfiguration (Free plan deleted/renamed) — fail closed rather than
    // silently granting access.
    throw new ApiError("No active plan found for this account", STATUS_CODES.FORBIDDEN);
  }

  return { plan: freePlan, subscriptionId: null };
}

export function assertCanUseModel(ctx: PlanContext, model: Pick<Model, "isFreeModel" | "name">) {
  if (ctx.plan.restrictToFreeModels && !model.isFreeModel) {
    throw new ApiError(
      `Your plan only includes free models — ${model.name} requires an upgrade.`,
      STATUS_CODES.FORBIDDEN,
    );
  }
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

  const allowed = await prisma.planVideoModel.findUnique({
    where: { planId_modelId: { planId: ctx.plan.id, modelId: model.id } },
  });

  if (!allowed) {
    throw new ApiError(
      `${model.name} isn't available on your current plan — upgrade to unlock it.`,
      STATUS_CODES.FORBIDDEN,
    );
  }
}
