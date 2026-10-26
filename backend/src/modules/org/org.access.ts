import { Request, Response, NextFunction } from "express";
import prisma from "@root/prisma.js";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";

type MemberRole = "OWNER" | "ADMIN" | "MEMBER";
const RANK: Record<MemberRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Gate for /org/* routes. Resolves the caller's org membership per request
 * (never from the JWT or request body) so role changes apply immediately, and
 * pins every downstream query to req.org.orgId.
 *
 * Mount after auth(). `min` is the lowest member role allowed.
 */
export const requireOrg = (min: MemberRole = "MEMBER") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isEnterpriseEnabled()) {
        sendResponse(res, false, null, "Not found", STATUS_CODES.NOT_FOUND);
        return;
      }

      const member = await prisma.orgMember.findFirst({
        where: {
          userId: req.user!.id,
          status: "ACTIVE",
          organization: { isDeleted: false, status: { not: "CLOSED" } },
        },
        select: { id: true, orgId: true, memberRole: true },
      });

      if (!member) {
        sendResponse(res, false, null, "You are not part of an organization", STATUS_CODES.FORBIDDEN);
        return;
      }
      if (RANK[member.memberRole] < RANK[min]) {
        sendResponse(res, false, null, "You don't have permission to do this", STATUS_CODES.FORBIDDEN);
        return;
      }

      req.org = { orgId: member.orgId, memberId: member.id, memberRole: member.memberRole };
      next();
    } catch (err: any) {
      sendResponse(res, false, null, err.message, err.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
  };
};

export const roleRank = (r: MemberRole) => RANK[r];
