import prisma from "@root/prisma.js";
import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { uploadToCloudinary, deleteFromCloudinary } from "@/utils/cloudinary.js";
import { parsePdfFromUrl } from "@/utils/pdf.js";
import { SPREADSHEET_MIME_TYPES, parseSpreadsheetFromUrl } from "@/utils/spreadsheet.js";

export const MAX_FOLDER_DOCUMENTS = 5;
export const MAX_FOLDER_DOCUMENT_BYTES = 8 * 1024 * 1024;
// Stored per document, and the budget for ALL of a project's documents in one
// prompt. They ride along on every message, so the total is what costs tokens.
const MAX_DOC_CHARS = 20_000;
const MAX_PROMPT_CHARS = 30_000;

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

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[Document truncated.]`;
}

/** Plain text of an uploaded file, or "" when the type has none to extract. */
async function extractText(
  file: Express.Multer.File,
  fileUrl: string,
): Promise<string> {
  const mime = file.mimetype;

  if (PDF_MIME_TYPES.includes(mime)) {
    const report = await parsePdfFromUrl(fileUrl, file.originalname, {
      maxPages: 24,
      maxAiChars: MAX_DOC_CHARS,
      maxBytes: MAX_FOLDER_DOCUMENT_BYTES,
    });
    return report.aiText;
  }
  if (WORD_MIME_TYPES.includes(mime)) {
    return (await mammoth.extractRawText({ buffer: file.buffer })).value.trim();
  }
  if (PPT_MIME_TYPES.includes(mime)) {
    const ast = await parseOffice(file.buffer as any);
    return ast.toText().trim();
  }
  if (TEXT_MIME_TYPES.includes(mime)) {
    return file.buffer.toString("utf8").trim();
  }
  if (SPREADSHEET_MIME_TYPES.includes(mime)) {
    const report = await parseSpreadsheetFromUrl(fileUrl, file.originalname, mime, {
      requiredColumns: [],
      maxPreviewRows: 200,
      maxAiChars: MAX_DOC_CHARS,
      maxRowsToParse: 3000,
    });
    return report.aiText;
  }
  return "";
}

class FolderDocumentService {
  private async assertOwnsFolder(userId: number, folderId: number) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!folder) throw new ApiError("Folder not found", STATUS_CODES.NOT_FOUND);
  }

  async list(userId: number, folderId: number) {
    await this.assertOwnsFolder(userId, folderId);
    const docs = await prisma.folderDocument.findMany({
      where: { folderId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        // Length only — the text itself is never sent to the browser.
        extractedText: true,
      },
    });
    return docs.map(({ extractedText, ...doc }) => ({
      ...doc,
      textChars: extractedText.length,
    }));
  }

  async upload(userId: number, folderId: number, file: Express.Multer.File) {
    await this.assertOwnsFolder(userId, folderId);

    if (file.size > MAX_FOLDER_DOCUMENT_BYTES) {
      throw new ApiError("File is larger than 8 MB.", STATUS_CODES.BAD_REQUEST);
    }
    const readable = [
      ...PDF_MIME_TYPES,
      ...WORD_MIME_TYPES,
      ...PPT_MIME_TYPES,
      ...TEXT_MIME_TYPES,
      ...SPREADSHEET_MIME_TYPES,
    ];
    if (!readable.includes(file.mimetype)) {
      throw new ApiError(
        "Project documents can be PDF, Word, PowerPoint, text/Markdown, Excel or CSV.",
        STATUS_CODES.BAD_REQUEST,
      );
    }
    const count = await prisma.folderDocument.count({ where: { folderId } });
    if (count >= MAX_FOLDER_DOCUMENTS) {
      throw new ApiError(
        `A project can hold up to ${MAX_FOLDER_DOCUMENTS} documents. Remove one first.`,
        STATUS_CODES.BAD_REQUEST,
      );
    }

    const result = await uploadToCloudinary(file.buffer, {
      folder: "ai-colab-chat/project-documents",
      resourceType: "auto",
    });

    let text = "";
    try {
      text = truncate(await extractText(file, result.url), MAX_DOC_CHARS);
    } catch (e) {
      console.error("Project document extraction failed", file.originalname, e);
    }
    if (!text.trim()) {
      // Nothing for the model to read (scanned PDF, empty file) — storing it
      // would show a document that silently contributes nothing.
      try {
        await deleteFromCloudinary(
          result.publicId,
          PDF_MIME_TYPES.includes(file.mimetype) ? "image" : "raw",
        );
      } catch {}
      throw new ApiError(
        "Couldn't read any text from this file. Try a text-based PDF or another format.",
        STATUS_CODES.BAD_REQUEST,
      );
    }

    const doc = await prisma.folderDocument.create({
      data: {
        folderId,
        fileName: file.originalname,
        fileUrl: result.url,
        cloudinaryPublicId: result.publicId,
        mimeType: file.mimetype,
        fileSize: file.size,
        extractedText: text,
      },
    });
    const { extractedText, ...rest } = doc;
    return { ...rest, textChars: extractedText.length };
  }

  async remove(userId: number, folderId: number, docId: number) {
    await this.assertOwnsFolder(userId, folderId);
    const doc = await prisma.folderDocument.findFirst({
      where: { id: docId, folderId },
    });
    if (!doc) throw new ApiError("Document not found", STATUS_CODES.NOT_FOUND);

    if (doc.cloudinaryPublicId) {
      try {
        // "auto" stores PDFs as image assets and everything else as raw.
        await deleteFromCloudinary(
          doc.cloudinaryPublicId,
          PDF_MIME_TYPES.includes(doc.mimeType) ? "image" : "raw",
        );
      } catch (e) {
        console.error("Failed to delete project document from Cloudinary:", e);
      }
    }
    await prisma.folderDocument.delete({ where: { id: docId } });
    return true;
  }
}

export default FolderDocumentService;

/**
 * System-prompt block with the text of every document in the project, or null
 * when it has none. Shared by every chat in the folder; the total is capped so
 * a few large files can't swamp the context window.
 */
export async function buildFolderDocumentsBlock(
  folderId: number | null | undefined,
): Promise<string | null> {
  if (!folderId) return null;
  const docs = await prisma.folderDocument.findMany({
    where: { folderId },
    orderBy: { createdAt: "asc" },
    select: { fileName: true, extractedText: true },
  });
  if (docs.length === 0) return null;

  let remaining = MAX_PROMPT_CHARS;
  const sections: string[] = [];
  let trimmed = 0;
  for (const doc of docs) {
    if (remaining <= 0) {
      trimmed += 1;
      continue;
    }
    const body = truncate(doc.extractedText, remaining);
    remaining -= body.length;
    sections.push(`--- ${doc.fileName} ---\n${body}`);
  }
  if (trimmed > 0) {
    sections.push(`[${trimmed} more project document(s) omitted to stay within limits.]`);
  }

  return `Project documents (reference material the user attached to this project — treat as background context and use it when relevant):\n\n${sections.join("\n\n")}`;
}
