import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { upload } from "@/middlewares/upload.js";
import * as attachmentController from "./attachment.controller.js";

const router = Router();

// New presend route - upload file to Cloudinary before a message exists
router.post(
  "/presend",
  auth("USER", "ADMIN", "SUPERADMIN"),
  upload.single("file"),
  attachmentController.presendAttachment,
);

// Legacy route - tied to an existing messageId
router.post(
  "/",
  auth("USER", "ADMIN", "SUPERADMIN"),
  upload.single("file"),
  attachmentController.uploadAttachment,
);

// Public download route - streams the file with the original filename.
router.get(
  "/:id/download",
  attachmentController.downloadAttachment,
);

// Delete presend attachment
router.delete(
  "/:id",
  auth("USER", "ADMIN", "SUPERADMIN"),
  attachmentController.deleteAttachment,
);

export default router;
