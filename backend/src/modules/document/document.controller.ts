import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import DocumentService from "./document.service.js";
import {
  DOCUMENT_THEMES_BY_FORMAT,
  MINDMAP_THEMES,
  PPTX_TEMPLATES,
} from "./document.types.js";
import { getThemeTokens } from "./document.theme.js";
import type { DocumentTheme } from "./document.types.js";
import { getPptxTemplateTokens } from "./document.pptxTemplates.js";
import { getMindmapThemeTokens } from "./document.mindmapThemes.js";
import {
  validateCreateDocumentSchema,
  validateAskMindmapSchema,
  validateExpandMindmapNodeSchema,
  validateUpdateDocumentSpecSchema,
  validateUpdateDocumentStyleSchema,
} from "./document.validators.js";
import { askAboutMindmap, expandMindmapNode } from "./document.mindmapAi.js";

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
  // Word
  "business-plan": { label: "Business Plan", description: "Navy with a serif headline and clean sans body. Structured for plans and strategy." },
  "client-proposal": { label: "Client Proposal", description: "Violet accents and a modern geometric sans. Confident for pitches to clients." },
  "cover-letter": { label: "Cover Letter", description: "Quiet navy with a classic Garamond. Personal and professional." },
  "lesson-plan": { label: "Lesson Plan", description: "Burnt orange with a highly legible sans. Easy to scan in the classroom." },
  "meeting-minutes": { label: "Meeting Minutes", description: "Cyan accents and a neutral sans. Tidy for notes, decisions and actions." },
  "service-agreement": { label: "Service Agreement", description: "Near-black with a legal-style serif heading. Sober and contract-ready." },
  // Excel
  "financial-model": { label: "Financial Model", description: "Deep blue headers with soft blue totals. For projections and statements." },
  "inventory-tracker": { label: "Inventory Tracker", description: "Amber headers with stock-status colours. For stock and reorder levels." },
  "monthly-budget": { label: "Monthly Budget", description: "Green headers for income and savings at a glance." },
  "project-tracker": { label: "Project Tracker", description: "Magenta headers with status colours for tasks and owners." },
  "sales-tracker": { label: "Sales Tracker", description: "Purple headers for pipeline, deals and targets." },
  timesheet: { label: "Timesheet", description: "Teal headers laid out for hours, days and totals." },
};

const PPTX_COPY: Record<string, string> = {
  corporate: "Clean white slides, deep blue and gold. Formal and boardroom-ready.",
  aurora: "Dark, glowing violet. Modern and high-contrast for product and tech talks.",
  sunset: "Warm coral on cream with a friendly serif. Great for stories and pitches.",
  emerald: "Calm green and an editorial serif. Thoughtful and premium.",
  mono: "Near-black with a lime accent. Bold, minimal and punchy.",
  "marketing-plan": "Cream with brick red and a warm serif. Friendly for campaigns and plans.",
  "pitch-deck": "Soft off-white with vivid violet. Sharp and modern for investor decks.",
  "project-kickoff": "Midnight navy with sky-blue and a yellow spark. Clear for kickoffs and roadmaps.",
  "quarterly-review": "White, black and a bold green. Data-first for business reviews.",
  "sales-proposal": "Forest green and gold on warm paper with a display serif. Premium for proposals.",
  "training-deck": "Teal on cream with a golden highlight and a very readable sans. Great for teaching.",
};

const MINDMAP_COPY: Record<string, string> = {
  vibrant: "A different bold colour for every branch on white. Easy to scan at a glance.",
  ocean: "Cool blues and teals on a pale background. Calm and focused.",
  autumn: "Warm rust and gold on cream with a serif face. Friendly and editorial.",
  midnight: "A dark canvas with glowing branch colours. Easy on the eyes and striking on screen.",
};

/**
 * The predefined visual templates, straight from the renderers' own tokens, so
 * the Documents studio previews exactly the colours and fonts that generation
 * will use. PDF, Word and Excel share three general themes and each add their
 * own templates; PowerPoint has its own set.
 */
export const listTemplates = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const themeEntry = (key: string) => {
    const t = getThemeTokens(key as DocumentTheme);
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
  };
  const themesFor = (format: "PDF" | "DOCX" | "XLSX") =>
    DOCUMENT_THEMES_BY_FORMAT[format].map(themeEntry);

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

  const mindmapTemplates = MINDMAP_THEMES.map((key) => {
    const t = getMindmapThemeTokens(key);
    return {
      key,
      label: t.label,
      description: MINDMAP_COPY[key] ?? "",
      tokens: {
        // `accent`/`accent2` feed the colour dots on the template preview
        // dialog, which is shared with the other formats.
        accent: t.branchColors[0],
        accent2: t.branchColors[1],
        bg: t.bg,
        rootBg: t.rootBg,
        rootText: t.rootText,
        text: t.text,
        muted: t.muted,
        branchColors: t.branchColors,
        fontFamily: t.fontFamily,
        headingWeight: t.headingWeight,
      },
    };
  });

  sendResponse(
    res,
    true,
    {
      formats: {
        PDF: themesFor("PDF"),
        DOCX: themesFor("DOCX"),
        PPTX: deckTemplates,
        XLSX: themesFor("XLSX"),
        MINDMAP: mindmapTemplates,
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

export const updateDocumentSpec = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateUpdateDocumentSpecSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await documentService.updateSpec(
      req.user!.id,
      parseInt(req.params.id as string),
      value,
    );
    sendResponse(res, true, result, "Document saved", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Update document spec error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const expandMindmapNodeHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateExpandMindmapNodeSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await expandMindmapNode(
      req.user!.id,
      parseInt(req.params.id as string),
      value,
    );
    sendResponse(res, true, result, "Branches generated", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Expand mind map node error", error);
    sendResponse(
      res,
      false,
      null,
      error.message,
      error.statusCode ?? STATUS_CODES.SERVER_ERROR,
    );
  }
};

export const askMindmapHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = validateAskMindmapSchema(req.body);
    if (error) {
      sendResponse(res, false, error, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await askAboutMindmap(
      req.user!.id,
      parseInt(req.params.id as string),
      value,
    );
    sendResponse(res, true, result, "Answer generated", STATUS_CODES.OK);
  } catch (error: any) {
    console.error("Ask about mind map error", error);
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
