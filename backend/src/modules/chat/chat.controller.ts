import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import ChatService from "./chat.service.js";
import prisma from "@root/prisma.js";
import { GUEST_LIMITS, GUEST_RESTRICTED_CODE } from "@/modules/guest/guest.config.js";
import {
  validateCreateChatSchema,
  validateUpdateChatSchema,
  validateFeedbackSchema,
  validateUpdateChatContextsSchema,
} from "./chat.validators.js";

const chatService = new ChatService();

export const createChat = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateCreateChatSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    let body = value;
    if (req.user!.role === "GUEST") {
      // Trial chats are plain text chats: no projects, personas or capabilities.
      const chatCount = await prisma.chat.count({
        where: { userId: req.user!.id, isDeleted: false },
      });
      if (chatCount >= GUEST_LIMITS.maxChats) {
        res.status(STATUS_CODES.FORBIDDEN).json({
          status: false,
          code: GUEST_RESTRICTED_CODE,
          message: "Sign up to start more chats.",
        });
        return;
      }
      body = { title: value.title, modelIds: value.modelIds };
    }
    const result = await chatService.create(req.user!.id, body);
    sendResponse(
      res,
      true,
      result,
      "Chat created successfully",
      STATUS_CODES.CREATED,
    );
  } catch (error: any) {
    console.error("Create chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const listChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await chatService.list(req.user!.id, req.query);
    sendResponse(
      res,
      true,
      result,
      "Chats fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("List chats error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const getChatById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await chatService.getById(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Chat fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const updateChat = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateUpdateChatSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await chatService.update(
      req.user!.id,
      parseInt(req.params.id as string),
      value,
    );
    sendResponse(
      res,
      true,
      result,
      "Chat updated successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Update chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const archiveChat = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await chatService.archive(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(res, true, result, "Chat archive toggled", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Archive chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const pinChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await chatService.pin(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(res, true, result, "Chat pin toggled", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Pin chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const shareChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await chatService.share(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Chat shared successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Share chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const getSharedChat = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await chatService.getShared(req.params.shareId as string);
    sendResponse(
      res,
      true,
      result,
      "Shared chat fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get shared chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const deleteChat = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await chatService.softDelete(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Chat deleted successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Delete chat error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const feedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateFeedbackSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await chatService.feedback(
      req.user!.id,
      parseInt(req.params.responseId as string),
      value.isLiked,
    );
    sendResponse(
      res,
      true,
      result,
      "Feedback updated successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Feedback error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const getChatContexts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await chatService.getContexts(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Chat contexts fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get chat contexts error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const replaceChatContexts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateUpdateChatContextsSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }

    const result = await chatService.replaceContexts(
      req.user!.id,
      parseInt(req.params.id as string),
      value.contextIds,
    );
    sendResponse(
      res,
      true,
      result,
      "Chat contexts updated successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Replace chat contexts error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};
