import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import GuestService, { GuestLimitError } from "./guest.service.js";
import { GUEST_LIMITS } from "./guest.config.js";

const guestService = new GuestService();

const fail = (res: Response, error: any) => {
  if (error instanceof GuestLimitError) {
    res.status(STATUS_CODES.FORBIDDEN).json({
      status: false,
      code: error.code,
      message: error.message,
    });
    return;
  }
  sendResponse(
    res,
    false,
    null,
    error.message,
    error.statusCode ?? STATUS_CODES.SERVER_ERROR,
  );
};

/** POST /guest/session — start a trial for a logged-out visitor. */
export const startSession = async (req: Request, res: Response) => {
  try {
    const result = await guestService.startSession(
      req.ip ?? "unknown",
      req.headers["user-agent"],
    );
    sendResponse(res, true, result, "Guest session started", STATUS_CODES.CREATED);
  } catch (error: any) {
    console.error("Guest session error", error);
    fail(res, error);
  }
};

/** GET /guest/status — remaining trial messages for the calling guest. */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const result = await guestService.getStatus(req.user!.id);
    sendResponse(res, true, result, "Guest status fetched", STATUS_CODES.OK);
  } catch (error: any) {
    fail(res, error);
  }
};

/** GET /guest/config — limits and model list the trial UI needs. */
export const getConfig = async (req: Request, res: Response) => {
  try {
    const [models, ipMessagesLeft] = await Promise.all([
      guestService.listAllowedModels(),
      guestService.ipMessagesLeft(req.ip ?? "unknown"),
    ]);
    sendResponse(
      res,
      true,
      {
        singleMessages: GUEST_LIMITS.singleMessages,
        multiMessages: GUEST_LIMITS.multiMessages,
        maxCompareModels: GUEST_LIMITS.maxCompareModels,
        ipMessagesLeft,
        models,
      },
      "Guest config fetched",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    fail(res, error);
  }
};

/** POST /guest/merge — called with the NEW account's token after signup/login. */
export const merge = async (req: Request, res: Response) => {
  try {
    const guestToken = req.body?.guestToken;
    if (typeof guestToken !== "string" || !guestToken) {
      sendResponse(res, false, null, "guestToken is required", STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await guestService.mergeInto(guestToken, req.user!.id);
    sendResponse(res, true, result, "Guest chats merged", STATUS_CODES.OK);
  } catch (error: any) {
    fail(res, error);
  }
};
