import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as adminService from "./admin.service.js";

export const getOverview = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await adminService.getOverview();
    sendResponse(
      res,
      true,
      result,
      "Admin overview fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get admin overview error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};
