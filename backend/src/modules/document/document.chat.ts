import prisma from "@root/prisma.js";
import {
  buildDocumentSystemNote,
  detectDocumentIntent,
  type DocumentIntent,
} from "./document.intent.js";
import { runPendingDocumentJobs } from "./document.generation.service.js";
import { dlog, dlogBlock, dlogError } from "./document.logger.js";
import { resolveRenderableFormat } from "./document.renderers.js";
import {
  MAX_SOURCE_TEXT_CHARS,
  MAX_TITLE_CHARS,
  type DocumentFormat,
} from "./document.types.js";

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
 * Never throws — a failure here must leave the chat turn completely unchanged.
 */
export async function prepareDocumentTurn(params: {
  chatId: number;
  userPrompt: string;
  lastAssistantAnswer?: string | null;
}): Promise<{
  intent: DocumentIntent;
  /** What will actually be rendered — may differ from `intent.format`. */
  effectiveFormat: DocumentFormat;
  systemNote: string;
} | null> {
  try {
    const intent = await detectDocumentIntent(
      params.userPrompt,
      params.lastAssistantAnswer,
    );
    if (intent.intent === "NONE") return null;

    // Length is the same signal the enqueue uses, so the note and the source
    // selection always agree about where the document's content comes from.
    const sourceAlreadyExists =
      intent.useLastAnswer || usesPastedSource(params.userPrompt);

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
 * most requests the answer itself is the document's source material — "turn
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
      `turn complete chat=${chatId} message=${messageId} response=${modelResponseId ?? "-"} — checking document intent`,
    );

    if (params.intent === null) {
      dlog("chat:hook", "pre-stream pass found no document intent — skipping");
      return null;
    }

    const intent =
      params.intent ??
      (await detectDocumentIntent(userPrompt, assistantAnswer));
    if (intent.intent === "NONE") {
      dlog("chat:hook", "no document requested — chat turn ends normally");
      return null;
    }
    if (params.intent) {
      dlog(
        "chat:hook",
        `reusing pre-stream intent ${intent.intent} — no second classifier call`,
      );
    }

    // Guard against a duplicate document for the same model response — the
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
          `skipped — document ${existing.id} already exists for response ${modelResponseId}`,
        );
        return null;
      }
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
    //     document must come from the PREVIOUS answer — the current turn may
    //     be nothing more than "Sure, generating that now!".
    //  3. Otherwise the answer just produced is the richest material.
    let sourceText = assistantAnswer?.trim() || "";
    let sourceKind = "current-answer";

    if (usesPastedSource(userPrompt)) {
      sourceText = userPrompt;
      sourceKind = "user-pasted";
    } else if (intent.useLastAnswer) {
      // A prior document-generation turn deliberately leaves a content-free
      // chat reply ("Your PDF is being prepared.") — see the REPLACE branch of
      // buildDocumentSystemNote — so the real material for "now make a docx of
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
        theme: params.theme ?? "professional",
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
      theme: params.theme ?? "professional",
      promptChars: userPrompt.length,
      sourceTextChars: sourceText.length,
    });

    // Kick the worker rather than waiting for the cron tick — the user is
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
