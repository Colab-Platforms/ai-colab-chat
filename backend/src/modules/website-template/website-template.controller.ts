import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import WebsiteTemplateService from "./website-template.service.js";
import {
  validateCreateWebsiteTemplate,
  validateUpdateWebsiteTemplate,
} from "./website-template.validators.js";

const service = new WebsiteTemplateService();

const fail = (res: Response, label: string, error: any) => {
  console.error(label, error);
  sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
};

const isAdmin = (req: Request) =>
  req.user?.role === "ADMIN" || req.user?.role === "SUPERADMIN";

export const listTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    // Hidden templates are only ever returned to admins, and only on request.
    const includeInactive = req.query.all === "true" && isAdmin(req);
    const items = await service.list({ includeInactive });
    sendResponse(res, true, items, "Templates fetched successfully", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "List website templates error", error);
  }
};

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateCreateWebsiteTemplate(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.create(value), "Template created", STATUS_CODES.CREATED);
  } catch (error) {
    fail(res, "Create website template error", error);
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateUpdateWebsiteTemplate(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.update(Number(req.params.id), value), "Template updated", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Update website template error", error);
  }
};

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.remove(Number(req.params.id)), "Template deleted", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Delete website template error", error);
  }
};

export const recordUse = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.recordUse(Number(req.params.id)), "Recorded", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Record website template use error", error);
  }
};
