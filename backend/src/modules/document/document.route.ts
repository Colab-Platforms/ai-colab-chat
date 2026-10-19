import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { requirePlanCapability } from "@/middlewares/planAccessMiddleware.js";
import * as documentController from "./document.controller.js";

const router = Router();

router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), documentController.listDocuments);
// Must stay above "/:id" or "templates" would be read as a document id.
router.get("/templates", auth("USER", "ADMIN", "SUPERADMIN"), documentController.listTemplates);
router.get("/:id", auth("USER", "ADMIN", "SUPERADMIN"), documentController.getDocumentById);
router.get("/:id/spec", auth("USER", "ADMIN", "SUPERADMIN"), documentController.getDocumentSpec);
router.post(
  "/",
  auth("USER", "ADMIN", "SUPERADMIN"),
  requirePlanCapability("DOCUMENT_GENERATION"),
  documentController.createDocument,
);
router.patch("/:id", auth("USER", "ADMIN", "SUPERADMIN"), documentController.updateDocumentStyle);
// Replaces the stored content (manual edits). Distinct from PATCH "/:id",
// which only restyles and re-renders.
router.put("/:id/spec", auth("USER", "ADMIN", "SUPERADMIN"), documentController.updateDocumentSpec);
// AI actions on a mind map. Both bill the caller's token wallet.
router.post("/:id/mindmap/expand", auth("USER", "ADMIN", "SUPERADMIN"), documentController.expandMindmapNodeHandler);
router.post("/:id/mindmap/ask", auth("USER", "ADMIN", "SUPERADMIN"), documentController.askMindmapHandler);
router.post("/:id/retry", auth("USER", "ADMIN", "SUPERADMIN"), documentController.retryDocument);
router.delete("/:id", auth("USER", "ADMIN", "SUPERADMIN"), documentController.deleteDocument);

export default router;
