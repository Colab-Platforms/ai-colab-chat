import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as controller from "./demo-request.controller.js";

const router = Router();

// Public: the /business demo form (no sign-in).
router.post("/", controller.createDemoRequest);

// Admin only: review and work the leads.
router.get("/", auth("ADMIN", "SUPERADMIN"), controller.listDemoRequests);
router.patch("/:id", auth("ADMIN", "SUPERADMIN"), controller.updateDemoRequest);
router.delete("/:id", auth("ADMIN", "SUPERADMIN"), controller.deleteDemoRequest);

export default router;
