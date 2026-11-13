import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { upload } from "@/middlewares/upload.js";
import * as folderController from "./folder.controller.js";

const router = Router();

router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), folderController.listFolders);
router.get("/:id", auth("USER", "ADMIN", "SUPERADMIN"), folderController.getFolder);
router.post("/", auth("USER", "ADMIN", "SUPERADMIN"), folderController.createFolder);
router.put("/:id", auth("USER", "ADMIN", "SUPERADMIN"), folderController.updateFolder);
router.delete("/:id", auth("USER", "ADMIN", "SUPERADMIN"), folderController.deleteFolder);

// Reference documents sent to the model with every chat in the project.
router.get("/:id/documents", auth("USER", "ADMIN", "SUPERADMIN"), folderController.listFolderDocuments);
router.post(
  "/:id/documents",
  auth("USER", "ADMIN", "SUPERADMIN"),
  upload.single("file"),
  folderController.uploadFolderDocument,
);
router.delete("/:id/documents/:docId", auth("USER", "ADMIN", "SUPERADMIN"), folderController.deleteFolderDocument);

export default router;
