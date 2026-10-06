import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as service from "./knowledge.service.js";
import {
  bulkPostsSchema,
  createTextSourceSchema,
  searchSchema,
  uploadSourceSchema,
  validate,
} from "./knowledge.validators.js";

const fail = (res: Response, label: string, error: any) => {
  console.error(label, error);
  sendResponse(
    res,
    false,
    null,
    error.message,
    error.statusCode ?? STATUS_CODES.SERVER_ERROR,
  );
};

const badRequest = (res: Response, error: { message: string }) =>
  sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);

export const createTextSource = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(createTextSourceSchema, req.body);
    if (error) return badRequest(res, error);
    const result = await service.createTextSource(req.user!.id, value);
    sendResponse(res, true, result, "Source added", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Create knowledge text source error", e);
  }
};

export const uploadSource = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendResponse(
        res,
        false,
        null,
        "File is required",
        STATUS_CODES.BAD_REQUEST,
      );
    }
    const { error, value } = validate<any>(uploadSourceSchema, req.body);
    if (error) return badRequest(res, error);

    let metadata: Record<string, unknown> | undefined;
    if (typeof value.metadata === "string") {
      try {
        metadata = JSON.parse(value.metadata);
      } catch {
        return sendResponse(
          res,
          false,
          null,
          "metadata must be valid JSON",
          STATUS_CODES.BAD_REQUEST,
        );
      }
    } else {
      metadata = value.metadata;
    }

    const result = await service.createFileSource(
      req.user!.id,
      {
        folderId: value.folderId ? Number(value.folderId) : null,
        type: value.type,
        title: value.title || undefined,
        metadata,
      },
      req.file,
    );
    sendResponse(res, true, result, "File uploaded", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Upload knowledge source error", e);
  }
};

export const bulkPosts = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(bulkPostsSchema, req.body);
    if (error) return badRequest(res, error);
    const result = await service.createPastPosts(req.user!.id, value);
    sendResponse(res, true, result, "Posts imported", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Bulk knowledge import error", e);
  }
};

export const listSources = async (req: Request, res: Response) => {
  try {
    const raw = req.query.folderId;
    const parsed =
      raw === undefined
        ? undefined
        : raw === "null" || raw === ""
          ? null
          : Number(raw);
    const result = await service.listSources(req.user!.id, {
      folderId: typeof parsed === "number" && Number.isNaN(parsed) ? undefined : parsed,
      type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
    });
    sendResponse(res, true, result, "Sources fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "List knowledge sources error", e);
  }
};

export const deleteSource = async (req: Request, res: Response) => {
  try {
    await service.deleteSource(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(res, true, null, "Source deleted", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Delete knowledge source error", e);
  }
};

export const reindexSource = async (req: Request, res: Response) => {
  try {
    await service.reindexSource(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(res, true, null, "Re-indexing started", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Reindex knowledge source error", e);
  }
};

export const search = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(searchSchema, req.body);
    if (error) return badRequest(res, error);
    const result = await service.retrieveKnowledge({
      userId: req.user!.id,
      folderId: value.folderId ?? null,
      query: value.query,
      k: value.k,
      types: value.types,
      metadata: value.metadata,
    });
    sendResponse(res, true, result, "Search complete", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Knowledge search error", e);
  }
};
