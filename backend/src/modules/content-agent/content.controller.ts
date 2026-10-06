import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as items from "./content.service.js";
import * as profile from "./content.profile.service.js";
import {
  brandKitSchema,
  productSchema,
  regenerateSchema,
  updateItemSchema,
  validate,
} from "./content.validators.js";

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

const bad = (res: Response, error: { message: string }) =>
  sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);

const idParam = (req: Request) => parseInt(req.params.id as string);

const optInt = (v: unknown): number | undefined => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isInteger(n) ? n : undefined;
};

/** `?folderId=null` means "user-global"; absent means "any". */
const scopeParam = (v: unknown): number | null | undefined =>
  v === "null" ? null : optInt(v);

// ── Items ────────────────────────────────────────────────────────────────

export const listItems = async (req: Request, res: Response) => {
  try {
    const result = await items.listItems(req.user!.id, {
      chatId: optInt(req.query.chatId),
      folderId: optInt(req.query.folderId),
      status: req.query.status as string | undefined,
      limit: optInt(req.query.limit),
    });
    sendResponse(res, true, result, "Content fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "List content error", e);
  }
};

export const getItem = async (req: Request, res: Response) => {
  try {
    const result = await items.getItem(req.user!.id, idParam(req));
    sendResponse(res, true, result, "Content fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Get content error", e);
  }
};

export const updateItem = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(updateItemSchema, req.body);
    if (error) return bad(res, error);
    const result = await items.updateItem(req.user!.id, idParam(req), value);
    sendResponse(res, true, result, "Content updated", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Update content error", e);
  }
};

export const regenerateItem = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(regenerateSchema, req.body);
    if (error) return bad(res, error);
    const result = await items.regenerateItem(req.user!.id, idParam(req), value);
    sendResponse(res, true, result, "Content regenerated", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Regenerate content error", e);
  }
};

export const restoreVersion = async (req: Request, res: Response) => {
  try {
    const version = optInt(req.params.version);
    if (!version) return bad(res, { message: "Invalid version" });
    const result = await items.restoreVersion(req.user!.id, idParam(req), version);
    sendResponse(res, true, result, "Version restored", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Restore content version error", e);
  }
};

export const approveItem = async (req: Request, res: Response) => {
  try {
    const result = await items.approveItem(req.user!.id, idParam(req));
    sendResponse(res, true, result, "Content approved", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Approve content error", e);
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  try {
    await items.deleteItem(req.user!.id, idParam(req));
    sendResponse(res, true, null, "Content deleted", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Delete content error", e);
  }
};

// ── Brand kit ────────────────────────────────────────────────────────────

export const getBrandKit = async (req: Request, res: Response) => {
  try {
    const result = await profile.getBrandKit(
      req.user!.id,
      scopeParam(req.query.folderId) ?? null,
    );
    sendResponse(res, true, result, "Brand kit fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Get brand kit error", e);
  }
};

export const saveBrandKit = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(brandKitSchema, req.body);
    if (error) return bad(res, error);
    const { folderId, ...data } = value;
    const result = await profile.upsertBrandKit(req.user!.id, folderId, data);
    sendResponse(res, true, result, "Brand kit saved", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Save brand kit error", e);
  }
};

export const deleteBrandKit = async (req: Request, res: Response) => {
  try {
    await profile.deleteBrandKit(req.user!.id, idParam(req));
    sendResponse(res, true, null, "Brand kit deleted", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Delete brand kit error", e);
  }
};

// ── Products ─────────────────────────────────────────────────────────────

export const listProducts = async (req: Request, res: Response) => {
  try {
    const result = await profile.listProducts(
      req.user!.id,
      scopeParam(req.query.folderId),
    );
    sendResponse(res, true, result, "Products fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "List products error", e);
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(productSchema, req.body);
    if (error) return bad(res, error);
    const { folderId, ...data } = value;
    const result = await profile.createProduct(req.user!.id, folderId, data);
    sendResponse(res, true, result, "Product created", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Create product error", e);
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { error, value } = validate<any>(productSchema, req.body);
    if (error) return bad(res, error);
    const { folderId: _folderId, ...data } = value;
    const result = await profile.updateProduct(req.user!.id, idParam(req), data);
    sendResponse(res, true, result, "Product updated", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Update product error", e);
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    await profile.deleteProduct(req.user!.id, idParam(req));
    sendResponse(res, true, null, "Product deleted", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Delete product error", e);
  }
};
