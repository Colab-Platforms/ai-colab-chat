import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import VideoService from "./video.service.js";
import VideoSequenceService from "./video.sequence.service.js";
import { validateCreateVideoSchema, validateCreateVideoSequenceSchema } from "./video.validators.js";

const videoService = new VideoService();
const sequenceService = new VideoSequenceService();

export const createVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateCreateVideoSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await videoService.create(req.user!.id, value);
    sendResponse(res, true, result, "Video generation started", STATUS_CODES.ACCEPTED);
  } catch (error: any) {
    console.error("Create video error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const listVideoModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await videoService.listAvailableModels(req.user!.id);
    sendResponse(res, true, result, "Video models fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("List video models error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const listVideos = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await videoService.list(req.user!.id, req.query);
    sendResponse(res, true, result, "Videos fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("List videos error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const getVideoById = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await videoService.getById(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Video fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Get video by id error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const retryVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await videoService.retry(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Video generation restarted", STATUS_CODES.ACCEPTED);
  } catch (error: any) {
    console.error("Retry video error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const deleteVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await videoService.delete(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Video deleted successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Delete video error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const createVideoSequence = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateCreateVideoSequenceSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await sequenceService.create(req.user!.id, value);
    sendResponse(res, true, result, "Video sequence started", STATUS_CODES.ACCEPTED);
  } catch (error: any) {
    console.error("Create video sequence error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const listVideoSequences = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sequenceService.list(req.user!.id, req.query);
    sendResponse(res, true, result, "Video sequences fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("List video sequences error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const getVideoSequenceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sequenceService.getById(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Video sequence fetched successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Get video sequence error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const retryVideoSequence = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sequenceService.retry(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Video sequence restarted", STATUS_CODES.ACCEPTED);
  } catch (error: any) {
    console.error("Retry video sequence error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};

export const deleteVideoSequence = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sequenceService.delete(req.user!.id, parseInt(req.params.id as string));
    sendResponse(res, true, result, "Video sequence deleted successfully", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Delete video sequence error", error);
    sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
  }
};
