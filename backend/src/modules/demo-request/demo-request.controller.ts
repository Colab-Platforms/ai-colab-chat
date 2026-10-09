import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import DemoRequestService from "./demo-request.service.js";
import {
  validateCreateDemoRequest,
  validateListDemoRequests,
  validateUpdateDemoRequest,
} from "./demo-request.validators.js";

const service = new DemoRequestService();

const fail = (res: Response, label: string, error: any) => {
  console.error(label, error);
  sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
};

/**
 * Public, unauthenticated endpoint, so it defends itself: a hidden honeypot
 * field plus a small per-IP limit. (No rate-limit package is installed; this
 * in-memory window is per server process, which is enough to blunt a bot.)
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

const tooManyRequests = (ip: string): boolean => {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
};

export const createDemoRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    // A filled honeypot is a bot: answer success so it learns nothing, store nothing.
    if (typeof req.body?.website === "string" && req.body.website.length > 0) {
      sendResponse(res, true, { id: 0 }, "Request received", STATUS_CODES.CREATED);
      return;
    }

    const { error, value } = validateCreateDemoRequest(req.body);
    if (error) {
      sendResponse(res, false, error.details.map((d) => d.message), error.details[0].message, STATUS_CODES.BAD_REQUEST);
      return;
    }

    if (tooManyRequests(ip)) {
      sendResponse(res, false, null, "Too many requests. Please try again later.", 429);
      return;
    }

    const created = await service.create(value, {
      ipAddress: ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    sendResponse(res, true, created, "Request received", STATUS_CODES.CREATED);
  } catch (error) {
    fail(res, "Create demo request error", error);
  }
};

export const listDemoRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateListDemoRequests(req.query);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.list(value), "Demo requests fetched", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "List demo requests error", error);
  }
};

export const updateDemoRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateUpdateDemoRequest(req.body);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.update(Number(req.params.id), value), "Demo request updated", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Update demo request error", error);
  }
};

export const deleteDemoRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.remove(Number(req.params.id)), "Demo request deleted", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Delete demo request error", error);
  }
};
