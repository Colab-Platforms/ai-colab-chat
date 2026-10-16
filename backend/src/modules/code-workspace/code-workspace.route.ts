import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as controller from "./code-workspace.controller.js";

// Mounted at /api/code-projects. Bodies here are exempt from the global xss
// sanitizer (see middlewares/sanitize.ts) — they carry source code, which is
// only ever shown as editor text or run inside the sandboxed preview iframe.
const router = Router();
const authed = auth("USER", "ADMIN", "SUPERADMIN");

router.get("/:id", authed, controller.getProject);
router.patch("/:id", authed, controller.updateProject);
router.delete("/:id", authed, controller.deleteProject);

router.put("/:id/files", authed, controller.saveFile);
router.post("/:id/files/delete", authed, controller.deleteFile);
router.post("/:id/files/rename", authed, controller.renameFile);

router.get("/:id/versions", authed, controller.listVersions);
router.post("/:id/versions/:version/restore", authed, controller.restoreVersion);

export default router;
