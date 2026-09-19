import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as documentController from "./document.controller.js";

const router = Router();

router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), documentController.listDocuments);
router.get("/:id", auth("USER", "ADMIN", "SUPERADMIN"), documentController.getDocumentById);
router.get("/:id/spec", auth("USER", "ADMIN", "SUPERADMIN"), documentController.getDocumentSpec);
router.post("/", auth("USER", "ADMIN", "SUPERADMIN"), documentController.createDocument);
router.patch("/:id", auth("USER", "ADMIN", "SUPERADMIN"), documentController.updateDocumentStyle);
router.post("/:id/retry", auth("USER", "ADMIN", "SUPERADMIN"), documentController.retryDocument);
router.delete("/:id", auth("USER", "ADMIN", "SUPERADMIN"), documentController.deleteDocument);

export default router;
