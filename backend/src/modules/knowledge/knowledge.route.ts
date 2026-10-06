import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { upload } from "@/middlewares/upload.js";
import * as controller from "./knowledge.controller.js";

const router = Router();
const authed = auth("USER", "ADMIN", "SUPERADMIN");

router.get("/sources", authed, controller.listSources);
router.post("/sources", authed, controller.createTextSource);
router.post(
  "/sources/upload",
  authed,
  upload.single("file"),
  controller.uploadSource,
);
router.post("/sources/bulk", authed, controller.bulkPosts);
router.post("/sources/:id/reindex", authed, controller.reindexSource);
router.delete("/sources/:id", authed, controller.deleteSource);
router.post("/search", authed, controller.search);

export default router;
