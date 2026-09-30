import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { requirePlanCapability } from "@/middlewares/planAccessMiddleware.js";
import * as videoController from "./video.controller.js";
import { openRouterVideoWebhook } from "./video.webhook.controller.js";

const router = Router();

// Registered before "/:id" so Express doesn't treat "models" as an :id param.
router.get("/models", auth("USER", "ADMIN", "SUPERADMIN"), videoController.listVideoModels);
router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), videoController.listVideos);
router.get("/:id", auth("USER", "ADMIN", "SUPERADMIN"), videoController.getVideoById);
// Coarse "does this plan allow video at all" gate — the specific-model
// allow-list check (e.g. Seedance 2.0 full on Pro Plus only) still happens
// in video.service.ts::create/retry, once the model is loaded.
router.post(
  "/",
  auth("USER", "ADMIN", "SUPERADMIN"),
  requirePlanCapability("VIDEO_GENERATION"),
  videoController.createVideo,
);
router.post(
  "/:id/retry",
  auth("USER", "ADMIN", "SUPERADMIN"),
  requirePlanCapability("VIDEO_GENERATION"),
  videoController.retryVideo,
);
router.delete("/:id", auth("USER", "ADMIN", "SUPERADMIN"), videoController.deleteVideo);

// Unauthenticated — verified via HMAC signature instead (see video.webhook.controller.ts).
router.post("/webhooks/openrouter", openRouterVideoWebhook);

export default router;
