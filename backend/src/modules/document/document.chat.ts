import prisma from "@root/prisma.js";
import {
  buildDocumentSystemNote,
  detectDocumentIntent,
  type ActiveDocument,
  type DocumentIntent,
} from "./document.intent.js";
import { runPendingDocumentJobs } from "./document.generation.service.js";
import { dlog, dlogBlock, dlogError } from "./document.logger.js";
import { resolveRenderableFormat } from "./document.renderers.js";
import {
  DOCUMENT_FORMATS,
  DOCUMENT_THEMES,
  MAX_SOURCE_TEXT_CHARS,
  MAX_TITLE_CHARS,
  MINDMAP_THEMES,
  PPTX_TEMPLATES,
  defaultThemeFor,
  type DocumentFormat,
} from "./document.types.js";

/**
 * Format + template the user picked explicitly (Documents studio). Both come
 * from a request body, so they are validated here rather than trusted.
 */
export interface RequestedDocumentOptions {
  format: DocumentFormat;
  theme?: string;
}

export function parseRequestedDocumentOptions(
  format: unknown,
  theme: unknown,
): RequestedDocumentOptions | null {
  if (typeof format !== "string") return null;
  const upper = format.toUpperCase() as DocumentFormat;
  if (!DOCUMENT_FORMATS.includes(upper)) return null;
  // `theme` names a PPTX template for decks and a document theme for the
  // rest an unknown or mismatched value is dropped, never passed on.
  const allowed: readonly string[] =
    upper === "PPTX"
      ? PPTX_TEMPLATES
      : upper === "MINDMAP"
        ? MINDMAP_THEMES
        : DOCUMENT_THEMES;
  return {
    format: upper,
    theme: typeof theme === "string" && allowed.includes(theme) ? theme : undefined,
  };
}

/**
 * The latest finished document in this chat, i.e. what a follow-up like "add
 * more use cases" would be editing.
 *
 * Only COMPLETED rows count: one still generating has no spec to revise, so a
 * follow-up sent mid-generation falls back to a normal chat turn rather than
 * queueing a revision of nothing. When several documents exist the newest wins,
 * which also makes consecutive edits cumulative (each builds on the last).
 */
async function findActiveDocument(chatId: number): Promise<ActiveDocument | null> {
  const row = await prisma.generatedDocument.findFirst({
    where: { chatId, isDeleted: false, status: "COMPLETED" },
    orderBy: { id: "desc" },
    select: { id: true, format: true, title: true, theme: true },
  });
  return row
    ? {
        id: row.id,
        format: row.format as DocumentFormat,
        title: row.title,
        theme: row.theme,
      }
    : null;
}

// Above this, a user message is carrying pasted material rather than just an
// instruction, and should be treated as the document's source.
const PASTED_CONTENT_MIN_CHARS = 500;

/**
 * Whether the user's own message is the document's source material.
 *
 * Shared by the pre-stream note and the post-stream enqueue on purpose: the
 * note tells the model to skip writing an answer precisely when the enqueue is
 * going to ignore that answer anyway. If these two ever disagreed, the user
 * would get a one-line reply and a PDF built from that one line.
 */
export const usesPastedSource = (userPrompt: string): boolean =>
  userPrompt.length > PASTED_CONTENT_MIN_CHARS;

/**
 * Classifies the turn BEFORE the answer streams, so the answering model can be
 * told a document is coming.
 *
 * The classifier is only reached when the free regex gate passes (~5% of
 * turns), so the added pre-answer latency is not paid on ordinary messages.
 * The resolved intent is handed back to `maybeGenerateDocumentFromChat` after
 * the stream so the turn never pays for classification twice.
 *
 * Never throws a failure here must leave the chat turn completely unchanged.
 */
export async function prepareDocumentTurn(params: {
  chatId: number;
  userPrompt: string;
  lastAssistantAnswer?: string | null;
  requested?: RequestedDocumentOptions | null;
  attachmentText?: string;
}): Promise<{
  intent: DocumentIntent;
  /** What will actually be rendered may differ from `intent.format`. */
  effectiveFormat: DocumentFormat;
  systemNote: string;
} | null> {
  try {
    // An explicit format pick means "make a new one", so it never edits.
    const activeDocument = params.requested
      ? null
      : await findActiveDocument(params.chatId);

    let intent = await detectDocumentIntent(
      params.userPrompt,
      params.lastAssistantAnswer,
      activeDocument,
    );
    if (params.requested) {
      // An explicit pick always yields a document, even when the wording of the
      // message alone would not have tripped the classifier.
      intent =
        intent.intent === "NONE"
          ? {
              intent: "REPLACE",
              format: params.requested.format,
              title: "",
              useLastAnswer: false,
              confidence: 1,
              requiresCurrentData: false,
            }
          : { ...intent, format: params.requested.format };
    }
    if (intent.intent === "NONE") return null;

    // Length is the same signal the enqueue uses, so the note and the source
    // selection always agree about where the document's content comes from.
    // An UPDATE's material is the existing document, which always exists.
    const sourceAlreadyExists =
      intent.intent === "UPDATE" ||
      intent.useLastAnswer ||
      usesPastedSource(params.userPrompt) ||
      Boolean(params.attachmentText?.trim());

    const { format: effectiveFormat, substituted } = resolveRenderableFormat(
      intent.format,
    );

    const systemNote = buildDocumentSystemNote(intent, {
      sourceAlreadyExists,
      effectiveFormat,
    });
    dlogBlock(
      "chat:prepare",
      `chat=${params.chatId} pre-stream intent ${intent.intent}`,
      {
        intent,
        requestedFormat: intent.format,
        effectiveFormat,
        substituted,
        sourceAlreadyExists,
        systemNote,
      },
    );
    return { intent, effectiveFormat, systemNote };
  } catch (error) {
    dlogError("chat:prepare", "pre-stream intent detection failed", error);
    return null;
  }
}

/**
 * Bridges a finished chat turn into the document pipeline.
 *
 * The enqueue still runs AFTER the assistant answer is complete, because for
 * most requests the answer itself is the document's source material "turn
 * that into a PDF" has nothing to work from until the answer exists. Only the
 * *decision* moved earlier, into `prepareDocumentTurn`.
 *
 * Mirrors `maybeEnqueueDistillation`: never throws, so a failure here cannot
 * break the chat response it is attached to.
 */
export async function maybeGenerateDocumentFromChat(params: {
  userId: number;
  chatId: number;
  messageId: number;
  modelResponseId?: number | null;
  userPrompt: string;
  assistantAnswer: string;
  /**
   * Text extracted from files attached to this turn. When present it IS the
   * document's source: a user who attaches a PDF and asks for a mind map of it
   * means the PDF, not the chat answer about it.
   */
  attachmentText?: string;
  theme?: string;
  /**
   * Intent already resolved by `prepareDocumentTurn` before the stream.
   * `null` means the pre-pass ran and found nothing; `undefined` means no
   * pre-pass happened and we still have to classify here.
   */
  intent?: DocumentIntent | null;
  /**
   * Renderable format resolved by `prepareDocumentTurn`. Omitted only when no
   * pre-pass ran, in which case it is resolved here from the intent.
   */
  effectiveFormat?: DocumentFormat;
}): Promise<{ documentId: number; title: string; format: DocumentFormat } | null> {
  const {
    userId,
    chatId,
    messageId,
    modelResponseId,
    userPrompt,
    assistantAnswer,
  } = params;

  try {
    dlog(
      "chat:hook",
      `turn complete chat=${chatId} message=${messageId} response=${modelResponseId ?? "-"} checking document intent`,
    );

    if (params.intent === null) {
      dlog("chat:hook", "pre-stream pass found no document intent skipping");
      return null;
    }

    const intent =
      params.intent ??
      (await detectDocumentIntent(userPrompt, assistantAnswer));
    if (intent.intent === "NONE") {
      dlog("chat:hook", "no document requested chat turn ends normally");
      return null;
    }
    if (params.intent) {
      dlog(
        "chat:hook",
        `reusing pre-stream intent ${intent.intent} no second classifier call`,
      );
    }

    // Guard against a duplicate document for the same model response the
    // regenerate/edit paths can re-run over an assistant turn that already
    // produced one.
    if (modelResponseId) {
      const existing = await prisma.generatedDocument.findFirst({
        where: { modelResponseId, isDeleted: false },
        select: { id: true },
      });
      if (existing) {
        dlog(
          "chat:hook",
          `skipped document ${existing.id} already exists for response ${modelResponseId}`,
        );
        return null;
      }
    }

    // A revision of the chat's current document: same format and theme, the
    // worker revises its stored spec instead of generating from scratch. Done
    // before the source-selection logic below, which is for NEW documents.
    if (intent.intent === "UPDATE") {
      const base = await findActiveDocument(chatId);
      if (!base) {
        dlog("chat:hook", "UPDATE intent but no completed document to revise skipping");
        return null;
      }

      const revision = await prisma.generatedDocument.create({
        data: {
          userId,
          chatId,
          messageId,
          modelResponseId: modelResponseId ?? null,
          baseDocumentId: base.id,
          format: base.format,
          status: "PENDING",
          title: base.title,
          prompt: userPrompt.slice(0, 4000),
          sourceText: null,
          theme: base.theme,
        },
        select: { id: true, title: true, format: true },
      });

      dlogBlock("chat:enqueue", `revision ${revision.id} queued (of document ${base.id})`, {
        documentId: revision.id,
        baseDocumentId: base.id,
        format: base.format,
        theme: base.theme,
        chatId,
        messageId,
        modelResponseId: modelResponseId ?? null,
        promptChars: userPrompt.length,
      });

      void runPendingDocumentJobs();

      return {
        documentId: revision.id,
        title: revision.title,
        format: revision.format as DocumentFormat,
      };
    }

    const effectiveFormat =
      params.effectiveFormat ?? resolveRenderableFormat(intent.format).format;

    const title = (intent.title || userPrompt).slice(0, MAX_TITLE_CHARS);

    // Picking the right source material is what decides whether the PDF holds
    // real content or a one-line acknowledgement.
    //
    //  1. The user pasted the content themselves ("generate a pdf of the
    //     following data: …"). Their message IS the material.
    //  2. The user referred back ("make a pdf of the above summary"). The
    //     document must come from the PREVIOUS answer the current turn may
    //     be nothing more than "Sure, generating that now!".
    //  3. Otherwise the answer just produced is the richest material.
    let sourceText = assistantAnswer?.trim() || "";
    let sourceKind = "current-answer";

    const attachmentText = params.attachmentText?.trim() ?? "";

    if (attachmentText) {
      // Attached files first. Anything the user also pasted goes after them,
      // so a long attachment cannot crowd the pasted instructions out of the
      // character cap below.
      sourceText = usesPastedSource(userPrompt)
        ? `${userPrompt}

${attachmentText}`
        : attachmentText;
      sourceKind = "attached-files";
    } else if (usesPastedSource(userPrompt)) {
      sourceText = userPrompt;
      sourceKind = "user-pasted";
    } else if (intent.useLastAnswer) {
      // A prior document-generation turn deliberately leaves a content-free
      // chat reply ("Your PDF is being prepared.") see the REPLACE branch of
      // buildDocumentSystemNote so the real material for "now make a docx of
      // the same data" lives in that document's own stored `sourceText`, not
      // in the chat message. Check that FIRST, or a same-format-again request
      // silently downgrades to a near-empty source.
      const previousDocument = await prisma.generatedDocument.findFirst({
        where: { chatId, isDeleted: false },
        orderBy: { id: "desc" },
        select: { id: true, sourceText: true },
      });

      if (
        previousDocument?.sourceText &&
        previousDocument.sourceText.length > sourceText.length
      ) {
        sourceText = previousDocument.sourceText;
        sourceKind = `previous-document-source(document=${previousDocument.id})`;
      } else {
        const previous = await prisma.message.findFirst({
          where: {
            chatId,
            role: "ASSISTANT",
            isDeleted: false,
            id: { lt: messageId },
            content: { not: "" },
          },
          orderBy: { id: "desc" },
          select: { id: true, content: true },
        });

        // Only switch if the earlier answer actually carries more than the one
        // we just streamed, so a bad classifier call cannot downgrade the source.
        if (previous?.content && previous.content.length > sourceText.length) {
          sourceText = previous.content;
          sourceKind = `previous-answer(message=${previous.id})`;
        }
      }
    }

    sourceText = sourceText.slice(0, MAX_SOURCE_TEXT_CHARS);
    dlog(
      "chat:source",
      `using ${sourceKind} as document source (${sourceText.length} chars)`,
    );

    const document = await prisma.generatedDocument.create({
      data: {
        userId,
        chatId,
        messageId,
        modelResponseId: modelResponseId ?? null,
        // The renderable format, not the requested one. When these differ the
        // substitution has already been disclosed in the reply by the system
        // note, so the row records what the file on disk actually is.
        format: effectiveFormat,
        status: "PENDING",
        title,
        prompt: userPrompt.slice(0, 4000),
        sourceText: sourceText || null,
        theme: params.theme ?? defaultThemeFor(effectiveFormat),
      },
      select: { id: true, title: true, format: true },
    });

    dlogBlock("chat:enqueue", `document ${document.id} queued`, {
      documentId: document.id,
      intent: intent.intent,
      confidence: intent.confidence,
      requestedFormat: intent.format,
      effectiveFormat,
      title,
      chatId,
      messageId,
      modelResponseId: modelResponseId ?? null,
      theme: params.theme ?? defaultThemeFor(effectiveFormat),
      promptChars: userPrompt.length,
      sourceTextChars: sourceText.length,
    });

    // Kick the worker rather than waiting for the cron tick the user is
    // watching a card in the chat.
    void runPendingDocumentJobs();

    return {
      documentId: document.id,
      title: document.title,
      format: document.format as DocumentFormat,
    };
  } catch (error) {
    dlogError("chat:hook", "failed to enqueue document", error);
    return null;
  }
}
