import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as adminController from "./admin.controller.js";

const router = Router();

router.get(
  "/overview",
  auth("ADMIN", "SUPERADMIN"),
  adminController.getOverview,
);

export default router;
