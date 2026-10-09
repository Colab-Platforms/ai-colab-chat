import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as chatController from "./chat.controller.js";
import {
  streamChat,
  regenerateChat,
  prepareMulti,
  prepareEditMulti,
  editAndResend,
  continueChatStream,
  stopChatGeneration,
} from "./chat.stream.js";

const router = Router();

router.post(
  "/",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.createChat,
);
router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), chatController.listChats);
router.get("/shared/:shareId", chatController.getSharedChat);
router.get(
  "/:id",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.getChatById,
);
router.get(
  "/:id/contexts",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.getChatContexts,
);
router.put(
  "/:id/contexts",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.replaceChatContexts,
);
router.patch(
  "/:id/archive",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.archiveChat,
);
router.patch(
  "/:id/pin",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.pinChat,
);
router.patch(
  "/:id/share",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.shareChat,
);
router.put(
  "/:id",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.updateChat,
);
router.delete(
  "/:id",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.deleteChat,
);
router.post("/:chatId/send", auth("USER", "ADMIN", "SUPERADMIN"), streamChat);
router.post("/:chatId/stop", auth("USER", "ADMIN", "SUPERADMIN"), stopChatGeneration);
router.post(
  "/:chatId/prepare-multi",
  auth("USER", "ADMIN", "SUPERADMIN"),
  prepareMulti,
);
router.post(
  "/:chatId/messages/:messageId/edit-prepare-multi",
  auth("USER", "ADMIN", "SUPERADMIN"),
  prepareEditMulti,
);
router.post(
  "/:chatId/messages/:messageId/regenerate",
  auth("USER", "ADMIN", "SUPERADMIN"),
  regenerateChat,
);
router.post(
  "/:chatId/responses/:responseId/feedback",
  auth("USER", "ADMIN", "SUPERADMIN"),
  chatController.feedback,
);
router.post(
  "/:chatId/messages/:messageId/edit",
  auth("USER", "ADMIN", "SUPERADMIN"),
  editAndResend,
);
router.post(
  "/:chatId/continue",
  auth("USER", "ADMIN", "SUPERADMIN"),
  continueChatStream,
);

export default router;
