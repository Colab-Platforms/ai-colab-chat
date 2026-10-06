import { Request, Response } from "express";
import { Readable } from "node:stream";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import AttachmentService from "./attachment.service.js";
import { validateCreateAttachmentSchema } from "./attachment.validators.js";

const attachmentService = new AttachmentService();

function buildDownloadFileName(fileName: string, mimeType: string) {
  const hasExtension = /\.[a-z0-9]+$/i.test(fileName);
  if (hasExtension) return fileName;

  const lowerMime = mimeType.toLowerCase();
  const extension =
    lowerMime.includes("spreadsheetml.sheet") ? "xlsx" :
    lowerMime.includes("sheet.macroenabled.12") ? "xlsm" :
    lowerMime.includes("ms-excel") || lowerMime.includes("excel") ? "xls" :
    lowerMime === "text/csv" || lowerMime === "application/csv" ? "csv" :
    lowerMime.includes("pdf") ? "pdf" :
    lowerMime.startsWith("image/") ? lowerMime.split("/")[1] || "png" :
    "bin";

  return `${fileName}.${extension}`;
}

export const presendAttachment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!req.file) {
      sendResponse(
        res,
        false,
        null,
        "File is required",
        STATUS_CODES.BAD_REQUEST,
      );
      return;
    }

    const result = await attachmentService.presend(req.file);
    sendResponse(
      res,
      true,
      result,
      "File uploaded successfully",
      STATUS_CODES.CREATED,
    );
  } catch (error: any) {
    console.error("Presend attachment error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

/** DELETE /attachments/:id - delete a presend attachment */
export const deleteAttachment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      sendResponse(res, false, null, "Invalid ID", STATUS_CODES.BAD_REQUEST);
      return;
    }

    await attachmentService.delete(id);
    sendResponse(
      res,
      true,
      null,
      "Attachment deleted successfully",
      STATUS_CODES.OK,
    );
  } catch (error: any) {
    console.error("Delete attachment error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

/** POST /attachments - legacy: upload tied to an existing message */
export const uploadAttachment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateCreateAttachmentSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }

    if (!req.file) {
      sendResponse(
        res,
        false,
        null,
        "File is required",
        STATUS_CODES.BAD_REQUEST,
      );
      return;
    }

    const result = await attachmentService.create(
      req.user!.id,
      value.messageId,
      req.file,
    );
    sendResponse(
      res,
      true,
      result,
      "Attachment uploaded successfully",
      STATUS_CODES.CREATED,
    );
  } catch (error: any) {
    console.error("Upload attachment error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

/** GET /attachments/:id/download - stream an attachment from Cloudinary. */
export const downloadAttachment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (Number.isNaN(id)) {
      sendResponse(res, false, null, "Invalid ID", STATUS_CODES.BAD_REQUEST);
      return;
    }

    const attachment = await attachmentService.findById(id);
    if (!attachment) {
      sendResponse(res, false, null, "Attachment not found", STATUS_CODES.NOT_FOUND);
      return;
    }

    const response = await fetch(attachment.fileUrl);
    if (!response.ok || !response.body) {
      sendResponse(
        res,
        false,
        null,
        "Failed to fetch attachment",
        STATUS_CODES.SERVER_ERROR,
      );
      return;
    }

    const downloadFileName = buildDownloadFileName(
      attachment.fileName,
      attachment.mimeType,
    );

    res.setHeader("Content-Type", attachment.mimeType || response.headers.get("content-type") || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadFileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`,
    );
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    const stream = Readable.fromWeb(response.body as any);
    stream.on("error", (error) => {
      console.error("Attachment download stream error", error);
      if (!res.headersSent) {
        res.status(STATUS_CODES.SERVER_ERROR).end();
      } else {
        res.destroy(error as Error);
      }
    });

    stream.pipe(res);
  } catch (error: any) {
    console.error("Download attachment error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};
