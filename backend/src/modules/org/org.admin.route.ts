import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as controller from "./org.admin.controller.js";

// Platform-admin only. Mounted at /admin/orgs.
const router = Router();

// Feature flag off => the routes behave as if they do not exist.
router.use((_req, res, next) => {
  if (!isEnterpriseEnabled()) {
    sendResponse(res, false, null, "Not found", STATUS_CODES.NOT_FOUND);
    return;
  }
  next();
});

router.post("/", auth("ADMIN", "SUPERADMIN"), controller.createOrg);
router.get("/", auth("ADMIN", "SUPERADMIN"), controller.listOrgs);
router.get("/:id", auth("ADMIN", "SUPERADMIN"), controller.getOrg);
router.patch("/:id/status", auth("ADMIN", "SUPERADMIN"), controller.setOrgStatus);
router.post("/:id/close", auth("ADMIN", "SUPERADMIN"), controller.closeOrg);
router.get("/:id/bills", auth("ADMIN", "SUPERADMIN"), controller.listOrgBills);
router.post("/:id/bills/:billId/mark-paid", auth("ADMIN", "SUPERADMIN"), controller.markOrgBillPaid);
router.post("/:id/activate", auth("ADMIN", "SUPERADMIN"), controller.activateOrgSubscription);

export default router;
