import type { Request, Response } from "express";
import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import { getOrgPlanContext, type OrgPolicy } from "@/modules/plan-access/planAccess.service.js";
import { isModelAllowed } from "./org.policy.pure.js";

/**
 * Org-role enforcement for requests made by org seats. Every function here is
 * a no-op for anyone who isn't an active org seat (and for everyone when
 * ENTERPRISE_ENABLED is off), so regular users never reach an org query beyond
 * the single membership lookup.
 */

/** Throws unless the seat's role may use this model and is under its daily cap. */
export async function assertOrgModelAccess(
  userId: number,
  model: { id: number; name: string },
  opts: { chatType?: string } = {},
): Promise<OrgPolicy | null> {
  if (!isEnterpriseEnabled()) return null;
  const ctx = await getOrgPlanContext(userId);
  const org = ctx?.org;
  if (!org) return null;

  if (!isModelAllowed(org, model.id)) {
    throw new ApiError(
      `${model.name} isn't enabled for your role by your organization.`,
      STATUS_CODES.FORBIDDEN,
    );
  }

  if (opts.chatType === "CODE" && !org.codeWorkspaceEnabled) {
    throw new ApiError("Code workspace isn't enabled for your role.", STATUS_CODES.FORBIDDEN);
  }

  if (org.dailyTokenCap != null) {
    const since = dayjs().startOf("day").toDate();
    const used = await prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: { billableTotalTokens: true },
    });
    if ((used._sum.billableTotalTokens ?? 0) >= org.dailyTokenCap) {
      throw new ApiError("You've reached your daily usage limit. It resets tomorrow.", STATUS_CODES.FORBIDDEN);
    }
  }
  return org;
}

/**
 * Chat-stream adapter: writes the error response itself and returns false so
 * the caller can simply `if (!(await guardOrgModelAccess(...))) return;`.
 */
export async function guardOrgModelAccess(
  req: Request,
  res: Response,
  userId: number,
  model: { id: number; name: string },
): Promise<boolean> {
  try {
    const org = await assertOrgModelAccess(userId, model, { chatType: req.body?.chatType });
    // Read by checkTokenLimitsAndSetupStream to cap the response length.
    if (org?.perRequestTokenCap) res.locals.orgCompletionCap = org.perRequestTokenCap;
    return true;
  } catch (err: any) {
    res.status(err.statusCode ?? 403).json({ status: false, code: "ORG_POLICY", message: err.message });
    return false;
  }
}

export async function assertOrgVoiceAccess(userId: number): Promise<void> {
  if (!isEnterpriseEnabled()) return;
  const org = (await getOrgPlanContext(userId))?.org;
  if (org && !org.voiceEnabled) {
    throw new ApiError("Voice isn't enabled for your role.", STATUS_CODES.FORBIDDEN);
  }
}

/**
 * Org seats are paid for by the org: they can't buy a personal plan or
 * credits on the side. Removed members are ordinary users again.
 */
export async function assertNotOrgSeat(userId: number): Promise<void> {
  if (!isEnterpriseEnabled()) return;
  const seat = await prisma.orgMember.findFirst({
    where: { userId, takesSeat: true, status: { in: ["ACTIVE", "SUSPENDED"] } },
    select: { id: true },
  });
  if (seat) {
    throw new ApiError("Your plan is managed by your organization.", STATUS_CODES.FORBIDDEN);
  }
}
