import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import { SPREADSHEET_MIME_TYPES, parseSpreadsheetFromUrl } from "@/utils/spreadsheet.js";
import { parsePdfFromUrl } from "@/utils/pdf.js";

// Same mime lists / caps as chat.stream.ts's buildAttachmentContentParts —
// duplicated rather than shared since that function's constants are private
// to that module and this is the only other caller.
const PDF_MIME_TYPES = ["application/pdf"];
const WORD_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const PPT_MIME_TYPES = [
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const TEXT_MIME_TYPES = ["text/plain", "text/markdown", "text/x-markdown"];
const PDF_MAX_PAGES = 24;
const PDF_MAX_AI_CHARS = 20_000;
const PDF_MAX_BYTES = 8 * 1024 * 1024;
const SPREADSHEET_PREVIEW_ROWS = 200;
const SPREADSHEET_MAX_AI_CHARS = 22_000;
const SPREADSHEET_MAX_ROWS_TO_PARSE = 3000;

// Voice context is a single text block folded into the system prompt
// (see VoiceService.getContextForChat) rather than a per-turn multimodal
// payload, so it's kept far smaller than the text-chat caps above.
const VOICE_DOC_MAX_CHARS = 6000;

interface AttachmentLike {
  fileUrl: string;
  fileName: string;
  mimeType: string;
}

/** Extracts a plain-text summary of a non-image attachment for voice
 * context. Images are intentionally skipped — the voice LLM pipeline isn't
 * wired for multimodal input, unlike text-chat's image_url content parts. */
export async function extractAttachmentText(
  attachment: AttachmentLike,
): Promise<string | null> {
  const { fileUrl, fileName, mimeType } = attachment;
  let text: string | null = null;

  try {
    if (PDF_MIME_TYPES.includes(mimeType)) {
      const pdfReport = await parsePdfFromUrl(fileUrl, fileName, {
        maxPages: PDF_MAX_PAGES,
        maxAiChars: PDF_MAX_AI_CHARS,
        maxBytes: PDF_MAX_BYTES,
      });
      text = `[Attached PDF: ${fileName}]\n${pdfReport.aiText}`;
    } else if (WORD_MIME_TYPES.includes(mimeType)) {
      const response = await fetch(fileUrl);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const result = await mammoth.extractRawText({ buffer });
        const extracted = result.value.trim();
        if (extracted) text = `[Attached Word Document: ${fileName}]\n${extracted}`;
      }
    } else if (PPT_MIME_TYPES.includes(mimeType)) {
      const response = await fetch(fileUrl);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const ast = await parseOffice(buffer as any);
        const extracted = ast.toText().trim();
        if (extracted) text = `[Attached PowerPoint Presentation: ${fileName}]\n${extracted}`;
      }
    } else if (TEXT_MIME_TYPES.includes(mimeType)) {
      const response = await fetch(fileUrl);
      if (response.ok) {
        text = `[Attached text file: ${fileName}]\n${await response.text()}`;
      }
    } else if (SPREADSHEET_MIME_TYPES.includes(mimeType)) {
      const spreadsheetReport = await parseSpreadsheetFromUrl(fileUrl, fileName, mimeType, {
        maxPreviewRows: SPREADSHEET_PREVIEW_ROWS,
        maxAiChars: SPREADSHEET_MAX_AI_CHARS,
        maxRowsToParse: SPREADSHEET_MAX_ROWS_TO_PARSE,
      });
      text = spreadsheetReport.aiText;
    }
  } catch (error) {
    console.error(`[voice-attachment] failed to extract "${fileName}":`, error);
    return null;
  }

  if (!text) return null;
  return text.length > VOICE_DOC_MAX_CHARS ? text.slice(0, VOICE_DOC_MAX_CHARS) : text;
}
