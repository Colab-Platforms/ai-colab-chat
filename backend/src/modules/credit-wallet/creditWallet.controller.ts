import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import CreditWalletService from "./creditWallet.service.js";
import { validateCreateTopUpSchema } from "./creditWallet.validators.js";

const creditWalletService = new CreditWalletService();

export const getCreditWallet = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await creditWalletService.getWallet(req.user!.id);
    sendResponse(res, true, result, "Credit wallet fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Get credit wallet error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const getCreditTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await creditWalletService.getTransactions(req.query, req.user!.id);
    sendResponse(res, true, result, "Credit transactions fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Get credit transactions error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const getCreditPricing = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await creditWalletService.getPricing();
    sendResponse(res, true, result, "Credit pricing fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Get credit pricing error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const createTopUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateCreateTopUpSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await creditWalletService.createTopUp(req.user!.id, value.amountInr);
    sendResponse(res, true, result, "Credit top-up initiated", STATUS_CODES.CREATED);
  } catch (error: any) {
    console.error("Create credit top-up error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};
