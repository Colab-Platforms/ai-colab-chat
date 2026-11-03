import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { resolveAutoModel } from "./auto-model.controller.js";

const router = Router();

router.use(auth("USER", "ADMIN", "SUPERADMIN"));

router.post("/resolve", resolveAutoModel);

export default router;
