import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import ImageService from "./image.service.js";

const imageService = new ImageService();

export const listImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await imageService.list(req.user!.id, req.query);
    sendResponse(res, true, result, "Images fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("List images error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const getImageById = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await imageService.getById(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Image fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Get image by id error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const deleteImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await imageService.delete(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Image deleted successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Delete image error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};
