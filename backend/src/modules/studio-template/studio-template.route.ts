import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as controller from "./studio-template.controller.js";

const router = Router();

// Any signed-in user: the studios read the active templates.
router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), controller.listTemplates);
router.post("/:id/use", auth("USER", "ADMIN", "SUPERADMIN"), controller.recordUse);

// Admin only: curate the trending set.
router.post("/", auth("ADMIN", "SUPERADMIN"), controller.createTemplate);
router.put("/:id", auth("ADMIN", "SUPERADMIN"), controller.updateTemplate);
router.delete("/:id", auth("ADMIN", "SUPERADMIN"), controller.deleteTemplate);

export default router;
