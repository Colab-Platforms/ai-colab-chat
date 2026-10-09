import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { Request, Response, NextFunction } from "express";

/** Guards routes called by voice-agent (not the browser) — checked against
 * the same shared secret used when Node calls voice-agent to mint a session. */
export const internalServiceAuth = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.VOICE_AGENT_INTERNAL_TOKEN;
  const provided = req.headers["x-internal-token"];

  if (!expected || provided !== expected) {
    sendResponse(res, false, null, "Unauthorized", STATUS_CODES.UNAUTHORIZED);
    return;
  }

  next();
};
