import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as controller from "./vercel.controller.js";

// Mounted at /api/vercel. `callback` is PUBLIC on purpose: Vercel redirects the
// popup there without our Bearer token (identity rides in the signed OAuth state).
//
// The three stream routes are POSTs read with fetch() + getReader(), not
// EventSource GETs — EventSource can't send the Authorization header.
const router = Router();
const authed = auth("USER", "ADMIN", "SUPERADMIN");

router.get("/callback", controller.callback);

router.get("/status", authed, controller.getStatus);
router.get("/install-url", authed, controller.getInstallUrl);
router.delete("/connection", authed, controller.disconnect);

router.get("/projects/:projectId", authed, controller.getLink);
router.get("/projects/:projectId/detect", authed, controller.detect);
router.get("/projects/:projectId/deployments", authed, controller.listDeployments);
router.post("/projects/:projectId/deploy", authed, controller.deploy);
router.post("/projects/:projectId/redeploy", authed, controller.redeploy);
router.get("/projects/:projectId/deploy/:deploymentId", authed, controller.getDeployment);
router.post("/projects/:projectId/deploy/:deploymentId/logs", authed, controller.logs);
router.post("/projects/:projectId/deploy/:deploymentId/cancel", authed, controller.cancel);
router.delete("/projects/:projectId/link", authed, controller.unlinkProject);

export default router;
