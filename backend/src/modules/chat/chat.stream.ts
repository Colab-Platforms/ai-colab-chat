import { Request, Response } from "express";
import prisma from "@root/prisma.js";
import { uploadToCloudinary } from "@/utils/cloudinary.js";
import { createOpenRouterStream } from "@/utils/openrouter.js";
import { estimateMessageTokens } from "@/utils/tokenCounter.js";
import { checkPredefinedResponse } from "@/utils/predefinedResponses.js";
import {
  buildSystemMessage,
  getDefaultSystemPrompt,
} from "@/utils/systemPrompt.js";
import {
  createWalletTransaction,
  calculateAdjustedTokens,
} from "@/utils/walletUtils.js";
import AttachmentService from "@/modules/attachment/attachment.service.js";
import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import {
  SPREADSHEET_MIME_TYPES,
  inferRequiredColumnsFromPrompt,
  parseSpreadsheetFromUrl,
} from "@/utils/spreadsheet.js";
import { parsePdfFromUrl } from "@/utils/pdf.js";
import {
  maybeGenerateDocumentFromChat,
  prepareDocumentTurn,
} from "@/modules/document/document.chat.js";

const attachmentService = new AttachmentService();

function isAbortError(error: any) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("aborted")
  );
}

function setupClientAbortTracking(
  req: Request,
  res: Response,
  abortController: AbortController,
) {
  let clientAborted = false;
  let responseFinished = false;
  const onResponseFinish = () => {
    responseFinished = true;
  };
  const abortIfDisconnected = () => {
    if (responseFinished) return;
    if (!req.aborted && req.complete) return;
    clientAborted = true;
    abortController.abort();
  };
  const onClientDisconnect = () => {
    if (responseFinished) return;
    clientAborted = true;
    abortController.abort();
  };
  req.on("aborted", abortIfDisconnected);
  req.on("close", abortIfDisconnected);
  res.on("close", onClientDisconnect);
  res.on("finish", onResponseFinish);
  return () => clientAborted || abortController.signal.aborted;
}

async function touchChat(chatId: number) {
  await prisma.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });
}

// Debounced enqueue for the background context-distillation worker
// (see crons/contextDistillation.ts). Only chats inside a folder have
// shared project memory worth updating. Never throws — a failure here
// must not break the chat response it's attached to.
async function maybeEnqueueDistillation(
  chatId: number,
  folderId: number | null,
) {
  if (!folderId) return;
  try {
    const turnCount = await prisma.message.count({
      where: { chatId, role: "ASSISTANT", isDeleted: false },
    });
    if (turnCount === 0 || turnCount % 4 !== 0) return;

    const existingPending = await prisma.contextDistillationJob.findFirst({
      where: { chatId, status: "PENDING" },
      select: { id: true },
    });
    if (existingPending) return;

    await prisma.contextDistillationJob.create({
      data: { chatId, folderId, status: "PENDING" },
    });
    console.log(
      `[context-distillation] ENQUEUED chat=${chatId} folder=${folderId} at assistant-turn=${turnCount} (worker picks this up on its next 2-min tick)`,
    );
  } catch (error) {
    console.error("[context-distillation] failed to enqueue job", error);
  }
}

async function getDefaultContextIdsForChat(
  userId: number,
  folderId?: number | null,
) {
  const globalContextsQuery = prisma.contextMemory.findMany({
    where: {
      userId,
      type: "GLOBAL",
      isAutoSelected: true,
      isDeleted: false,
    },
    select: { id: true },
  });

  const folderContextsQuery = folderId
    ? prisma.contextMemory.findMany({
        where: { userId, type: "FOLDER", folderId, isDeleted: false },
        select: { id: true },
      })
    : Promise.resolve([]);

  const [globalContexts, folderContexts] = await Promise.all([
    globalContextsQuery,
    folderContextsQuery,
  ]);

  return Array.from(
    new Set([
      ...globalContexts.map((ctx: any) => ctx.id),
      ...folderContexts.map((ctx: any) => ctx.id),
    ]),
  );
}

async function getSelectedContextsForChat(userId: number, chatId: number) {
  let links = await prisma.chatContext.findMany({
    where: { chatId, context: { userId, isDeleted: false } },
    include: { context: true },
  });

  // Backfill defaults for older chats that do not have explicit context links yet.
  if (links.length === 0) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
      select: { folderId: true },
    });

    if (chat) {
      const defaultIds = await getDefaultContextIdsForChat(
        userId,
        chat.folderId,
      );
      if (defaultIds.length > 0) {
        await prisma.chatContext.createMany({
          data: defaultIds.map((contextId) => ({ chatId, contextId })),
          skipDuplicates: true,
        });
      }
      links = await prisma.chatContext.findMany({
        where: { chatId, context: { userId, isDeleted: false } },
        include: { context: true },
      });
    }
  }

  return links.map((link: any) => link.context);
}

// ---------------------------------------------------------------------------
// Helpers for building OpenRouter multipart message content from attachments
// ---------------------------------------------------------------------------

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
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
const SPREADSHEET_PREVIEW_ROWS = 200;
const SPREADSHEET_MAX_AI_CHARS = 22_000;
const SPREADSHEET_MAX_ROWS_TO_PARSE = 3000;
const PDF_MAX_PAGES = 24;
const PDF_MAX_AI_CHARS = 20_000;
const PDF_MAX_BYTES = 8 * 1024 * 1024;

interface AttachmentRecord {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
}

/**
 * Fetch a URL and return a base64 data URL string.
 */
async function urlToBase64DataUrl(
  url: string,
  mimeType: string,
): Promise<string> {
  let fetchUrl = url;
  // Optimize Cloudinary URLs to reduce image size before base64 conversion
  if (fetchUrl.includes("res.cloudinary.com") && fetchUrl.includes("/upload/")) {
    fetchUrl = fetchUrl.replace("/upload/", "/upload/w_1024,c_limit,q_auto,f_auto/");
  }

  const response = await fetch(fetchUrl);
  if (!response.ok)
    throw new Error(`Failed to fetch attachment: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Helper to detect image markdown and convert back to multipart image parts.
 * Useful for history building so models can see previous generated images.
 * Fetches the URL and converts to base64 for reliability in OpenRouter calls.
 */
async function detectAndConvertImages(
  content: string | any[],
): Promise<string | any[]> {
  if (!content) return content;
  if (Array.isArray(content)) return content;
  const imageMarkdownRegex = /!\[[^\]]*]\((https?:\/\/[^\)]+)\)/g;
  const matches = [...content.matchAll(imageMarkdownRegex)];
  if (matches.length === 0) return content;

  const parts: any[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    const textBefore = content.substring(lastIndex, match.index).trim();
    if (textBefore) parts.push({ type: "text", text: textBefore });

    const imageUrl = match[1];
    try {
      // Determine probable mime type from extension, or default to image/webp (common for Cloudinary)
      let mime = "image/webp";
      if (imageUrl.toLowerCase().endsWith(".png")) mime = "image/png";
      else if (
        imageUrl.toLowerCase().endsWith(".jpg") ||
        imageUrl.toLowerCase().endsWith(".jpeg")
      )
        mime = "image/jpeg";

      const dataUrl = await urlToBase64DataUrl(imageUrl, mime);
      parts.push({ type: "image_url", image_url: { url: dataUrl } });
    } catch (e) {
      console.error(
        "Failed to fetch image for history conversion:",
        imageUrl,
        e,
      );
      parts.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    lastIndex = match.index! + match[0].length;
  }
  const textAfter = content.substring(lastIndex).trim();
  if (textAfter) parts.push({ type: "text", text: textAfter });
  return parts;
}

/**
 * Build the OpenRouter content-parts array for a user message that has attachments.
 * Returns:
 *   - contentParts  : array to use as message.content
 *   - extraPlugins  : plugin list (reserved for future use)
 */
async function buildAttachmentContentParts(
  textContent: string,
  attachments: AttachmentRecord[],
): Promise<{ contentParts: any[]; extraPlugins: any[] }> {
  const parts: any[] = [];
  const extraPlugins: any[] = [];
  let extraText = "";
  const requestedColumns = inferRequiredColumnsFromPrompt(textContent);

  for (const att of attachments) {
    const mime = att.mimeType;

    if (IMAGE_MIME_TYPES.includes(mime)) {
      // Fetch image from Cloudinary and send as base64 — avoids URL fetch issues on OpenRouter
      try {
        const dataUrl = await urlToBase64DataUrl(att.fileUrl, mime);
        parts.push({ type: "image_url", image_url: { url: dataUrl } });
      } catch (e) {
        console.error("Failed to fetch image attachment", att.fileName, e);
        // Fallback: send URL directly
        parts.push({ type: "image_url", image_url: { url: att.fileUrl } });
      }
    } else if (PDF_MIME_TYPES.includes(mime)) {
      try {
        const pdfReport = await parsePdfFromUrl(att.fileUrl, att.fileName, {
          maxPages: PDF_MAX_PAGES,
          maxAiChars: PDF_MAX_AI_CHARS,
          maxBytes: PDF_MAX_BYTES,
        });
        extraText += `\n\n${pdfReport.aiText}`;
        console.log(
          `[Attachment Parse] PDF "${att.fileName}" extracted text:\n${pdfReport.aiText}`,
        );
      } catch (e) {
        console.error("Failed to parse PDF attachment", att.fileName, e);
        extraText += `\n\n[Attached PDF: ${att.fileName}]\nUnable to extract PDF text. Please summarize the PDF based on user instructions only if sufficient context is available.`;
      }
    } else if (WORD_MIME_TYPES.includes(mime)) {
      try {
        const response = await fetch(att.fileUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await mammoth.extractRawText({ buffer });
          const text = result.value.trim();
          if (text) {
            extraText += `\n\n[Attached Word Document: ${att.fileName}]\n${text}`;
            console.log(
              `[Attachment Parse] Word "${att.fileName}" extracted text:\n${text}`,
            );
          }
        }
      } catch (e) {
        console.error(
          "Failed to extract text from Word document",
          att.fileName,
          e,
        );
      }
    } else if (PPT_MIME_TYPES.includes(mime)) {
      try {
        const response = await fetch(att.fileUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          try {
            const ast = await parseOffice(buffer as any);
            const text = ast.toText();
            if (text && text.trim()) {
              extraText += `\n\n[Attached PowerPoint Presentation: ${att.fileName}]\n${text.trim()}`;
              console.log(
                `[Attachment Parse] PPT "${att.fileName}" extracted text:\n${text.trim()}`,
              );
            }
          } catch (parseError) {
            console.error(
              "OfficeParser failed to parse PPTX buffer for",
              att.fileName,
              parseError,
            );
          }
        }
      } catch (e) {
        console.error(
          "Failed to extract text from PowerPoint",
          att.fileName,
          e,
        );
      }
    } else if (TEXT_MIME_TYPES.includes(mime)) {
      // Fetch the raw text from Cloudinary URL and append inline
      try {
        const response = await fetch(att.fileUrl);
        if (response.ok) {
          const text = await response.text();
          extraText += `\n\n[Attached text file: ${att.fileName}]\n${text}`;
          console.log(
            `[Attachment Parse] Text file "${att.fileName}" content:\n${text}`,
          );
        }
      } catch (e) {
        console.error("Failed to fetch text attachment", att.fileName, e);
      }
    } else if (SPREADSHEET_MIME_TYPES.includes(mime)) {
      try {
        const spreadsheetReport = await parseSpreadsheetFromUrl(
          att.fileUrl,
          att.fileName,
          mime,
          {
            requiredColumns: requestedColumns,
            maxPreviewRows: SPREADSHEET_PREVIEW_ROWS,
            maxAiChars: SPREADSHEET_MAX_AI_CHARS,
            maxRowsToParse: SPREADSHEET_MAX_ROWS_TO_PARSE,
          },
        );
        extraText += `\n\n${spreadsheetReport.aiText}`;
        console.log(
          `[Attachment Parse] Spreadsheet "${att.fileName}" extracted text:\n${spreadsheetReport.aiText}`,
        );
      } catch (e) {
        console.error(
          "Failed to parse spreadsheet attachment",
          att.fileName,
          e,
        );
      }
    }
  }

  // Text part always comes first so the model reads the user's question before files
  const finalText = textContent + extraText;
  console.log(
    `[Attachment Parse] Final combined text sent to AI:\n${finalText}`,
  );
  const processedText = await detectAndConvertImages(finalText);
  if (Array.isArray(processedText)) {
    parts.unshift(...processedText);
  } else {
    parts.unshift({ type: "text", text: processedText });
  }

  return { contentParts: parts, extraPlugins };
}

async function checkTokenLimitsAndSetupStream(
  res: Response,
  wallet: any,
  model: any,
  conversationHistory: any[],
  chatId: number,
  assistantMessageId: number,
  messageIdPayload: Record<string, any>,
  enableFollowUpQuestions: boolean,
): Promise<{ maxCompletionTokens: number; trimmedHistory: any[] } | null> {
  const tokenMultiplier = model.tokenMultiplier ?? 1.0;
  const maxAffordableTokens = Math.floor(
    wallet.tokensRemaining / tokenMultiplier,
  );

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(
    `data: ${JSON.stringify({ type: "message_id", ...messageIdPayload })}\n\n`,
  );
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }

  // Extract the very latest message (the new user prompt)
  const latestPrompt = conversationHistory.pop();
  if (!latestPrompt) {
    return { maxCompletionTokens: maxAffordableTokens, trimmedHistory: [] };
  }

  // Check if just the newest prompt itself is too large (including a 100 token buffer for the response)
  const MIN_RESPONSE_TOKENS = 100;
  let currentHistoryTokens = estimateMessageTokens([latestPrompt]);

  if (currentHistoryTokens + MIN_RESPONSE_TOKENS >= maxAffordableTokens) {
    const allowedPromptTokens = Math.max(
      0,
      maxAffordableTokens - MIN_RESPONSE_TOKENS - 6 - 3,
    );

    if (allowedPromptTokens <= 0) {
      res.write(
        `data: ${JSON.stringify({ type: "error", code: "INSUFFICIENT_BALANCE", message: "Insufficient tokens for this prompt length." })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();

      await prisma.modelResponse.create({
        data: {
          chatId,
          messageId: assistantMessageId,
          modelId: model.id,
          content: "System: Insufficient tokens for this prompt.",
          promptTokens: currentHistoryTokens,
          completionTokens: 0,
          totalTokens: currentHistoryTokens,
          status: "FAILED",
          completedAt: new Date(),
        },
      });
      return null;
    }

    if (typeof latestPrompt.content === "string") {
      const maxChars = Math.floor(allowedPromptTokens * 2.2);
      latestPrompt.content =
        latestPrompt.content.substring(0, maxChars) +
        "... [Truncated to fit limits]";
    } else if (Array.isArray(latestPrompt.content)) {
      let remainingTokens = allowedPromptTokens;
      const truncatedContent = [];

      for (const part of latestPrompt.content) {
        if (part.type === "text" && typeof part.text === "string") {
          const partTokens = Math.ceil(part.text.length / 2.2);
          if (partTokens <= remainingTokens) {
            truncatedContent.push(part);
            remainingTokens -= partTokens;
          } else {
            const maxChars = Math.floor(remainingTokens * 2.2);
            if (maxChars > 0) {
              truncatedContent.push({
                ...part,
                text:
                  part.text.substring(0, maxChars) +
                  "... [Truncated to fit limits]",
              });
            }
            break;
          }
        } else if (part.type === "image_url") {
          if (remainingTokens >= 300) {
            truncatedContent.push(part);
            remainingTokens -= 300;
          } else {
            break;
          }
        } else if (
          part.type === "file" &&
          part.file &&
          typeof part.file.file_data === "string"
        ) {
          const fileTokens = Math.ceil(part.file.file_data.length / 50);
          if (fileTokens <= remainingTokens) {
            truncatedContent.push(part);
            remainingTokens -= fileTokens;
          } else {
            break;
          }
        } else {
          truncatedContent.push(part);
        }
      }
      latestPrompt.content = truncatedContent;
    }

    currentHistoryTokens = estimateMessageTokens([latestPrompt]);
  }

  // Start adding older messages back in from newest to oldest
  const reversedHistory = conversationHistory.reverse();
  const trimmedHistoryData: any[] = [];

  let historyMessageCount = 0;
  for (const msg of reversedHistory) {
    const isSystem = msg.role === "system" || msg.role === "SYSTEM";

    // Only apply the 4-message history window limit to non-system messages.
    // We continue the loop because we still want to find and include system messages
    // that were unshifted to the beginning of the history.
    if (!isSystem && historyMessageCount >= 6) continue;

    const msgTokens = estimateMessageTokens([msg]) - 3; // subtracting base overhead per message loop
    if (
      currentHistoryTokens + msgTokens + MIN_RESPONSE_TOKENS <
      maxAffordableTokens
    ) {
      currentHistoryTokens += msgTokens;
      trimmedHistoryData.unshift(msg);
      if (!isSystem) historyMessageCount++;
    }
  }

  // Always append the latest prompt at the end so the AI responds to the current message
  if (enableFollowUpQuestions) {
    const instruction =
      "\n\n---\nBased on your response, suggest 4 concise follow-up questions the user could ask next. Format them as a JSON array of strings inside a ```json block at the very end of your response.";
    let updatedContent = latestPrompt.content;

    if (Array.isArray(updatedContent)) {
      // Find the last text part and append it there, or add a new text part
      const lastTextPart = [...updatedContent]
        .reverse()
        .find((p) => p.type === "text");
      if (lastTextPart) {
        lastTextPart.text += instruction;
      } else {
        updatedContent.push({ type: "text", text: instruction });
      }
    } else {
      updatedContent = `${updatedContent}${instruction}`;
    }

    trimmedHistoryData.push({
      ...latestPrompt,
      content: updatedContent,
    });
  } else {
    trimmedHistoryData.push(latestPrompt);
  }

  // Set a hard absolute upper limit of 10,000 raw tokens for generating tokens in a single response
  // Note: For models with multipliers, this could incur up to 30k billable tokens (e.g. 3x Opus)
  const ABSOLUTE_MAX_COMPLETION = 10000;

  const maxCompletionTokens = Math.min(
    Math.max(1, maxAffordableTokens - currentHistoryTokens),
    ABSOLUTE_MAX_COMPLETION,
  );

  return { maxCompletionTokens, trimmedHistory: trimmedHistoryData };
}

interface SendMessageBody {
  content: string;
  modelId: number;
  chatType?: string;
  userMessageId?: number;
  assistantMessageId?: number;
  attachmentIds?: number[];
  replaceModelId?: number;
}

/**
 * Flattens a history entry's content to plain text.
 *
 * History content is either a bare string or the multipart array used for
 * attachments/images, so the document intent classifier — which only ever
 * reasons about words — needs the text parts pulled back out.
 */
function historyContentToText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

function keepOnlyFirstImageMarkdown(content: string): string {
  if (!content) return content;
  const imageMarkdownRegex = /!\[[^\]]*]\(([^)]+)\)/g;
  let firstMatchSeen = false;
  return content.replace(imageMarkdownRegex, (match) => {
    if (!firstMatchSeen) {
      firstMatchSeen = true;
      return match;
    }
    return "";
  });
}

const EMPTY_IMAGE_RESPONSE_ERROR =
  "Image generation failed: You have insufficient tokens for the image generation you should have minium 10K token for image generation.";

const FAILED_GENERATION_USER_MESSAGE =
  "Failed to generate a response. Please try again.";

const MAX_OPENROUTER_STREAM_ATTEMPTS = 2;

interface OpenRouterSseAccumulator {
  fullContent: string;
  promptTokens: number;
  completionTokens: number;
  imagesToUpload: string[];
  selectedImageUrl: string | null;
  finishReason: string | null;
}

interface OpenRouterStreamError extends Error {
  partialAcc?: OpenRouterSseAccumulator;
}

function createEmptyOpenRouterAccumulator(): OpenRouterSseAccumulator {
  return {
    fullContent: "",
    promptTokens: 0,
    completionTokens: 0,
    imagesToUpload: [],
    selectedImageUrl: null,
    finishReason: null,
  };
}

function hasStreamAccumulatorData(acc: OpenRouterSseAccumulator): boolean {
  return Boolean(
    acc.fullContent ||
    acc.promptTokens > 0 ||
    acc.completionTokens > 0 ||
    acc.imagesToUpload.length > 0 ||
    acc.finishReason,
  );
}

function getPartialAccumulatorFromError(
  error: any,
): OpenRouterSseAccumulator | null {
  return (error as OpenRouterStreamError)?.partialAcc || null;
}

function shouldRetryEmptyOpenRouterAttempt(
  chatType: string | undefined,
  fullContent: string,
  completionTokens: number,
): boolean {
  if (chatType === "IMAGE_GENERATION") {
    return !fullContent.trim();
  }
  return !fullContent.trim() && completionTokens === 0;
}

async function pipeOpenRouterStreamToClient(
  stream: AsyncIterable<any>,
  chatType: string | undefined,
  res: Response,
  isClientAborted: () => boolean,
  acc: OpenRouterSseAccumulator,
  streamOptions: { includeImages?: boolean; includeAnnotations?: boolean },
): Promise<void> {
  const includeImages = streamOptions.includeImages !== false;
  const includeAnnotations = streamOptions.includeAnnotations === true;

  for await (const chunk of stream) {
    let delta = chunk.choices?.[0]?.delta?.content || "";

    let annotations: any;
    if (includeAnnotations) {
      annotations =
        chunk.choices?.[0]?.delta?.annotations ||
        chunk.choices?.[0]?.message?.annotations ||
        (chunk.choices?.[0]?.delta?.content as any)?.annotations;
    }

    if (includeImages) {
      const images =
        chunk.choices?.[0]?.delta?.images ||
        chunk.choices?.[0]?.message?.images;
      if (images && Array.isArray(images)) {
        const imageUrls = images
          .map((img: any) => img.image_url?.url || img.url)
          .filter((url: string | undefined): url is string => Boolean(url));
        const uniqueUrls = [...new Set(imageUrls)];
        let selectedUrls = uniqueUrls;
        if (chatType === "IMAGE_GENERATION") {
          if (!acc.selectedImageUrl && uniqueUrls.length > 0) {
            acc.selectedImageUrl = uniqueUrls[0];
          }
          selectedUrls = acc.selectedImageUrl ? [acc.selectedImageUrl] : [];
        }
        const imageMd = selectedUrls
          .map((url: string) => {
            if (acc.imagesToUpload.includes(url)) return "";
            acc.imagesToUpload.push(url);
            return `\n![Generated Image](${url})\n`;
          })
          .join("");
        if (imageMd) delta += imageMd;
      }
    }

    if (delta) {
      acc.fullContent += delta;
      res.write(
        `data: ${JSON.stringify({ type: "token", content: delta })}\n\n`,
      );
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
      if (includeAnnotations && annotations && annotations.length > 0) {
        res.write(
          `data: ${JSON.stringify({ type: "annotations", annotations })}\n\n`,
        );
      }
    }

    if (chunk.usage) {
      acc.promptTokens = chunk.usage.prompt_tokens || 0;
      acc.completionTokens = chunk.usage.completion_tokens || 0;
    }
    const fr =
      chunk.choices?.[0]?.finish_reason ||
      chunk.choices?.[0]?.message?.finish_reason;
    if (fr) {
      acc.finishReason = fr;
    }
  }

  if (isClientAborted()) {
    const abortError = new Error("Generation aborted by client");
    (abortError as any).name = "AbortError";
    throw abortError;
  }
}

async function runOpenRouterStreamWithEmptyRetry(params: {
  chatType: string | undefined;
  res: Response;
  isClientAborted: () => boolean;
  streamOptions: { includeImages?: boolean; includeAnnotations?: boolean };
  createStream: () => Promise<AsyncIterable<any>>;
}): Promise<OpenRouterSseAccumulator> {
  let acc = createEmptyOpenRouterAccumulator();

  for (let attempt = 0; attempt < MAX_OPENROUTER_STREAM_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      acc = createEmptyOpenRouterAccumulator();
    }

    try {
      const stream = await params.createStream();
      await pipeOpenRouterStreamToClient(
        stream,
        params.chatType,
        params.res,
        params.isClientAborted,
        acc,
        params.streamOptions,
      );
    } catch (error: any) {
      const streamError = error as OpenRouterStreamError;
      if (hasStreamAccumulatorData(acc)) {
        streamError.partialAcc = { ...acc };
      }
      throw streamError;
    }

    if (
      !shouldRetryEmptyOpenRouterAttempt(
        params.chatType,
        acc.fullContent,
        acc.completionTokens,
      )
    ) {
      break;
    }
  }

  return acc;
}

export async function streamChat(req: Request, res: Response) {
  const userId = req.user!.id;
  const chatId = Number(req.params.chatId);
  const {
    content,
    modelId,
    chatType,
    userMessageId,
    assistantMessageId,
    attachmentIds,
    replaceModelId,
  } = req.body as SendMessageBody;
  const abortController = new AbortController();
  const isClientAborted = setupClientAbortTracking(req, res, abortController);

  try {
    // Validate inputs
    if (!content?.trim()) {
      res.status(400).json({ status: false, message: "Content is required" });
      return;
    }

    if (attachmentIds && attachmentIds.length > 5) {
      res.status(400).json({
        status: false,
        message: "Maximum 5 attachments allowed per message",
      });
      return;
    }

    // Get chat
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });
    if (!chat) {
      res.status(404).json({ status: false, message: "Chat not found" });
      return;
    }

    // Get model
    const model = await prisma.model.findFirst({
      where: { id: modelId, isActive: true, isDeleted: false },
      include: { modelProvider: true },
    });
    if (!model) {
      res
        .status(404)
        .json({ status: false, message: "Model not found or inactive" });
      return;
    }

    const isfreeModel = model.isFreeModel

    console.log(" it is returning from here 1", isfreeModel, model.isFreeModel, model.name, model.externalId, model.modelProvider.name)

    // Check wallet
    const wallet = await prisma.userWallet.findUnique({ where: { userId } });
    if ((!wallet || wallet.tokensRemaining <= 0 ) && !isfreeModel) {
      res.status(400).json({ status: false, code: "INSUFFICIENT_BALANCE", message: "Token limit exceeded" });
      return;
    }

    console.log(" it is returning from here 2")


    // Reuse existing user message or create a new one
    let userMessage: { id: number };
    if (userMessageId) {
      const existing = await prisma.message.findFirst({
        where: { id: userMessageId, chatId, role: "USER" },
      });
      if (!existing) {
        res
          .status(400)
          .json({ status: false, message: "Invalid userMessageId" });
        return;
      }
      userMessage = existing;
    } else {
      userMessage = await prisma.message.create({
        data: {
          chatId,
          role: "USER",
          content: content.trim(),
          chatType: chatType || "STANDARD",
        },
      });

      // Link any presend attachments to this new message
      if (attachmentIds && attachmentIds.length > 0) {
        await attachmentService.linkToMessage(attachmentIds, userMessage.id);
      }

      // Update chat title if first message
      const messageCount = await prisma.message.count({ where: { chatId } });
      if (messageCount === 1) {
        await prisma.chat.update({
          where: { id: chatId },
          data: { title: content.trim().substring(0, 60) },
        });
      }
    }

    // Reuse existing assistant message or create a new (empty) one early
    // so its ID can be sent to the frontend immediately
    let assistantMessage: { id: number };
    if (assistantMessageId) {
      const existing = await prisma.message.findFirst({
        where: { id: assistantMessageId, chatId, role: "ASSISTANT" },
      });
      if (!existing) {
        res
          .status(400)
          .json({ status: false, message: "Invalid assistantMessageId" });
        return;
      }
      assistantMessage = existing;
    } else {
      assistantMessage = await prisma.message.create({
        data: {
          chatId,
          role: "ASSISTANT",
          content: "",
          chatType: chatType || "STANDARD",
        },
      });
    }

    // A retry that switches models (e.g. "switch to free model" after an
    // insufficient-balance failure) supersedes the prior failed attempt on
    // this message instead of adding a second model to it.
    if (replaceModelId && replaceModelId !== modelId) {
      await prisma.modelResponse.deleteMany({
        where: {
          messageId: assistantMessage.id,
          modelId: replaceModelId,
          status: "FAILED",
        },
      });
    }

    await touchChat(chatId);

    // Build conversation history - exclude current messages to avoid duplication
    const previousMessages = await prisma.message.findMany({
      where: {
        chatId,
        isDeleted: false,
        id: { notIn: [assistantMessage.id, userMessage.id] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        modelResponses: {
          where: { status: "COMPLETED" },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        attachments: true,
      },
    });

    const conversationHistory: {
      role: "user" | "assistant" | "system";
      content: string | any[];
    }[] = [];
    for (const msg of previousMessages) {
      if (msg.role === "USER") {
        if ((msg as any).attachments && (msg as any).attachments.length > 0) {
          const { contentParts } = await buildAttachmentContentParts(
            msg.content,
            (msg as any).attachments,
          );
          conversationHistory.push({ role: "user", content: contentParts });
        } else {
          conversationHistory.push({ role: "user", content: msg.content });
        }
      } else if (msg.role === "ASSISTANT" && msg.modelResponses[0]?.content) {
        let assistantContent: string | any[] = msg.modelResponses[0].content;
        // If image generation was used, ensure images are sent back as multipart parts
        // so the model can see them in context and follow up/modify them.
        if (chatType === "IMAGE_GENERATION") {
          assistantContent = await detectAndConvertImages(assistantContent);
        }
        conversationHistory.push({
          role: "assistant",
          content: assistantContent,
        });
      }
    }

    const userPreference = await prisma.userPreference.findUnique({
      where: { userId },
    });
    const enableFollowUpQuestions =
      userPreference?.enableFollowUpQuestions !== false;

    // -----------------------------------------------------------------------
    // Persona injection – prepend the assistant's system prompt (or the
    // platform default for normal chats) so it sits at the very beginning of
    // the conversation context. Context memory (user personalisation) is
    // stacked on top of it next.
    // -----------------------------------------------------------------------
    let assistantTemperature: number | undefined;
    let personaPrompt: string | null = null;
    if (chat.assistantId) {
      const chatAssistant = await prisma.assistant.findFirst({
        where: { id: chat.assistantId, isActive: true, isDeleted: false },
      });
      if (chatAssistant) {
        console.log(
          `[DEBUG] Adding Assistant System Prompt for: ${chatAssistant.name}`,
        );
        personaPrompt = chatAssistant.systemPrompt;
        assistantTemperature = chatAssistant.temperature;
      } else {
        console.log(
          `[DEBUG] Assistant with ID ${chat.assistantId} not found or inactive`,
        );
      }
    }

    const systemPrompt = personaPrompt ?? getDefaultSystemPrompt(chatType);
    if (systemPrompt) {
      conversationHistory.unshift(
        buildSystemMessage(systemPrompt, model.externalId),
      );
    }

    const selectedContexts = await getSelectedContextsForChat(userId, chatId);
    const contextStrings = selectedContexts.map((c: any) => c.memory);

    if (contextStrings.length > 0) {
      console.log(
        `[DEBUG] Adding User Context (${contextStrings.length} items)`,
      );
      const systemContent = `User context (personalisation — always keep in mind):\n${contextStrings.map((c: any) => `- ${c}`).join("\n")}`;
      conversationHistory.unshift(
        buildSystemMessage(systemContent, model.externalId),
      );
    }

    // Build multipart content for current message if attachments are present
    let attachmentPlugins: any[] = [];
    let pushedAttachmentMessage = false;
    if (attachmentIds && attachmentIds.length > 0) {
      const attachments = await attachmentService.findMany(attachmentIds);
      if (attachments.length > 0) {
        const { contentParts, extraPlugins } =
          await buildAttachmentContentParts(content.trim(), attachments);
        // Replace the last user message with the multipart version
        // (checkTokenLimitsAndSetupStream will use the last item as latestPrompt)
        conversationHistory.push({ role: "user", content: contentParts });
        attachmentPlugins = extraPlugins;
        pushedAttachmentMessage = true;
      }
    }

    // Only push the plain-text version if the attachment content wasn't already pushed above
    // (e.g. no attachmentIds, or attachmentIds pointed at records that no longer exist)
    if (!pushedAttachmentMessage) {
      const userContent =
        chatType === "IMAGE_GENERATION"
          ? await detectAndConvertImages(content.trim())
          : content.trim();
      conversationHistory.push({ role: "user", content: userContent });
    }

    // --- IMAGE GENERATION ITERATION FIX ---
    // If we're in IMAGE_GENERATION mode, and the current user prompt doesn't have an image,
    // we should automatically "re-attach" the last generated image from the assistant.
    // This allows the model to see the subject it's supposed to be modifying.
    if (chatType === "IMAGE_GENERATION") {
      const currentTurn = conversationHistory[conversationHistory.length - 1];
      if (currentTurn && currentTurn.role === "user") {
        const hasImage =
          Array.isArray(currentTurn.content) &&
          currentTurn.content.some((p: any) => p.type === "image_url");

        if (!hasImage) {
          // Look for the last assistant image in history
          const lastImageMsg = [...conversationHistory]
            .reverse()
            .find(
              (m) =>
                m.role === "assistant" &&
                Array.isArray(m.content) &&
                m.content.some((p: any) => p.type === "image_url"),
            );

          if (lastImageMsg && Array.isArray(lastImageMsg.content)) {
            const imagePart = lastImageMsg.content.find(
              (p: any) => p.type === "image_url",
            );
            if (imagePart) {
              if (typeof currentTurn.content === "string") {
                currentTurn.content = [
                  { type: "text", text: currentTurn.content || content.trim() },
                  imagePart,
                ];
              } else if (Array.isArray(currentTurn.content)) {
                // Ensure text part is present
                if (!currentTurn.content.some((p: any) => p.type === "text")) {
                  currentTurn.content.unshift({
                    type: "text",
                    text: content.trim(),
                  });
                }
                currentTurn.content.push(imagePart);
              }
            }
          }
        }
      }
    }
    // ---------------------------------------

    // -----------------------------------------------------------------------
    // Document generation — pre-stream pass.
    //
    // Classifying BEFORE the answer streams is what stops the model from
    // refusing ("I can't create files, paste the text again") while the
    // pipeline renders the PDF anyway. Gated by a free regex, so ordinary
    // turns pay nothing; only a real document request costs the extra call.
    //
    // Runs before the token budget is computed so the injected note is priced
    // in rather than pushing the turn over the limit.
    // -----------------------------------------------------------------------
    const lastAssistantAnswer = [...conversationHistory]
      .reverse()
      .filter((m: any) => m.role === "assistant")
      .map((m: any) => historyContentToText(m.content))
      .find((text: string) => text.trim().length > 0);

    const documentTurn = await prepareDocumentTurn({
      chatId,
      userPrompt: content,
      lastAssistantAnswer,
    });

    if (documentTurn) {
      // Deliberately NOT unshifted and NOT cache_control'd, unlike the persona
      // and context blocks: this note changes every turn, so putting it at
      // index 0 would invalidate the cached prefix behind it on every message.
      // Slotting it after the stable system block keeps that prefix intact.
      const firstNonSystem = conversationHistory.findIndex(
        (m: any) => m.role !== "system" && m.role !== "SYSTEM",
      );
      conversationHistory.splice(
        firstNonSystem === -1 ? conversationHistory.length : firstNonSystem,
        0,
        { role: "system", content: documentTurn.systemNote },
      );
    }

    const tokenLimits = await checkTokenLimitsAndSetupStream(
      res,
      wallet,
      model,
      conversationHistory,
      chatId,
      assistantMessage.id,
      {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      },
      enableFollowUpQuestions,
    );
    if (tokenLimits === null) return;
    const { maxCompletionTokens, trimmedHistory } = tokenLimits;

    // Merge attachment plugins (from above) into the stream call
    const streamPlugins = attachmentPlugins;

    // -----------------------------------------------------------------------
    // Predefined response intercept – platform identity / greetings / about
    // -----------------------------------------------------------------------
    const predefinedText = checkPredefinedResponse(content, contextStrings);
    if (predefinedText) {
      // Stream word-by-word with a small delay (same feel as OpenRouter)
      const words = predefinedText.split(" ");
      let streamedContent = "";
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? "" : " ") + words[i];
        streamedContent += chunk;
        res.write(
          `data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`,
        );
        if (typeof (res as any).flush === "function") (res as any).flush();
        await new Promise((r) => setTimeout(r, 15));
      }

      // Calculate tokens using 3.5 chars/token estimator + model multiplier
      const pTokens = Math.ceil(content.length / 3.5);
      const cTokens = Math.ceil(predefinedText.length / 3.5);
      const tTokens = pTokens + cTokens;
      const tokenMultiplierPre = model.tokenMultiplier ?? 1.0;
      const billablePromptPre = Math.ceil(pTokens * tokenMultiplierPre);
      const billableCompletionPre = Math.ceil(cTokens * tokenMultiplierPre);

      let finalPrompt = pTokens;
      let finalCompletion = cTokens;
      let finalTotal = tTokens;

      await prisma.$transaction(async (tx: any) => {
        const walletRecord = await tx.userWallet.findUnique({
          where: { userId },
        });
        const availableTokens = walletRecord?.tokensRemaining || 0;

        const adjusted = calculateAdjustedTokens(
          availableTokens,
          billablePromptPre,
          billableCompletionPre,
          tokenMultiplierPre,
          pTokens,
          cTokens,
        );

        finalPrompt = adjusted.finalRawPrompt;
        finalCompletion = adjusted.finalRawCompletion;
        finalTotal = adjusted.finalRawTotal;

        await tx.message.update({
          where: { id: assistantMessage.id },
          data: { content: streamedContent },
        });
        await tx.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: streamedContent,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
        await tx.usageLog.create({
          data: {
            userId,
            modelId: model.id,
            chatId,
            messageId: assistantMessage.id,
            capability: (chatType || "STANDARD") as any,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            billablePromptTokens: adjusted.finalBillablePrompt,
            billableCompletionTokens: adjusted.finalBillableCompletion,
            billableTotalTokens: adjusted.finalBillableTotal,
          },
        });
        const updatedWallet = await tx.userWallet.update({
          where: { userId },
          data: {
            tokensRemaining: { decrement: adjusted.finalBillableTotal },
            tokensUsed: { increment: adjusted.finalBillableTotal },
          },
        });

        await createWalletTransaction(tx, {
          userId,
          walletId: updatedWallet.id,
          amount: adjusted.finalBillableTotal,
          type: "DEBIT",
          referenceId: `chat_usage_${assistantMessage.id}`,
          meta: {
            reason: "PREDEFINED_RESPONSE",
            chatId,
            messageId: assistantMessage.id,
          },
        });
      });

      res.write(
        `data: ${JSON.stringify({ type: "done", promptTokens: finalPrompt, completionTokens: finalCompletion, totalTokens: finalTotal })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // Call OpenRouter with streaming
    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let imagesToUpload: string[] = [];
    let finishReason: string | null = null;

    try {
      const acc = await runOpenRouterStreamWithEmptyRetry({
        chatType,
        res,
        isClientAborted,
        streamOptions: { includeImages: true, includeAnnotations: true },
        createStream: () =>
          createOpenRouterStream({
            model: model.externalId,
            messages: trimmedHistory,
            chatType,
            max_tokens: maxCompletionTokens,
            plugins: streamPlugins.length > 0 ? streamPlugins : undefined,
            temperature: assistantTemperature,
            signal: abortController.signal,
          }),
      });
      fullContent = acc.fullContent;
      promptTokens = acc.promptTokens;
      completionTokens = acc.completionTokens;
      imagesToUpload = acc.imagesToUpload;
      finishReason = acc.finishReason;
    } catch (aiError: any) {
      const partialAcc = getPartialAccumulatorFromError(aiError);
      if (partialAcc) {
        fullContent = partialAcc.fullContent || fullContent;
        promptTokens = partialAcc.promptTokens || promptTokens;
        completionTokens = partialAcc.completionTokens || completionTokens;
        if (partialAcc.imagesToUpload.length > 0) {
          imagesToUpload = partialAcc.imagesToUpload;
        }
        finishReason = partialAcc.finishReason || finishReason;
      }

      if (isClientAborted() || isAbortError(aiError)) {
        const stoppedContent =
          fullContent.trim() || "Generation stopped by user.";
        try {
          const tokenMultiplier = model.tokenMultiplier ?? 1.0;
          const billablePromptTokens = Math.ceil(
            (promptTokens || 0) * tokenMultiplier,
          );
          const billableCompletionTokens = Math.ceil(
            (completionTokens || 0) * tokenMultiplier,
          );

          await prisma.$transaction(async (tx: any) => {
            const walletRecord = await tx.userWallet.findUnique({
              where: { userId },
            });
            const availableTokens = walletRecord?.tokensRemaining || 0;

            const adjusted = calculateAdjustedTokens(
              availableTokens,
              billablePromptTokens,
              billableCompletionTokens,
              tokenMultiplier,
              promptTokens || 0,
              completionTokens || 0,
            );

            await tx.message.update({
              where: { id: assistantMessage.id },
              data: { content: stoppedContent },
            });

            await tx.modelResponse.create({
              data: {
                chatId,
                messageId: assistantMessage.id,
                modelId: model.id,
                content: stoppedContent,
                promptTokens: adjusted.finalRawPrompt,
                completionTokens: adjusted.finalRawCompletion,
                totalTokens: adjusted.finalRawTotal,
                status: "FAILED",
                finishReason: finishReason || "user_aborted",
                completedAt: new Date(),
              },
            });

            if (adjusted.finalBillableTotal > 0) {
              await tx.usageLog.create({
                data: {
                  userId,
                  modelId: model.id,
                  chatId,
                  messageId: assistantMessage.id,
                  capability: (chatType || "STANDARD") as any,
                  promptTokens: adjusted.finalRawPrompt,
                  completionTokens: adjusted.finalRawCompletion,
                  totalTokens: adjusted.finalRawTotal,
                  billablePromptTokens: adjusted.finalBillablePrompt,
                  billableCompletionTokens: adjusted.finalBillableCompletion,
                  billableTotalTokens: adjusted.finalBillableTotal,
                },
              });

              const updatedWallet = await tx.userWallet.update({
                where: { userId },
                data: {
                  tokensRemaining: {
                    decrement: adjusted.finalBillableTotal,
                  },
                  tokensUsed: { increment: adjusted.finalBillableTotal },
                },
              });

              await createWalletTransaction(tx, {
                userId,
                walletId: updatedWallet.id,
                amount: adjusted.finalBillableTotal,
                type: "DEBIT",
                referenceId: `chat_usage_${assistantMessage.id}_aborted`,
                meta: {
                  reason: "STREAM_ABORTED_BY_USER",
                  chatId,
                  messageId: assistantMessage.id,
                },
              });
            }
          });
        } catch {}
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      console.error("❌ OpenRouter Error:");
      console.error("  Status:", aiError.status);
      console.error("  Message:", aiError.message);
      console.error(
        "  Error body:",
        JSON.stringify(aiError.error || aiError.response?.data, null, 2),
      );

      // Save whatever partial content we received so it doesn't vanish from the UI
      // Even if empty, we must create a FAILED message so the assistant bubble persists
      try {
        await prisma.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: fullContent || "",
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            totalTokens: (promptTokens || 0) + (completionTokens || 0),
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
        // Update assistant message content with whatever we got
        await prisma.message.update({
          where: { id: assistantMessage.id },
          data: { content: fullContent || "" },
        });
      } catch (dbErr) {
        console.error("Failed to save partial AI response to DB", dbErr);
      }

      res.write(
        `data: ${JSON.stringify({ type: "error", message: aiError.message || "AI request failed" })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (chatType === "IMAGE_GENERATION" && !fullContent.trim()) {
      const failureMessage = EMPTY_IMAGE_RESPONSE_ERROR;
      await prisma.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: assistantMessage.id },
          data: { content: failureMessage },
        });
        await tx.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: failureMessage,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
      });
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (!fullContent.trim() && chatType !== "IMAGE_GENERATION") {
      const failureMessage = FAILED_GENERATION_USER_MESSAGE;
      await prisma.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: assistantMessage.id },
          data: { content: failureMessage },
        });
        await tx.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: failureMessage,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
      });
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (imagesToUpload.length > 0) {
      for (const origUrl of imagesToUpload) {
        try {
          const result = await uploadToCloudinary(origUrl, {
            folder: "ai-colab-chat/generated",
            format: "webp",
            quality: "auto",
          });
          if (result && result.url) {
            fullContent = fullContent.split(origUrl).join(result.url);
          }
        } catch (imgError) {
          console.error("  ❌ Failed to upload image to Cloudinary:", imgError);
        }
      }
    }
    if (chatType === "IMAGE_GENERATION") {
      fullContent = keepOnlyFirstImageMarkdown(fullContent).trim();
    }

    const tokenMultiplier = model.tokenMultiplier ?? 1.0;
    const billablePromptTokens = Math.ceil(promptTokens * tokenMultiplier);
    const billableCompletionTokens = Math.ceil(
      completionTokens * tokenMultiplier,
    );

    let finalPrompt = promptTokens;
    let finalCompletion = completionTokens;
    let finalTotal = promptTokens + completionTokens;

    // Update assistant message + create model response + deduct tokens in transaction
    await prisma.$transaction(async (tx: any) => {
      const walletRecord = await tx.userWallet.findUnique({
        where: { userId },
      });
      const availableTokens = walletRecord?.tokensRemaining || 0;

      const adjusted = calculateAdjustedTokens(
        availableTokens,
        billablePromptTokens,
        billableCompletionTokens,
        tokenMultiplier,
        promptTokens,
        completionTokens,
      );

      finalPrompt = adjusted.finalRawPrompt;
      finalCompletion = adjusted.finalRawCompletion;
      finalTotal = adjusted.finalRawTotal;

      await tx.message.update({
        where: { id: assistantMessage.id },
        data: { content: fullContent },
      });

      const mr = await tx.modelResponse.create({
        data: {
          chatId,
          messageId: assistantMessage.id,
          modelId: model.id,
          content: fullContent,
          promptTokens: adjusted.finalRawPrompt,
          completionTokens: adjusted.finalRawCompletion,
          totalTokens: adjusted.finalRawTotal,
          status: "COMPLETED",
          finishReason,
          completedAt: new Date(),
        },
      });

      if (mr) {
        (res as any).modelResponseId = mr.id;
      }  

      if (adjusted.finalBillableTotal > 0) {
        await tx.usageLog.create({
          data: {
            userId,
            modelId: model.id,
            chatId,
            messageId: assistantMessage.id,
            capability: (chatType || "STANDARD") as any,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            billablePromptTokens: adjusted.finalBillablePrompt,
            billableCompletionTokens: adjusted.finalBillableCompletion,
            billableTotalTokens: adjusted.finalBillableTotal,
          },
        });

        const updatedWallet = await tx.userWallet.update({
          where: { userId },
          data: {
            tokensRemaining: { decrement: adjusted.finalBillableTotal },
            tokensUsed: { increment: adjusted.finalBillableTotal },
          },
        });

        await createWalletTransaction(tx, {
          userId,
          walletId: updatedWallet.id,
          amount: adjusted.finalBillableTotal,
          type: "DEBIT",
          referenceId: `chat_usage_${assistantMessage.id}`,
          meta: {
            reason: "STREAMED_RESPONSE",
            chatId,
            messageId: assistantMessage.id,
          },
        });
      }
    });

    await maybeEnqueueDistillation(chatId, chat.folderId);

    // Document generation — enqueue pass. Intent was already resolved before
    // the stream (see prepareDocumentTurn above) and is handed back here, so
    // the classifier is never paid for twice in one turn. The enqueue itself
    // still has to wait for the answer, which is the document's source text.
    const generatedDocument = await maybeGenerateDocumentFromChat({
      userId,
      chatId,
      messageId: assistantMessage.id,
      modelResponseId: (res as any).modelResponseId,
      userPrompt: content,
      assistantAnswer: fullContent,
      intent: documentTurn?.intent ?? null,
      effectiveFormat: documentTurn?.effectiveFormat,
    });
    if (generatedDocument) {
      res.write(
        `data: ${JSON.stringify({ type: "document_started", documentId: generatedDocument.documentId, format: generatedDocument.format, title: generatedDocument.title })}\n\n`,
      );
    }

    // Send done signal with usage info
    res.write(
      `data: ${JSON.stringify({ type: "done", modelResponseId: (res as any).modelResponseId, promptTokens: finalPrompt, completionTokens: finalCompletion, totalTokens: finalTotal, finishReason })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Stream chat error:", error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        status: false,
        message: error.message || "Internal server error",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}

export async function regenerateChat(req: Request, res: Response) {
  const userId = req.user!.id;
  const chatId = Number(req.params.chatId);
  const messageId = Number(req.params.messageId);
  const { modelId, chatType } = req.body as {
    modelId: number;
    chatType?: string;
  };
  const abortController = new AbortController();
  const isClientAborted = setupClientAbortTracking(req, res, abortController);

  try {
    if (!modelId) {
      res.status(400).json({ status: false, message: "modelId is required" });
      return;
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });
    if (!chat) {
      res.status(404).json({ status: false, message: "Chat not found" });
      return;
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId, isActive: true, isDeleted: false },
      include: { modelProvider: true },
    });
    if (!model) {
      res
        .status(404)
        .json({ status: false, message: "Model not found or inactive" });
      return;
    }

    const wallet = await prisma.userWallet.findUnique({ where: { userId } });
    if (!wallet || wallet.tokensRemaining <= 0) {
      res.status(400).json({ status: false, code: "INSUFFICIENT_BALANCE", message: "Token limit exceeded" });
      return;
    }

    const allMessages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: {
        modelResponses: {
          where: { status: "COMPLETED" },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        attachments: true,
      },
    });

    const targetIndex = allMessages.findIndex((m: any) => m.id === messageId);
    if (targetIndex === -1 || allMessages[targetIndex].role !== "ASSISTANT") {
      res
        .status(404)
        .json({ status: false, message: "Target assistant message not found" });
      return;
    }

    const previousMessages = allMessages.slice(0, targetIndex);
    const conversationHistory: {
      role: "user" | "assistant" | "system";
      content: string | any[];
    }[] = [];
    for (const msg of previousMessages) {
      if (msg.role === "USER") {
        if (msg.attachments && msg.attachments.length > 0) {
          const { contentParts } = await buildAttachmentContentParts(
            msg.content,
            msg.attachments,
          );
          conversationHistory.push({ role: "user", content: contentParts });
        } else {
          conversationHistory.push({ role: "user", content: msg.content });
        }
      } else if (msg.role === "ASSISTANT" && msg.modelResponses[0]?.content) {
        let assistantContent: string | any[] = msg.modelResponses[0].content;
        if (chatType === "IMAGE_GENERATION") {
          assistantContent = await detectAndConvertImages(assistantContent);
        }
        conversationHistory.push({
          role: "assistant",
          content: assistantContent,
        });
      }
    }

    const userPreference = await prisma.userPreference.findUnique({
      where: { userId },
    });
    const enableFollowUpQuestions =
      userPreference?.enableFollowUpQuestions !== false;

    // Prepend the persona (assistant prompt, or the platform default for
    // normal chats), then context memory on top — same order as streamChat.
    let personaPromptRegen: string | null = null;
    if (chat.assistantId) {
      const chatAssistant = await prisma.assistant.findFirst({
        where: { id: chat.assistantId, isActive: true, isDeleted: false },
      });
      if (chatAssistant) personaPromptRegen = chatAssistant.systemPrompt;
    }

    const systemPromptRegen =
      personaPromptRegen ?? getDefaultSystemPrompt(chatType);
    if (systemPromptRegen) {
      conversationHistory.unshift(
        buildSystemMessage(systemPromptRegen, model.externalId),
      );
    }

    // Prepend context memory as a system message
    const selectedContextsRegen = await getSelectedContextsForChat(
      userId,
      chatId,
    );
    const contextStringsRegen = selectedContextsRegen.map((c: any) => c.memory);

    if (contextStringsRegen.length > 0) {
      const systemContent = `User context (personalisation — always keep in mind):\n${contextStringsRegen.map((c: any) => `- ${c}`).join("\n")}`;
      conversationHistory.unshift(
        buildSystemMessage(systemContent, model.externalId),
      );
    }

    // --- IMAGE GENERATION ITERATION FIX ---
    if (chatType === "IMAGE_GENERATION") {
      const currentTurn = conversationHistory[conversationHistory.length - 1];
      if (currentTurn && currentTurn.role === "user") {
        const hasImage =
          Array.isArray(currentTurn.content) &&
          currentTurn.content.some((p: any) => p.type === "image_url");

        if (!hasImage) {
          // Look for the last assistant image in history
          const lastImageMsg = [...conversationHistory]
            .reverse()
            .find(
              (m) =>
                m.role === "assistant" &&
                Array.isArray(m.content) &&
                m.content.some((p: any) => p.type === "image_url"),
            );

          if (lastImageMsg && Array.isArray(lastImageMsg.content)) {
            const imagePart = lastImageMsg.content.find(
              (p: any) => p.type === "image_url",
            );
            if (imagePart) {
              if (typeof currentTurn.content === "string") {
                currentTurn.content = [
                  { type: "text", text: currentTurn.content },
                  imagePart,
                ];
              } else if (Array.isArray(currentTurn.content)) {
                currentTurn.content.push(imagePart);
              }
            }
          }
        }
      }
    }
    // ---------------------------------------

    const prevMessageId =
      previousMessages[previousMessages.length - 1]?.id || 0;
    const tokenLimits = await checkTokenLimitsAndSetupStream(
      res,
      wallet,
      model,
      conversationHistory,
      chatId,
      messageId,
      { userMessageId: prevMessageId, assistantMessageId: messageId },
      enableFollowUpQuestions,
    );
    if (tokenLimits === null) return;
    const { maxCompletionTokens, trimmedHistory } = tokenLimits;

    // -----------------------------------------------------------------------
    // Predefined response intercept (regenerate path)
    // -----------------------------------------------------------------------
    const prevUserMsg = previousMessages[previousMessages.length - 1];
    const originalContent =
      prevUserMsg?.role === "USER" ? prevUserMsg.content : "";
    const predefinedTextRegen = originalContent
      ? checkPredefinedResponse(originalContent, contextStringsRegen)
      : null;
    if (predefinedTextRegen) {
      const words = predefinedTextRegen.split(" ");
      let streamedContent = "";
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? "" : " ") + words[i];
        streamedContent += chunk;
        res.write(
          `data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`,
        );
        if (typeof (res as any).flush === "function") (res as any).flush();
        await new Promise((r) => setTimeout(r, 15));
      }

      const pTokens = Math.ceil(originalContent.length / 3.5);
      const cTokens = Math.ceil(predefinedTextRegen.length / 3.5);
      const tTokens = pTokens + cTokens;
      const tokenMultiplierRegen = model.tokenMultiplier ?? 1.0;
      const billablePromptRegen = Math.ceil(pTokens * tokenMultiplierRegen);
      const billableCompletionRegen = Math.ceil(cTokens * tokenMultiplierRegen);

      let finalPrompt = pTokens;
      let finalCompletion = cTokens;
      let finalTotal = tTokens;

      await prisma.$transaction(async (tx: any) => {
        const walletRecord = await tx.userWallet.findUnique({
          where: { userId },
        });
        const availableTokens = walletRecord?.tokensRemaining || 0;

        const adjusted = calculateAdjustedTokens(
          availableTokens,
          billablePromptRegen,
          billableCompletionRegen,
          tokenMultiplierRegen,
          pTokens,
          cTokens,
        );

        finalPrompt = adjusted.finalRawPrompt;
        finalCompletion = adjusted.finalRawCompletion;
        finalTotal = adjusted.finalRawTotal;

        await tx.modelResponse.create({
          data: {
            chatId,
            messageId,
            modelId: model.id,
            content: streamedContent,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
        await tx.usageLog.create({
          data: {
            userId,
            modelId: model.id,
            chatId,
            messageId,
            capability: (chatType || "STANDARD") as any,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            billablePromptTokens: adjusted.finalBillablePrompt,
            billableCompletionTokens: adjusted.finalBillableCompletion,
            billableTotalTokens: adjusted.finalBillableTotal,
          },
        });
        const updatedWallet = await tx.userWallet.update({
          where: { userId },
          data: {
            tokensRemaining: { decrement: adjusted.finalBillableTotal },
            tokensUsed: { increment: adjusted.finalBillableTotal },
          },
        });

        await createWalletTransaction(tx, {
          userId,
          walletId: updatedWallet.id,
          amount: adjusted.finalBillableTotal,
          type: "DEBIT",
          referenceId: `chat_usage_${messageId}`,
          meta: { reason: "PREDEFINED_REGENERATE", chatId, messageId },
        });
      });

      res.write(
        `data: ${JSON.stringify({ type: "done", promptTokens: finalPrompt, completionTokens: finalCompletion, totalTokens: finalTotal })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let imagesToUpload: string[] = [];
    let finishReason: string | null = null;

    try {
      const acc = await runOpenRouterStreamWithEmptyRetry({
        chatType,
        res,
        isClientAborted,
        streamOptions: { includeImages: true, includeAnnotations: false },
        createStream: () =>
          createOpenRouterStream({
            model: model.externalId,
            messages: trimmedHistory,
            chatType,
            max_tokens: maxCompletionTokens,
            signal: abortController.signal,
          }),
      });
      fullContent = acc.fullContent;
      promptTokens = acc.promptTokens;
      completionTokens = acc.completionTokens;
      imagesToUpload = acc.imagesToUpload;
      finishReason = acc.finishReason;
    } catch (aiError: any) {
      const partialAcc = getPartialAccumulatorFromError(aiError);
      if (partialAcc) {
        fullContent = partialAcc.fullContent || fullContent;
        promptTokens = partialAcc.promptTokens || promptTokens;
        completionTokens = partialAcc.completionTokens || completionTokens;
        if (partialAcc.imagesToUpload.length > 0) {
          imagesToUpload = partialAcc.imagesToUpload;
        }
        finishReason = partialAcc.finishReason || finishReason;
      }

      if (isClientAborted() || isAbortError(aiError)) {
        const stoppedContent =
          fullContent.trim() || "Generation stopped by user.";
        try {
          const tokenMultiplier = model.tokenMultiplier ?? 1.0;
          const billablePromptTokens = Math.ceil(
            (promptTokens || 0) * tokenMultiplier,
          );
          const billableCompletionTokens = Math.ceil(
            (completionTokens || 0) * tokenMultiplier,
          );

          await prisma.$transaction(async (tx: any) => {
            const walletRecord = await tx.userWallet.findUnique({
              where: { userId },
            });
            const availableTokens = walletRecord?.tokensRemaining || 0;

            const adjusted = calculateAdjustedTokens(
              availableTokens,
              billablePromptTokens,
              billableCompletionTokens,
              tokenMultiplier,
              promptTokens || 0,
              completionTokens || 0,
            );

            await tx.message.update({
              where: { id: messageId },
              data: { content: stoppedContent },
            });

            await tx.modelResponse.create({
              data: {
                chatId,
                messageId,
                modelId: model.id,
                content: stoppedContent,
                promptTokens: adjusted.finalRawPrompt,
                completionTokens: adjusted.finalRawCompletion,
                totalTokens: adjusted.finalRawTotal,
                status: "FAILED",
                finishReason: finishReason || "user_aborted",
                completedAt: new Date(),
              },
            });

            if (adjusted.finalBillableTotal > 0) {
              await tx.usageLog.create({
                data: {
                  userId,
                  modelId: model.id,
                  chatId,
                  messageId,
                  capability: (chatType || "STANDARD") as any,
                  promptTokens: adjusted.finalRawPrompt,
                  completionTokens: adjusted.finalRawCompletion,
                  totalTokens: adjusted.finalRawTotal,
                  billablePromptTokens: adjusted.finalBillablePrompt,
                  billableCompletionTokens: adjusted.finalBillableCompletion,
                  billableTotalTokens: adjusted.finalBillableTotal,
                },
              });

              const updatedWallet = await tx.userWallet.update({
                where: { userId },
                data: {
                  tokensRemaining: {
                    decrement: adjusted.finalBillableTotal,
                  },
                  tokensUsed: { increment: adjusted.finalBillableTotal },
                },
              });

              await createWalletTransaction(tx, {
                userId,
                walletId: updatedWallet.id,
                amount: adjusted.finalBillableTotal,
                type: "DEBIT",
                referenceId: `chat_usage_${messageId}_aborted`,
                meta: {
                  reason: "STREAM_ABORTED_BY_USER",
                  chatId,
                  messageId,
                },
              });
            }
          });
        } catch {}
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      console.error("❌ OpenRouter Error in regenerate:", aiError.message);
      try {
        await prisma.modelResponse.create({
          data: {
            chatId,
            messageId,
            modelId: model.id,
            content: fullContent || "",
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            totalTokens: (promptTokens || 0) + (completionTokens || 0),
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
      } catch (dbErr) {
        console.error("Failed to save partial AI response to DB", dbErr);
      }

      res.write(
        `data: ${JSON.stringify({ type: "error", message: aiError.message || "AI request failed" })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (chatType === "IMAGE_GENERATION" && !fullContent.trim()) {
      const failureMessage = EMPTY_IMAGE_RESPONSE_ERROR;
      await prisma.modelResponse.create({
        data: {
          chatId,
          messageId,
          modelId: model.id,
          content: failureMessage,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          status: "FAILED",
          finishReason,
          completedAt: new Date(),
        },
      });
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (!fullContent.trim() && chatType !== "IMAGE_GENERATION") {
      const failureMessage = FAILED_GENERATION_USER_MESSAGE;
      await prisma.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: messageId },
          data: { content: failureMessage },
        });
        await tx.modelResponse.create({
          data: {
            chatId,
            messageId,
            modelId: model.id,
            content: failureMessage,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
      });
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (imagesToUpload.length > 0) {
      for (const origUrl of imagesToUpload) {
        try {
          const result = await uploadToCloudinary(origUrl, {
            folder: "ai-colab-chat/generated",
            format: "webp",
            quality: "auto",
          });
          if (result && result.url) {
            fullContent = fullContent.split(origUrl).join(result.url);
          }
        } catch (imgError) {
          console.error("  ❌ Failed to upload image to Cloudinary:", imgError);
        }
      }
    }
    if (chatType === "IMAGE_GENERATION") {
      fullContent = keepOnlyFirstImageMarkdown(fullContent).trim();
    }

    const tokenMultiplier = model.tokenMultiplier ?? 1.0;
    const billablePromptTokens = Math.ceil(promptTokens * tokenMultiplier);
    const billableCompletionTokens = Math.ceil(
      completionTokens * tokenMultiplier,
    );

    let finalPrompt = promptTokens;
    let finalCompletion = completionTokens;
    let finalTotal = promptTokens + completionTokens;

    await prisma.$transaction(async (tx: any) => {
      const walletRecord = await tx.userWallet.findUnique({
        where: { userId },
      });
      const availableTokens = walletRecord?.tokensRemaining || 0;

      const adjusted = calculateAdjustedTokens(
        availableTokens,
        billablePromptTokens,
        billableCompletionTokens,
        tokenMultiplier,
        promptTokens,
        completionTokens,
      );

      finalPrompt = adjusted.finalRawPrompt;
      finalCompletion = adjusted.finalRawCompletion;
      finalTotal = adjusted.finalRawTotal;

      const mr = await tx.modelResponse.create({
        data: {
          chatId,
          messageId,
          modelId: model.id,
          content: fullContent,
          promptTokens: adjusted.finalRawPrompt,
          completionTokens: adjusted.finalRawCompletion,
          totalTokens: adjusted.finalRawTotal,
          status: "COMPLETED",
          finishReason,
          completedAt: new Date(),
        },
      });

      if (mr) {
        (res as any).modelResponseId = mr.id;
      }

      if (adjusted.finalBillableTotal > 0) {
        await tx.usageLog.create({
          data: {
            userId,
            modelId: model.id,
            chatId,
            messageId,
            capability: (chatType || "STANDARD") as any,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            billablePromptTokens: adjusted.finalBillablePrompt,
            billableCompletionTokens: adjusted.finalBillableCompletion,
            billableTotalTokens: adjusted.finalBillableTotal,
          },
        });

        const updatedWallet = await tx.userWallet.update({
          where: { userId },
          data: {
            tokensRemaining: { decrement: adjusted.finalBillableTotal },
            tokensUsed: { increment: adjusted.finalBillableTotal },
          },
        });

        await createWalletTransaction(tx, {
          userId,
          walletId: updatedWallet.id,
          amount: adjusted.finalBillableTotal,
          type: "DEBIT",
          referenceId: `chat_usage_${messageId}`,
          meta: { reason: "STREAMED_REGENERATE", chatId, messageId },
        });
      }
    });

    await maybeEnqueueDistillation(chatId, chat.folderId);

    res.write(
      `data: ${JSON.stringify({ type: "done", modelResponseId: (res as any).modelResponseId, promptTokens: finalPrompt, completionTokens: finalCompletion, totalTokens: finalTotal, finishReason })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Regenerate chat error:", error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        status: false,
        message: error.message || "Internal server error",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}

export async function prepareMulti(req: Request, res: Response) {
  const userId = req.user!.id;
  const chatId = Number(req.params.chatId);
  const { content, attachmentIds, chatType } = req.body as {
    content: string;
    attachmentIds?: number[];
    chatType?: string;
  };

  try {
    if (!content?.trim()) {
      res.status(400).json({ status: false, message: "Content is required" });
      return;
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });
    if (!chat) {
      res.status(404).json({ status: false, message: "Chat not found" });
      return;
    }

    // Create user message
    const userMessage = await prisma.message.create({
      data: {
        chatId,
        role: "USER",
        content: content.trim(),
        chatType: chatType || "STANDARD",
      },
    });

    if (attachmentIds && attachmentIds.length > 0) {
      await attachmentService.linkToMessage(attachmentIds, userMessage.id);
    }

    // Update chat title if first message
    const messageCount = await prisma.message.count({ where: { chatId } });
    if (messageCount === 1) {
      await prisma.chat.update({
        where: { id: chatId },
        data: { title: content.trim().substring(0, 60) },
      });
    }

    // Create empty assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        chatId,
        role: "ASSISTANT",
        content: "",
        chatType: chatType || "STANDARD",
      },
    });

    await touchChat(chatId);

    res.json({
      status: true,
      data: {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      },
    });
  } catch (error: any) {
    console.error("Prepare multi error:", error);
    res.status(500).json({
      status: false,
      message: error.message || "Internal server error",
    });
  }
}

export async function editAndResend(req: Request, res: Response) {
  const userId = req.user!.id;
  const chatId = Number(req.params.chatId);
  const originalMessageId = Number(req.params.messageId);
  const { content, modelId, chatType } = req.body as {
    content: string;
    modelId: number;
    chatType?: string;
  };
  const abortController = new AbortController();
  const isClientAborted = setupClientAbortTracking(req, res, abortController);

  try {
    if (!content?.trim()) {
      res.status(400).json({ status: false, message: "Content is required" });
      return;
    }
    if (!modelId) {
      res.status(400).json({ status: false, message: "modelId is required" });
      return;
    }

    // Get chat
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });
    if (!chat) {
      res.status(404).json({ status: false, message: "Chat not found" });
      return;
    }

    // Find original user message
    const originalMessage = await prisma.message.findFirst({
      where: { id: originalMessageId, chatId, role: "USER", isDeleted: false },
    });
    if (!originalMessage) {
      res
        .status(404)
        .json({ status: false, message: "Original message not found" });
      return;
    }

    // Get model
    const model = await prisma.model.findFirst({
      where: { id: modelId, isActive: true, isDeleted: false },
      include: { modelProvider: true },
    });
    if (!model) {
      res
        .status(404)
        .json({ status: false, message: "Model not found or inactive" });
      return;
    }

    // Check wallet
    const wallet = await prisma.userWallet.findUnique({ where: { userId } });
    if (!wallet || wallet.tokensRemaining <= 0) {
      res.status(400).json({ status: false, code: "INSUFFICIENT_BALANCE", message: "Token limit exceeded" });
      return;
    }

    // Find the assistant response paired with the original user message
    // so we can preserve it for version navigation
    const pairedAssistant = await prisma.message.findFirst({
      where: {
        chatId,
        role: "ASSISTANT",
        isDeleted: false,
        createdAt: { gt: originalMessage.createdAt },
      },
      orderBy: { createdAt: "asc" },
    });

    // Soft-delete messages that came AFTER the paired assistant
    // (preserves the original user→assistant pair for version switching)
    if (pairedAssistant) {
      await prisma.message.updateMany({
        where: {
          chatId,
          isDeleted: false,
          createdAt: { gt: pairedAssistant.createdAt },
        },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }

    // Determine the root message id for editedFromId
    // If the original was itself an edit, chain to the same root
    const rootMessageId = originalMessage.editedFromId || originalMessage.id;

    // Create new user message linked to original
    const newUserMessage = await prisma.message.create({
      data: {
        chatId,
        role: "USER",
        content: content.trim(),
        editedFromId: rootMessageId,
        chatType: chatType || "STANDARD",
      },
    });

    // Create empty assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        chatId,
        role: "ASSISTANT",
        content: "",
        chatType: chatType || "STANDARD",
      },
    });

    await touchChat(chatId);

    // Build conversation history from messages BEFORE the original message
    const previousMessages = await prisma.message.findMany({
      where: {
        chatId,
        isDeleted: false,
        createdAt: { lt: originalMessage.createdAt },
      },
      orderBy: { createdAt: "asc" },
      include: {
        modelResponses: {
          where: { status: "COMPLETED" },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const conversationHistory: {
      role: "user" | "assistant" | "system";
      content: string | any[];
    }[] = [];
    for (const msg of previousMessages) {
      if (msg.role === "USER") {
        conversationHistory.push({ role: "user", content: msg.content });
      } else if (msg.role === "ASSISTANT" && msg.modelResponses[0]?.content) {
        conversationHistory.push({
          role: "assistant",
          content: msg.modelResponses[0].content,
        });
      }
    }
    // Add the new edited user message
    conversationHistory.push({ role: "user", content: content.trim() });

    // Prepend the persona (assistant prompt, or the platform default)
    let personaPromptEdit: string | null = null;
    if (chat.assistantId) {
      const chatAssistant = await prisma.assistant.findFirst({
        where: { id: chat.assistantId, isActive: true, isDeleted: false },
      });
      if (chatAssistant) personaPromptEdit = chatAssistant.systemPrompt;
    }

    const systemPromptEdit =
      personaPromptEdit ?? getDefaultSystemPrompt(chatType);
    if (systemPromptEdit) {
      conversationHistory.unshift(
        buildSystemMessage(systemPromptEdit, model.externalId),
      );
    }

    const userPreference = await prisma.userPreference.findUnique({
      where: { userId },
    });
    const enableFollowUpQuestions =
      userPreference?.enableFollowUpQuestions !== false;

    const tokenLimits = await checkTokenLimitsAndSetupStream(
      res,
      wallet,
      model,
      conversationHistory,
      chatId,
      assistantMessage.id,
      {
        userMessageId: newUserMessage.id,
        assistantMessageId: assistantMessage.id,
      },
      enableFollowUpQuestions,
    );
    if (tokenLimits === null) return;
    const { maxCompletionTokens, trimmedHistory } = tokenLimits;

    // Stream AI response
    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let imagesToUpload: string[] = [];
    let finishReason: string | null = null;

    try {
      const acc = await runOpenRouterStreamWithEmptyRetry({
        chatType,
        res,
        isClientAborted,
        streamOptions: { includeImages: true, includeAnnotations: false },
        createStream: () =>
          createOpenRouterStream({
            model: model.externalId,
            messages: trimmedHistory,
            chatType,
            max_tokens: maxCompletionTokens,
            signal: abortController.signal,
          }),
      });
      fullContent = acc.fullContent;
      promptTokens = acc.promptTokens;
      completionTokens = acc.completionTokens;
      imagesToUpload = acc.imagesToUpload;
      finishReason = acc.finishReason;
    } catch (aiError: any) {
      const partialAcc = getPartialAccumulatorFromError(aiError);
      if (partialAcc) {
        fullContent = partialAcc.fullContent || fullContent;
        promptTokens = partialAcc.promptTokens || promptTokens;
        completionTokens = partialAcc.completionTokens || completionTokens;
        if (partialAcc.imagesToUpload.length > 0) {
          imagesToUpload = partialAcc.imagesToUpload;
        }
        finishReason = partialAcc.finishReason || finishReason;
      }

      if (isClientAborted() || isAbortError(aiError)) {
        const stoppedContent =
          fullContent.trim() || "Generation stopped by user.";
        try {
          const tokenMultiplier = model.tokenMultiplier ?? 1.0;
          const billablePromptTokens = Math.ceil(
            (promptTokens || 0) * tokenMultiplier,
          );
          const billableCompletionTokens = Math.ceil(
            (completionTokens || 0) * tokenMultiplier,
          );

          await prisma.$transaction(async (tx: any) => {
            const walletRecord = await tx.userWallet.findUnique({
              where: { userId },
            });
            const availableTokens = walletRecord?.tokensRemaining || 0;

            const adjusted = calculateAdjustedTokens(
              availableTokens,
              billablePromptTokens,
              billableCompletionTokens,
              tokenMultiplier,
              promptTokens || 0,
              completionTokens || 0,
            );

            await tx.message.update({
              where: { id: assistantMessage.id },
              data: { content: stoppedContent },
            });

            await tx.modelResponse.create({
              data: {
                chatId,
                messageId: assistantMessage.id,
                modelId: model.id,
                content: stoppedContent,
                promptTokens: adjusted.finalRawPrompt,
                completionTokens: adjusted.finalRawCompletion,
                totalTokens: adjusted.finalRawTotal,
                status: "FAILED",
                finishReason: finishReason || "user_aborted",
                completedAt: new Date(),
              },
            });

            if (adjusted.finalBillableTotal > 0) {
              await tx.usageLog.create({
                data: {
                  userId,
                  modelId: model.id,
                  chatId,
                  messageId: assistantMessage.id,
                  capability: (chatType || "STANDARD") as any,
                  promptTokens: adjusted.finalRawPrompt,
                  completionTokens: adjusted.finalRawCompletion,
                  totalTokens: adjusted.finalRawTotal,
                  billablePromptTokens: adjusted.finalBillablePrompt,
                  billableCompletionTokens: adjusted.finalBillableCompletion,
                  billableTotalTokens: adjusted.finalBillableTotal,
                },
              });

              const updatedWallet = await tx.userWallet.update({
                where: { userId },
                data: {
                  tokensRemaining: {
                    decrement: adjusted.finalBillableTotal,
                  },
                  tokensUsed: { increment: adjusted.finalBillableTotal },
                },
              });

              await createWalletTransaction(tx, {
                userId,
                walletId: updatedWallet.id,
                amount: adjusted.finalBillableTotal,
                type: "DEBIT",
                referenceId: `chat_usage_${assistantMessage.id}_aborted`,
                meta: {
                  reason: "STREAM_ABORTED_BY_USER",
                  chatId,
                  messageId: assistantMessage.id,
                },
              });
            }
          });
        } catch {}
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      console.error("❌ OpenRouter Error in editAndResend:", aiError.message);
      try {
        await prisma.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: fullContent || "",
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            totalTokens: (promptTokens || 0) + (completionTokens || 0),
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
        await prisma.message.update({
          where: { id: assistantMessage.id },
          data: { content: fullContent || "" },
        });
      } catch (dbErr) {
        console.error("Failed to save partial AI response to DB", dbErr);
      }

      res.write(
        `data: ${JSON.stringify({ type: "error", message: aiError.message || "AI request failed" })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (chatType === "IMAGE_GENERATION" && !fullContent.trim()) {
      const failureMessage = EMPTY_IMAGE_RESPONSE_ERROR;
      await prisma.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: assistantMessage.id },
          data: { content: failureMessage },
        });
        await tx.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: failureMessage,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
      });
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (!fullContent.trim() && chatType !== "IMAGE_GENERATION") {
      const failureMessage = FAILED_GENERATION_USER_MESSAGE;
      await prisma.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: assistantMessage.id },
          data: { content: failureMessage },
        });
        await tx.modelResponse.create({
          data: {
            chatId,
            messageId: assistantMessage.id,
            modelId: model.id,
            content: failureMessage,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: "FAILED",
            finishReason,
            completedAt: new Date(),
          },
        });
      });
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // Upload images to Cloudinary
    if (imagesToUpload.length > 0) {
      for (const origUrl of imagesToUpload) {
        try {
          const result = await uploadToCloudinary(origUrl, {
            folder: "ai-colab-chat/generated",
            format: "webp",
            quality: "auto",
          });
          if (result && result.url) {
            fullContent = fullContent.split(origUrl).join(result.url);
          }
        } catch (imgError) {
          console.error("  ❌ Failed to upload image to Cloudinary:", imgError);
        }
      }
    }
    if (chatType === "IMAGE_GENERATION") {
      fullContent = keepOnlyFirstImageMarkdown(fullContent).trim();
    }

    const tokenMultiplier = model.tokenMultiplier ?? 1.0;
    const billablePromptTokens = Math.ceil(promptTokens * tokenMultiplier);
    const billableCompletionTokens = Math.ceil(
      completionTokens * tokenMultiplier,
    );

    let finalPrompt = promptTokens;
    let finalCompletion = completionTokens;
    let finalTotal = promptTokens + completionTokens;

    // Save response + deduct tokens
    await prisma.$transaction(async (tx: any) => {
      const walletRecord = await tx.userWallet.findUnique({
        where: { userId },
      });
      const availableTokens = walletRecord?.tokensRemaining || 0;

      const adjusted = calculateAdjustedTokens(
        availableTokens,
        billablePromptTokens,
        billableCompletionTokens,
        tokenMultiplier,
        promptTokens,
        completionTokens,
      );

      finalPrompt = adjusted.finalRawPrompt;
      finalCompletion = adjusted.finalRawCompletion;
      finalTotal = adjusted.finalRawTotal;

      await tx.message.update({
        where: { id: assistantMessage.id },
        data: { content: fullContent },
      });

      const mr = await tx.modelResponse.create({
        data: {
          chatId,
          messageId: assistantMessage.id,
          modelId: model.id,
          content: fullContent,
          promptTokens: adjusted.finalRawPrompt,
          completionTokens: adjusted.finalRawCompletion,
          totalTokens: adjusted.finalRawTotal,
          status: "COMPLETED",
          finishReason,
          completedAt: new Date(),
        },
      });

      if (mr) {
        (res as any).modelResponseId = mr.id;
      }

      if (adjusted.finalBillableTotal > 0) {
        await tx.usageLog.create({
          data: {
            userId,
            modelId: model.id,
            chatId,
            messageId: assistantMessage.id,
            capability: (chatType || "STANDARD") as any,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            billablePromptTokens: adjusted.finalBillablePrompt,
            billableCompletionTokens: adjusted.finalBillableCompletion,
            billableTotalTokens: adjusted.finalBillableTotal,
          },
        });

        const updatedWallet = await tx.userWallet.update({
          where: { userId },
          data: {
            tokensRemaining: { decrement: adjusted.finalBillableTotal },
            tokensUsed: { increment: adjusted.finalBillableTotal },
          },
        });

        await createWalletTransaction(tx, {
          userId,
          walletId: updatedWallet.id,
          amount: adjusted.finalBillableTotal,
          type: "DEBIT",
          referenceId: `chat_usage_${assistantMessage.id}`,
          meta: {
            reason: "EDIT_RESEND",
            chatId,
            messageId: assistantMessage.id,
          },
        });
      }
    });

    await maybeEnqueueDistillation(chatId, chat.folderId);

    res.write(
      `data: ${JSON.stringify({ type: "done", modelResponseId: (res as any).modelResponseId, promptTokens: finalPrompt, completionTokens: finalCompletion, totalTokens: finalTotal, finishReason })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Edit and resend error:", error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        status: false,
        message: error.message || "Internal server error",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}

// --- Multi-Model Edit Preparation ---
export async function prepareEditMulti(req: Request, res: Response) {
  const userId = req.user!.id;
  const chatId = Number(req.params.chatId);
  const messageId = Number(req.params.messageId);
  const { content, chatType } = req.body as {
    content: string;
    chatType?: string;
  };

  try {
    if (!content?.trim()) {
      res.status(400).json({ status: false, message: "Content is required" });
      return;
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });
    if (!chat) {
      res.status(404).json({ status: false, message: "Chat not found" });
      return;
    }

    const originalMessage = await prisma.message.findFirst({
      where: { id: messageId, chatId, isDeleted: false },
    });
    if (!originalMessage || originalMessage.role !== "USER") {
      res
        .status(404)
        .json({ status: false, message: "Original user message not found" });
      return;
    }

    // Check user tokens mapping
    const wallet = await prisma.userWallet.findUnique({ where: { userId } });
    if (!wallet || wallet.tokensRemaining <= 0) {
      res.status(400).json({ status: false, code: "INSUFFICIENT_BALANCE", message: "Token limit exceeded" });
      return;
    }

    const pairedAssistant = await prisma.message.findFirst({
      where: {
        chatId,
        role: "ASSISTANT",
        isDeleted: false,
        createdAt: { gt: originalMessage.createdAt },
      },
      orderBy: { createdAt: "asc" },
    });

    if (pairedAssistant) {
      await prisma.message.updateMany({
        where: {
          chatId,
          isDeleted: false,
          createdAt: { gt: pairedAssistant.createdAt },
        },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }

    const rootMessageId = originalMessage.editedFromId || originalMessage.id;

    // Create user message
    const newUserMessage = await prisma.message.create({
      data: {
        chatId,
        role: "USER",
        content: content.trim(),
        editedFromId: rootMessageId,
        chatType: chatType || "STANDARD",
      },
    });

    // Create empty assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        chatId,
        role: "ASSISTANT",
        content: "",
        chatType: chatType || "STANDARD",
      },
    });

    await touchChat(chatId);

    res.json({
      status: true,
      data: {
        userMessageId: newUserMessage.id,
        assistantMessageId: assistantMessage.id,
      },
    });
  } catch (error: any) {
    console.error("prepareEditMulti error:", error);
    res.status(500).json({
      status: false,
      message: error.message || "Internal server error",
    });
  }
}

export async function continueChatStream(req: Request, res: Response) {
  const userId = req.user!.id;
  const chatId = Number(req.params.chatId);
  const { messageId, modelId } = req.body as {
    messageId: number;
    modelId: number;
  };
  const abortController = new AbortController();
  const isClientAborted = setupClientAbortTracking(req, res, abortController);

  try {
    if (!messageId || !modelId) {
      res
        .status(400)
        .json({ status: false, message: "messageId and modelId required" });
      return;
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });
    if (!chat) {
      res.status(404).json({ status: false, message: "Chat not found" });
      return;
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId, isActive: true, isDeleted: false },
      include: { modelProvider: true },
    });
    if (!model) {
      res
        .status(404)
        .json({ status: false, message: "Model not found or inactive" });
      return;
    }

    const wallet = await prisma.userWallet.findUnique({ where: { userId } });
    if (!wallet || wallet.tokensRemaining <= 0) {
      res.status(400).json({ status: false, code: "INSUFFICIENT_BALANCE", message: "Token limit exceeded" });
      return;
    }

    const allMessages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: {
        modelResponses: {
          where: { status: "COMPLETED" },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        attachments: true,
      },
    });

    const targetIndex = allMessages.findIndex((m: any) => m.id === messageId);
    if (targetIndex === -1 || allMessages[targetIndex].role !== "ASSISTANT") {
      res
        .status(404)
        .json({ status: false, message: "Target assistant message not found" });
      return;
    }
    const assistantMessage = allMessages[targetIndex];
    const modelResponse = await prisma.modelResponse.findFirst({
      where: { messageId: assistantMessage.id, modelId, status: "COMPLETED" },
    });
    if (!modelResponse) {
      res
        .status(404)
        .json({ status: false, message: "Previous model response not found" });
      return;
    }

    // Assume the user message immediately preceding it is the context initiator
    let originalUserMessageIndex = targetIndex - 1;
    while (
      originalUserMessageIndex >= 0 &&
      allMessages[originalUserMessageIndex].role !== "USER"
    ) {
      originalUserMessageIndex--;
    }

    // We rebuild conversationHistory UP TO AND INCLUDING the original user message
    const previousMessages = allMessages.slice(0, originalUserMessageIndex + 1);

    let attachmentPlugins: any[] = [];

    const conversationHistory: {
      role: "user" | "assistant" | "system";
      content: any;
    }[] = [];

    // Filter out contexts similarly to checkTokenLimitsAndSetupStream
    // We'll skip some repetitive checks for brevity, but let's build standard text history
    for (let i = 0; i < previousMessages.length; i++) {
      const msg = previousMessages[i];
      if (msg.role === "USER") {
        if (msg.attachments && msg.attachments.length > 0) {
          const { contentParts, extraPlugins } =
            await buildAttachmentContentParts(
              msg.content,
              msg.attachments as any,
            );
          conversationHistory.push({ role: "user", content: contentParts });
          if (i === previousMessages.length - 1) {
            attachmentPlugins = extraPlugins;
          }
        } else {
          conversationHistory.push({ role: "user", content: msg.content });
        }
      } else if (msg.role === "ASSISTANT" && msg.modelResponses[0]?.content) {
        let assistantContent: string | any[] = msg.modelResponses[0].content;
        // Also support images in assistant responses for continuation context
        if (chat.capability === "IMAGE_GENERATION") {
          assistantContent = await detectAndConvertImages(assistantContent);
        }
        conversationHistory.push({
          role: "assistant",
          content: assistantContent,
        });
      }
    }

    // Add Persona (assistant prompt, or the platform default for normal chats)
    let personaPromptContinue: string | null = null;
    if (chat.assistantId) {
      const chatAssistant = await prisma.assistant.findFirst({
        where: { id: chat.assistantId, isActive: true, isDeleted: false },
      });
      if (chatAssistant) personaPromptContinue = chatAssistant.systemPrompt;
    }

    const systemPromptContinue =
      personaPromptContinue ?? getDefaultSystemPrompt(chat.capability);
    if (systemPromptContinue) {
      conversationHistory.unshift(
        buildSystemMessage(systemPromptContinue, model.externalId),
      );
    }

    // Now push the *partial* assistant message
    const lastContent = modelResponse.content || "";
    const isInCodeBlock = (lastContent.match(/```/g) || []).length % 2 !== 0;

    conversationHistory.push({ role: "assistant", content: lastContent });

    // Push the continue prompt with context-aware instruction
    const continueInstruction = isInCodeBlock
      ? "Continue the code block immediately. Do NOT start with triple backticks or the language name—you are already inside the block. Just resume the raw code character-by-character."
      : "Continue your response exactly where you left off. Do not repeat previous text and do not add any introductory framing. Just seamless continuation.";

    conversationHistory.push({ role: "user", content: continueInstruction });

    const tokenLimits = await checkTokenLimitsAndSetupStream(
      res,
      wallet,
      model,
      conversationHistory,
      chatId,
      assistantMessage.id,
      {
        assistantMessageId: assistantMessage.id,
        isContinue: true,
      },
      false, // typically disable follow up in continuous stream until it finishes
    );
    if (tokenLimits === null) return;
    const { maxCompletionTokens, trimmedHistory } = tokenLimits;

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: string | null = null;

    try {
      const acc = await runOpenRouterStreamWithEmptyRetry({
        chatType: "STANDARD",
        res,
        isClientAborted,
        streamOptions: { includeImages: false, includeAnnotations: false },
        createStream: () =>
          createOpenRouterStream({
            model: model.externalId,
            messages: trimmedHistory,
            chatType: "STANDARD",
            max_tokens: maxCompletionTokens,
            plugins:
              attachmentPlugins.length > 0 ? attachmentPlugins : undefined,
            signal: abortController.signal,
          }),
      });
      fullContent = acc.fullContent;
      promptTokens = acc.promptTokens;
      completionTokens = acc.completionTokens;
      finishReason = acc.finishReason;
    } catch (aiError: any) {
      const partialAcc = getPartialAccumulatorFromError(aiError);
      if (partialAcc) {
        fullContent = partialAcc.fullContent || fullContent;
        promptTokens = partialAcc.promptTokens || promptTokens;
        completionTokens = partialAcc.completionTokens || completionTokens;
        finishReason = partialAcc.finishReason || finishReason;
      }

      // Stream failed but we might have partial content
      if (fullContent.trim()) {
        try {
          await prisma.message.update({
            where: { id: assistantMessage.id },
            data: { content: assistantMessage.content + fullContent },
          });
          await prisma.modelResponse.update({
            where: { id: modelResponse.id },
            data: {
              content: modelResponse.content + fullContent,
              promptTokens: modelResponse.promptTokens + promptTokens,
              completionTokens:
                modelResponse.completionTokens + completionTokens,
              totalTokens:
                modelResponse.totalTokens + (promptTokens + completionTokens),
            },
          });
        } catch (e) {}
      }
      res.write(
        `data: ${JSON.stringify({ type: "error", message: aiError.message || "AI request failed" })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (!fullContent.trim() && completionTokens === 0) {
      const failureMessage = FAILED_GENERATION_USER_MESSAGE;
      res.write(
        `data: ${JSON.stringify({ type: "error", message: failureMessage })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const tokenMultiplier = model.tokenMultiplier ?? 1.0;
    const billablePromptTokens = Math.ceil(promptTokens * tokenMultiplier);
    const billableCompletionTokens = Math.ceil(
      completionTokens * tokenMultiplier,
    );

    // Update the message by combining old text + new text
    const newCombinedText = modelResponse.content + fullContent;

    await prisma.$transaction(async (tx: any) => {
      const adjusted = calculateAdjustedTokens(
        wallet.tokensRemaining,
        billablePromptTokens,
        billableCompletionTokens,
        tokenMultiplier,
        promptTokens,
        completionTokens,
      );

      await tx.message.update({
        where: { id: assistantMessage.id },
        data: { content: assistantMessage.content + fullContent },
      });

      await tx.modelResponse.update({
        where: { id: modelResponse.id },
        data: {
          content: newCombinedText,
          promptTokens: modelResponse.promptTokens + adjusted.finalRawPrompt,
          completionTokens:
            modelResponse.completionTokens + adjusted.finalRawCompletion,
          totalTokens: modelResponse.totalTokens + adjusted.finalRawTotal,
          finishReason,
        },
      });

      if (adjusted.finalBillableTotal > 0) {
        await tx.usageLog.create({
          data: {
            userId,
            modelId,
            chatId,
            messageId: assistantMessage.id,
            promptTokens: adjusted.finalRawPrompt,
            completionTokens: adjusted.finalRawCompletion,
            totalTokens: adjusted.finalRawTotal,
            billablePromptTokens: adjusted.finalBillablePrompt,
            billableCompletionTokens: adjusted.finalBillableCompletion,
            billableTotalTokens: adjusted.finalBillableTotal,
          },
        });
        const updatedWallet = await tx.userWallet.update({
          where: { userId },
          data: {
            tokensRemaining: { decrement: adjusted.finalBillableTotal },
            tokensUsed: { increment: adjusted.finalBillableTotal },
          },
        });
        await createWalletTransaction(tx, {
          userId,
          walletId: updatedWallet.id,
          amount: adjusted.finalBillableTotal,
          type: "DEBIT",
          referenceId: `chat_usage_${assistantMessage.id}_continue_${Date.now()}`,
          meta: {
            reason: "CONTINUE_RESPONSE",
            chatId,
            messageId: assistantMessage.id,
          },
        });
      }
    });

    await maybeEnqueueDistillation(chatId, chat.folderId);

    res.write(
      `data: ${JSON.stringify({ type: "done", promptTokens: 0, completionTokens, totalTokens: completionTokens, finishReason })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({
        status: false,
        message: error.message || "Internal server error",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}
