import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import DocumentService from "./document.service.js";
import {
  validateCreateDocumentSchema,
  validateUpdateDocumentStyleSchema,
} from "./document.validators.js";

const documentService = new DocumentService();

export const createDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateCreateDocumentSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await documentService.create(req.user!.id, value);
    sendResponse(
      res,
      true,
      result,
      "Document generation started",
      STATUS_CODES.ACCEPTED,
    );
  } catch (error: any) {
    console.error("Create document error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const listDocuments = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await documentService.list(req.user!.id, req.query);
    sendResponse(
      res,
      true,
      result,
      "Documents fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("List documents error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const getDocumentById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await documentService.getById(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Document fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get document by id error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const getDocumentSpec = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await documentService.getSpec(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Document spec fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get document spec error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const updateDocumentStyle = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateUpdateDocumentStyleSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await documentService.updateStyle(
      req.user!.id,
      parseInt(req.params.id as string),
      value,
    );
    sendResponse(
      res,
      true,
      result,
      "Document is re-rendering",
      STATUS_CODES.ACCEPTED,
    );
  } catch (error: any) {
    console.error("Update document style error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const retryDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await documentService.retry(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Document generation restarted",
      STATUS_CODES.ACCEPTED,
    );
  } catch (error: any) {
    console.error("Retry document error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const deleteDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await documentService.delete(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Document deleted successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Delete document error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};
