import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as folderController from "./folder.controller.js";

const router = Router();

router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), folderController.listFolders);
router.get("/:id", auth("USER", "ADMIN", "SUPERADMIN"), folderController.getFolder);
router.post("/", auth("USER", "ADMIN", "SUPERADMIN"), folderController.createFolder);
router.put("/:id", auth("USER", "ADMIN", "SUPERADMIN"), folderController.updateFolder);
router.delete("/:id", auth("USER", "ADMIN", "SUPERADMIN"), folderController.deleteFolder);

export default router;
