import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import PromptSuggestionService from "./prompt-suggestion.service.js";

const service = new PromptSuggestionService();

export const listLatest = async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await service.latest();
    sendResponse(res, true, items, "Prompt suggestions fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("List prompt suggestions error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};
