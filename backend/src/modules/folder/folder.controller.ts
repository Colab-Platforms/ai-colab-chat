import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import FolderService from "./folder.service.js";
import {
  validateCreateFolderSchema,
  validateUpdateFolderSchema,
} from "./folder.validators.js";

const folderService = new FolderService();

export const createFolder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateCreateFolderSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await folderService.create(req.user!.id, value);
    sendResponse(
      res,
      true,
      result,
      "Folder created successfully",
      STATUS_CODES.CREATED,
    );
  } catch (error: any) {
    console.error("Create folder error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const listFolders = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await folderService.list(req.user!.id, req.query);
    sendResponse(
      res,
      true,
      result,
      "Folders fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("List folders error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const getFolder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await folderService.getById(
      req.user!.id,
      parseInt(req.params.id as string),
    );
    sendResponse(
      res,
      true,
      result,
      "Folder fetched successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Get folder error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const updateFolder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateUpdateFolderSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await folderService.update(
      req.user!.id,
      parseInt(req.params.id as string),
      value,
    );
    sendResponse(
      res,
      true,
      result,
      "Folder updated successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Update folder error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const deleteFolder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const deleteChats = req.query.deleteChats === "true";
    const result = await folderService.softDelete(
      req.user!.id,
      parseInt(req.params.id as string),
      deleteChats,
    );
    sendResponse(
      res,
      true,
      result,
      "Folder deleted successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Delete folder error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};
