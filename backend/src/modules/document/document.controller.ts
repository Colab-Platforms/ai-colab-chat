import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import DocumentService from "./document.service.js";
import { DOCUMENT_THEMES, PPTX_TEMPLATES } from "./document.types.js";
import { getThemeTokens } from "./document.theme.js";
import { getPptxTemplateTokens } from "./document.pptxTemplates.js";
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

const THEME_COPY: Record<string, { label: string; description: string }> = {
  professional: {
    label: "Professional",
    description: "Navy accents and a clean sans-serif. The safe default for business documents.",
  },
  minimal: {
    label: "Minimal",
    description: "Black and white with plenty of space. Lets the content do the talking.",
  },
  report: {
    label: "Report",
    description: "Teal accents and a serif face, suited to long-form reports and analysis.",
  },
};

const PPTX_COPY: Record<string, string> = {
  corporate: "Clean white slides, deep blue and gold. Formal and boardroom-ready.",
  aurora: "Dark, glowing violet. Modern and high-contrast for product and tech talks.",
  sunset: "Warm coral on cream with a friendly serif. Great for stories and pitches.",
  emerald: "Calm green and an editorial serif. Thoughtful and premium.",
  mono: "Near-black with a lime accent. Bold, minimal and punchy.",
};

/**
 * The predefined visual templates, straight from the renderers' own tokens, so
 * the Documents studio previews exactly the colours and fonts that generation
 * will use. PDF, Word and Excel share the three document themes; PowerPoint has
 * its own five templates.
 */
export const listTemplates = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const documentThemes = DOCUMENT_THEMES.map((key) => {
    const t = getThemeTokens(key);
    return {
      key,
      ...THEME_COPY[key],
      tokens: {
        accent: t.accent,
        accentSoft: t.accentSoft,
        text: t.text,
        muted: t.muted,
        border: t.border,
        headingFont: t.headingFont,
        bodyFont: t.bodyFont,
        headingWeight: t.headingWeight,
        tableHeaderBg: t.tableHeaderBg,
        tableHeaderText: t.tableHeaderText,
      },
    };
  });

  const deckTemplates = PPTX_TEMPLATES.map((key) => {
    const t = getPptxTemplateTokens(key);
    return {
      key,
      label: t.label,
      description: PPTX_COPY[key] ?? "",
      tokens: {
        bg: t.bg,
        bgSoft: t.bgSoft,
        accent: t.accent,
        accent2: t.accent2,
        text: t.text,
        muted: t.muted,
        onAccent: t.onAccent,
        border: t.border,
        tableHeaderBg: t.tableHeaderBg,
        tableHeaderText: t.tableHeaderText,
        headingFontName: t.headingFontName,
        bodyFontName: t.bodyFontName,
        headingBold: t.headingBold,
        titleLayout: t.titleLayout,
        decoration: t.decoration,
      },
    };
  });

  sendResponse(
    res,
    true,
    {
      formats: {
        PDF: documentThemes,
        DOCX: documentThemes,
        PPTX: deckTemplates,
        XLSX: documentThemes,
      },
    },
    "Templates fetched successfully",
    STATUS_CODES.OK,
  );
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
