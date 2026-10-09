import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import VoiceService from "./voice.service.js";
import { VOICE_OPTIONS } from "./voice-options.js";

const voiceService = new VoiceService();

export const listVoiceOptions = async (_req: Request, res: Response): Promise<void> => {
    sendResponse(res, true, VOICE_OPTIONS, "Voice options fetched", STATUS_CODES.OK);
};

export const createSession = async (req: Request, res: Response): Promise<void> => {
    try {
        const { voiceId, chatId, attachmentIds } = req.body ?? {};
        const result = await voiceService.createSession(
            req.user!.id,
            voiceId,
            chatId ? Number(chatId) : undefined,
            Array.isArray(attachmentIds) ? attachmentIds.map(Number) : undefined,
        );
        sendResponse(res, true, result, "Voice session created", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Create voice session error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const getInternalContext = async (req: Request, res: Response): Promise<void> => {
    try {
        const chatId = Number(req.params.chatId);
        const result = await voiceService.getContextForChat(chatId);
        sendResponse(res, true, result, "Context fetched", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Get voice context error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const postInternalDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const { chatId, prompt, format } = req.body ?? {};
        if (!chatId || !prompt || typeof prompt !== "string" || !prompt.trim()) {
            sendResponse(res, false, null, "chatId and prompt are required", STATUS_CODES.BAD_REQUEST);
            return;
        }

        const document = await voiceService.generateDocument(Number(chatId), prompt, format);
        sendResponse(res, true, document, "Document generation started", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Trigger voice document generation error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};

export const postInternalMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { chatId, role, content } = req.body ?? {};
        if (!chatId || !role || typeof content !== "string" || !content.trim()) {
            sendResponse(res, false, null, "chatId, role and content are required", STATUS_CODES.BAD_REQUEST);
            return;
        }
        if (role !== "USER" && role !== "ASSISTANT") {
            sendResponse(res, false, null, "role must be USER or ASSISTANT", STATUS_CODES.BAD_REQUEST);
            return;
        }

        const message = await voiceService.appendMessage(Number(chatId), role, content);
        sendResponse(res, true, message, "Message saved", STATUS_CODES.OK);
    } catch (error: any) {
        console.error("Post voice message error", error);
        sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
};
