import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as guestController from "./guest.controller.js";

const router = Router();

router.post("/session", guestController.startSession);
router.get("/config", guestController.getConfig);
router.get("/status", auth("GUEST"), guestController.getStatus);
router.post("/merge", auth("USER"), guestController.merge);

export default router;
