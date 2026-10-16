import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as controller from "./github.controller.js";

// Mounted at /api/github. `callback` and `webhook` are PUBLIC on purpose:
// GitHub calls them without our Bearer token (identity rides in the signed
// OAuth state / the webhook HMAC instead).
const router = Router();
const authed = auth("USER", "ADMIN", "SUPERADMIN");

router.get("/callback", controller.callback);
router.post("/webhook", controller.webhook);

router.get("/status", authed, controller.getStatus);
router.get("/install-url", authed, controller.getInstallUrl);
router.delete("/connection", authed, controller.disconnect);

router.get("/repos", authed, controller.listRepos);
router.post("/repos", authed, controller.createRepo);

router.get("/projects/:projectId", authed, controller.getLink);
router.post("/projects/:projectId/link", authed, controller.linkProject);
router.delete("/projects/:projectId/link", authed, controller.unlinkProject);
router.patch("/projects/:projectId/auto-push", authed, controller.setAutoPush);
router.post("/projects/:projectId/push", authed, controller.push);
router.post("/projects/:projectId/pull", authed, controller.pull);

export default router;
