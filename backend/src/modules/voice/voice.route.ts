import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import { internalServiceAuth } from "./voice.internal-auth.js";
import * as voiceController from "./voice.controller.js";

const router = Router();

router.get("/options", auth("USER", "ADMIN", "SUPERADMIN"), voiceController.listVoiceOptions);
router.post("/session", auth("USER", "ADMIN", "SUPERADMIN"), voiceController.createSession);

// Called by voice-agent (Python), not the browser — see voice.internal-auth.ts
router.get("/internal/context/:chatId", internalServiceAuth, voiceController.getInternalContext);
router.post("/internal/messages", internalServiceAuth, voiceController.postInternalMessage);
router.post("/internal/documents", internalServiceAuth, voiceController.postInternalDocument);

export default router;
