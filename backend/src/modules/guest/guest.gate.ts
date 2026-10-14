import { Request, Response } from "express";
import prisma from "@root/prisma.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import {
  GUEST_LIMITS,
  GUEST_MODEL_EXTERNAL_IDS,
  GUEST_RESTRICTED_CODE,
} from "./guest.config.js";
import GuestService, { GuestLimitError } from "./guest.service.js";

const guestService = new GuestService();

export const isGuestRequest = (req: Request) => req.user?.role === "GUEST";

const restricted = (res: Response, message: string) => {
  res
    .status(STATUS_CODES.FORBIDDEN)
    .json({ status: false, code: GUEST_RESTRICTED_CODE, message });
};

/** Sends GUEST_LIMIT_REACHED for a GuestLimitError. Returns false for any other error. */
export const respondIfGuestLimit = (res: Response, err: unknown) => {
  if (!(err instanceof GuestLimitError)) return false;
  res
    .status(STATUS_CODES.FORBIDDEN)
    .json({ status: false, code: err.code, message: err.message });
  return true;
};

/**
 * Gate for a guest's POST /chats/:chatId/send. Returns true when the turn may
 * proceed (a trial slot has been taken if this is a new turn).
 */
export async function guardGuestSend(
  req: Request,
  res: Response,
  args: {
    chatId: number;
    model: { id: number; externalId: string };
    attachmentIds?: number[];
    replaceModelId?: number;
    userMessageId?: number;
    assistantMessageId?: number;
  },
): Promise<boolean> {
  const { chatId, model, attachmentIds, replaceModelId, userMessageId, assistantMessageId } = args;

  if (attachmentIds?.length) {
    restricted(res, "Sign up to attach files.");
    return false;
  }
  if (replaceModelId) {
    restricted(res, "Sign up to retry with another model.");
    return false;
  }
  if (!GUEST_MODEL_EXTERNAL_IDS.includes(model.externalId)) {
    restricted(res, "This model is available after you sign up.");
    return false;
  }

  try {
    if (!userMessageId) {
      await guestService.consume(req.user!.id, "single");
      return true;
    }

    // Multi-model turn: prepare-multi already took the slot and made the
    // messages; each model then streams against them. Without these checks the
    // same message could be replayed for free responses.
    if (!assistantMessageId) {
      restricted(res, "Invalid request.");
      return false;
    }
    const latestUser = await prisma.message.findFirst({
      where: { chatId, role: "USER", isDeleted: false },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (latestUser?.id !== userMessageId) {
      restricted(res, "Sign up to continue an earlier message.");
      return false;
    }
    const existing = await prisma.modelResponse.findMany({
      where: { messageId: assistantMessageId },
      select: { modelId: true },
    });
    if (
      existing.length >= GUEST_LIMITS.maxCompareModels ||
      existing.some((r) => r.modelId === model.id)
    ) {
      restricted(res, "Sign up to generate more responses.");
      return false;
    }
    return true;
  } catch (err) {
    if (respondIfGuestLimit(res, err)) return false;
    throw err;
  }
}

/** Gate for a guest's POST /chats/:chatId/prepare-multi. */
export async function guardGuestPrepareMulti(
  req: Request,
  res: Response,
  attachmentIds?: number[],
): Promise<boolean> {
  if (attachmentIds?.length) {
    restricted(res, "Sign up to attach files.");
    return false;
  }
  try {
    await guestService.consume(req.user!.id, "multi");
    return true;
  } catch (err) {
    if (respondIfGuestLimit(res, err)) return false;
    throw err;
  }
}
