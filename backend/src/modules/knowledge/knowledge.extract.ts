import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import { parsePdfFromUrl } from "@/utils/pdf.js";

export const KNOWLEDGE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "application/csv",
];

const MAX_PDF_PAGES = Number(process.env.KNOWLEDGE_PDF_MAX_PAGES ?? 300);
const MAX_PDF_CHARS = 2_000_000;
const MAX_BYTES = 10 * 1024 * 1024;

const fetchBuffer = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

export async function extractKnowledgeText(input: {
  fileUrl: string;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const { fileUrl, fileName, mimeType } = input;

  if (mimeType === "application/pdf") {
    const report = await parsePdfFromUrl(fileUrl, fileName, {
      maxPages: MAX_PDF_PAGES,
      maxAiChars: MAX_PDF_CHARS,
      maxBytes: MAX_BYTES,
    });
    // parsePdfFromUrl prefixes a chat-oriented header; drop everything before
    // the first page marker so it does not pollute the first chunk.
    const firstPage = report.aiText.indexOf("[Page ");
    return firstPage >= 0 ? report.aiText.slice(firstPage) : report.aiText;
  }

  const buffer = await fetchBuffer(fileUrl);

  if (mimeType.includes("wordprocessingml")) {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (mimeType.includes("presentationml")) {
    return (await parseOffice(buffer as any)).toText();
  }
  return buffer.toString("utf8");
}
