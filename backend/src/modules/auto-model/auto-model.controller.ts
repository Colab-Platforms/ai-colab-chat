import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import AutoModelService from "./auto-model.service.js";
import { validateResolveSchema } from "./auto-model.validators.js";

const service = new AutoModelService();

export const resolveAutoModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateResolveSchema(req.body);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }

    const result = await service.resolve(req.user!.id, value);
    sendResponse(res, true, result, "Auto model resolved", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Resolve auto model error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};
