import { Router, type RequestHandler } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { requireOrg } from "./org.access.js";
import * as c from "./org.controller.js";

// Mounted at /org. Feature flag off => the routes behave as if they do not exist.
const router = Router();

router.use((_req, res, next) => {
  if (!isEnterpriseEnabled()) {
    sendResponse(res, false, null, "Not found", STATUS_CODES.NOT_FOUND);
    return;
  }
  next();
});

// Public: the emailed token is the credential, so these are rate limited per IP.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 40;
const hits = new Map<string, number[]>();
const limitPublic: RequestHandler = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(ip, recent);
    sendResponse(res, false, null, "Too many requests. Please try again later.", 429);
    return;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  next();
};

router.get("/invites/:token", limitPublic, c.previewInvite);
router.post("/invites/:token/accept", limitPublic, c.acceptInvite);

const authed = auth("USER", "ADMIN", "SUPERADMIN");
const member = [authed, requireOrg("MEMBER")];
const admin = [authed, requireOrg("ADMIN")];
const owner = [authed, requireOrg("OWNER")];

router.get("/me", ...member, c.getMe);

router.get("/overview", ...admin, c.getOverview);
router.get("/usage", ...admin, c.getUsage);
router.get("/usage/export", ...admin, c.exportUsage);
router.get("/audit", ...admin, c.getAudit);
router.get("/settings", ...admin, c.getSettings);
router.patch("/settings", ...owner, c.updateSettings);
router.post("/transfer-ownership", ...owner, c.transferOwnership);

router.get("/members", ...admin, c.listMembers);
router.patch("/members/:id", ...admin, c.updateMember);
router.delete("/members/:id", ...admin, c.removeMember);
router.post("/members/:id/topup", ...admin, c.topUpMember);
router.get("/members/:id/usage", ...admin, c.getMemberUsage);

router.get("/invites", ...admin, c.listInvites);
router.post("/invites", ...admin, c.createInvites);
router.delete("/invites/:id", ...admin, c.revokeInvite);

router.get("/roles", ...admin, c.listRoles);
router.post("/roles", ...admin, c.createRole);
router.patch("/roles/:id", ...admin, c.updateRole);
router.delete("/roles/:id", ...admin, c.deleteRole);

router.get("/billing", ...owner, c.getBilling);
router.get("/billing/seat-preview", ...owner, c.previewSeats);
router.post("/billing/seats", ...owner, c.changeSeats);
router.post("/billing/bills/:id/pay", ...owner, c.payBill);

export default router;
