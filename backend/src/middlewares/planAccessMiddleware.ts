import { Request, Response, NextFunction } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import {
  getUserPlanContext,
  assertCanGenerateImage,
  assertCanGenerateDocument,
} from "@/modules/plan-access/planAccess.service.js";

type Capability = "IMAGE_GENERATION" | "DOCUMENT_GENERATION" | "VIDEO_GENERATION";

/**
 * Coarse, route-level plan gate — mirrors the auth() middleware factory shape
 * and slots in right after it. Only covers capabilities that don't depend on
 * which specific model the request picks (video's per-model allow-list check
 * still has to happen in video.service.ts, once the model is loaded).
 */
export const requirePlanCapability = (capability: Capability) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await getUserPlanContext(req.user!.id);
      req.planContext = ctx;

      if (capability === "IMAGE_GENERATION") {
        assertCanGenerateImage(ctx);
      } else if (capability === "DOCUMENT_GENERATION") {
        assertCanGenerateDocument(ctx);
      } else if (capability === "VIDEO_GENERATION" && !ctx.plan.videoGenEnabled) {
        sendResponse(
          res,
          false,
          null,
          "Video generation isn't included in your current plan.",
          STATUS_CODES.FORBIDDEN,
        );
        return;
      }

      next();
    } catch (err: any) {
      sendResponse(res, false, null, err.message, err.statusCode ?? STATUS_CODES.FORBIDDEN);
    }
  };
};
