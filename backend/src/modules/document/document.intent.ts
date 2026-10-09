import Joi from "joi";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";
import { dlog, dlogBlock, dlogError } from "./document.logger.js";
import {
  DOCUMENT_FORMATS,
  DOCUMENT_FORMAT_META,
  type DocumentFormat,
} from "./document.types.js";

/**
 * Two-stage detection for "the user wants a document out of this".
 *
 *   Stage 1 — a free regex gate with high recall and deliberately poor
 *             precision. It has NO authority to trigger generation; it only
 *             decides whether stage 2 is worth paying for. ~95% of messages
 *             stop here at zero cost.
 *
 *   Stage 2 — a cheap model call that judges actual intent. This is what
 *             separates "make me a PDF of that" from "how do I generate a PDF
 *             in Node?" — a distinction no keyword list can draw, and the
 *             false positive that would most damage trust in the feature.
 *
 * Everything here fails open: any error, timeout or malformed reply resolves
 * to NONE and the chat proceeds untouched. An optional feature must never be
 * able to break the conversation.
 */

// Read per call, not captured at module load — see the note in
// document.spec.service.ts on why a const here would be a trap.
const getIntentModel = () =>
  process.env.DOCUMENT_INTENT_MODEL ?? "google/gemini-2.5-flash";
// Generous on purpose. Classification runs AFTER the answer has streamed, so
// the user is not waiting on it — but a tight timeout makes the feature fail
// intermittently, which reads as "sometimes it just doesn't work". Observed
// Flash latency spans ~0.5-4s, so 4s produced random false negatives.
const INTENT_TIMEOUT_MS = Number(
  process.env.DOCUMENT_INTENT_TIMEOUT_MS ?? 15000,
);
const LAST_ANSWER_CHARS = 600;

export type DocumentIntentMode = "REPLACE" | "AUGMENT" | "NONE";

export interface DocumentIntent {
  intent: DocumentIntentMode;
  /** The format the user ASKED for — not necessarily one we can render yet. */
  format: DocumentFormat;
  title: string;
  useLastAnswer: boolean;
  confidence: number;
  requiresCurrentData: boolean;
}

const NONE: DocumentIntent = {
  intent: "NONE",
  format: "PDF",
  title: "",
  useLastAnswer: false,
  confidence: 0,
  requiresCurrentData: false,
};

/* ------------------------------------------------------------------ *
 * Stage 1 — regex gate
 * ------------------------------------------------------------------ */

// Bare "word", "deck" and "sheet" are included even though they are common
// English words. The gate is deliberately high-recall and low-precision — it
// only decides whether stage 2 is worth paying for, and a missed phrasing
// ("convert this to word") fails *silently*, producing no document and no
// explanation, which is far worse than an occasional wasted classifier call.
const FORMAT_NOUN =
  /\b(pdf|document|doc|docx|word|report|write[- ]?up|summary sheet|excel|spreadsheet|xlsx|sheet|csv|ppt|pptx|powerpoint|presentation|slide deck|slides|deck)\b/i;

const PRODUCTION_VERB =
  /\b(generate|create|make|build|produce|export|prepare|draft|compile|give me|send me|download|save (?:it |this |that )?as|convert (?:it |this |that )?(?:in)?to|turn (?:it|this|that) into|put (?:it|this|that) in(?:to)?|banao|bana do|bana do)\b/i;

/** "as a pdf", "in word format", "into a deck" — verb-free but unambiguous. */
const REFERENTIAL_FORM =
  /\b(?:as|in|into|to)\s+(?:an?\s+)?(?:pdf|document|report|word|docx|excel|spreadsheet|xlsx|csv|ppt|pptx|powerpoint|presentation|slide deck|slides|deck)\b|\b(?:pdf|word|docx|excel|xlsx|csv|ppt|pptx)\s+format\b/i;

/**
 * "same data", "above content", "that information" — an unambiguous back
 * reference to material that already exists in the conversation. Checked as a
 * deterministic override rather than left entirely to the classifier: this
 * phrasing is common in exactly the "now also make it a docx" follow-up that
 * chains off a prior document turn, and a classifier miss here is worse than
 * for other fields — it makes the answering model believe there is no
 * existing material, so it invents new content instead of reusing the real
 * data (observed failure: "make a docx of the same data" produced a
 * hallucinated document ABOUT the request instead of the actual content).
 */
const REFERS_TO_EXISTING_DATA =
  /\b(?:same|above|that|this|previous|earlier|prior)\s+(?:data|content|information|info|material|text|details)\b/i;

// Intent lives in the instruction, which sits at the very start ("generate a
// pdf of the following: <10k of pasted data>") or occasionally at the very end
// ("...turn that into a report"). Scanning only those windows keeps the regex
// cheap on huge messages WITHOUT rejecting them — an earlier length cap here
// silently killed the most common real case, pasting content to convert.
const HEAD_SCAN_CHARS = 800;
const TAIL_SCAN_CHARS = 400;

const scanWindow = (message: string): string => {
  if (message.length <= HEAD_SCAN_CHARS + TAIL_SCAN_CHARS) return message;
  return `${message.slice(0, HEAD_SCAN_CHARS)}\n${message.slice(-TAIL_SCAN_CHARS)}`;
};

export const passesDocumentGate = (message: string): boolean => {
  if (!message) return false;
  const window = scanWindow(message);
  if (!FORMAT_NOUN.test(window)) return false;
  return PRODUCTION_VERB.test(window) || REFERENTIAL_FORM.test(window);
};

/* ------------------------------------------------------------------ *
 * Stage 2 — intent classifier
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You decide whether a chat message is asking the assistant to PRODUCE a downloadable document file.

Reply with ONLY this JSON object:
{
  "intent": "REPLACE" | "AUGMENT" | "NONE",
  "format": ${DOCUMENT_FORMATS.map((f) => `"${f}"`).join(" | ")},
  "title": string,               // short document title, "" when intent is NONE
  "useLastAnswer": boolean,      // true if the document should be built from the previous assistant answer
  "confidence": number,          // 0.0 - 1.0
  "requiresCurrentData": boolean // see below — "" / false when intent is NONE
}

Choosing "format" — report what the user ASKED FOR, never what you think is best:
- "PDF"  — "pdf", or any request for a document/report/write-up with no format named. This is the default.
- "DOCX" — "word", "word file", "doc file", "docx", "editable document".
- "PPTX" — "ppt", "powerpoint", "pptx", "presentation", "slide deck", "slides".
- "XLSX" — "excel", "spreadsheet", "xlsx", "sheet".
- "CSV"  — "csv", "comma separated", "comma-separated values". Do NOT use XLSX for these — they are different files.
When no format is named at all, answer "PDF".

Choosing "requiresCurrentData" — set true when accurately answering the request needs facts that are current, recent, or change over time, which you cannot verify with certainty: this month's or this year's statistics, best-sellers or rankings "right now", live prices, sports scores, ongoing events, recent news. Set false for facts that are stable regardless of when they are answered (how something works, historical events, established concepts). This is judged independently of intent and format.

Meaning of each intent:
- "REPLACE": the message ONLY asks for a file. Nothing else is being asked.
    "make me a PDF about X", "export that as a PDF", "put that in a document"
- "AUGMENT": the message asks a real question AND asks for a file.
    "explain microservices and give me a PDF", "compare these and send a report"
- "NONE": no file is being requested. This includes questions ABOUT documents,
    file formats, or how to build them in code.
    "how do I generate a PDF in Node?", "what is a PDF?", "why is my pdf library failing",
    "read this PDF and explain it", "summarise the attached document"

Critical distinctions:
- Asking the assistant to READ, SUMMARISE or EXPLAIN an existing document is NONE. Only asking it to CREATE a new file counts.
- A programming question that mentions PDFs is always NONE.
- "useLastAnswer" is true when the message refers to earlier content ("that", "this", "the above", "your answer") rather than naming a fresh topic.
- Be conservative. When genuinely unsure, answer NONE with low confidence.`;

const intentSchema = Joi.object({
  intent: Joi.string().valid("REPLACE", "AUGMENT", "NONE").required(),
  // Defaulted rather than required: an older/weaker model that omits the field
  // should still produce a working PDF instead of failing the whole turn.
  format: Joi.string()
    .valid(...DOCUMENT_FORMATS)
    .default("PDF"),
  title: Joi.string().allow("").max(200).default(""),
  useLastAnswer: Joi.boolean().default(false),
  confidence: Joi.number().min(0).max(1).default(0.5),
  requiresCurrentData: Joi.boolean().default(false),
});

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("intent classification timed out")), ms),
    ),
  ]);

/**
 * Resolves what (if anything) the user wants generated.
 * Always resolves — never rejects.
 */
export const detectDocumentIntent = async (
  message: string,
  lastAssistantAnswer?: string | null,
): Promise<DocumentIntent> => {
  const gated = passesDocumentGate(message);
  dlog(
    "intent:gate",
    `${gated ? "PASS" : "STOP"} — "${message.slice(0, 120)}"${gated ? " → calling classifier" : " (no model call, free)"}`,
  );
  if (!gated) return NONE;

  // The classifier judges intent, not content — sending a 10k-char paste would
  // cost tokens and latency for nothing, so it sees the same head/tail window
  // the gate used.
  const messageForClassifier =
    message.length > HEAD_SCAN_CHARS + TAIL_SCAN_CHARS
      ? `${message.slice(0, HEAD_SCAN_CHARS)}\n…[${message.length - HEAD_SCAN_CHARS - TAIL_SCAN_CHARS} chars of pasted content omitted]…\n${message.slice(-TAIL_SCAN_CHARS)}`
      : message;

  const userContent = [
    `Message: ${messageForClassifier}`,
    lastAssistantAnswer
      ? `\nPrevious assistant answer (for resolving "that"/"this"):\n${lastAssistantAnswer.slice(0, LAST_ANSWER_CHARS)}`
      : `\n(No previous assistant answer in this conversation.)`,
  ].join("\n");

  const model = getIntentModel();
  const started = Date.now();

  try {
    dlogBlock("intent:request", `model=${model} → OpenRouter`, {
      model,
      temperature: 0,
      max_tokens: 200,
      systemPrompt: `${SYSTEM_PROMPT.slice(0, 200)}… [${SYSTEM_PROMPT.length} chars]`,
      userContent,
    });

    const completion = await withTimeout(
      createOpenRouterJsonCompletion({
        model,
        systemPrompt: SYSTEM_PROMPT,
        userContent,
        max_tokens: 200,
        temperature: 0,
      }),
      INTENT_TIMEOUT_MS,
    );

    const raw = completion?.choices?.[0]?.message?.content;
    dlogBlock("intent:response", `raw reply in ${Date.now() - started}ms`, {
      finishReason: completion?.choices?.[0]?.finish_reason,
      usage: completion?.usage,
      content: raw,
    });

    if (!raw) {
      dlog("intent:result", "NONE — empty content from model");
      return NONE;
    }

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      dlog("intent:result", "NONE — no JSON object found in reply");
      return NONE;
    }

    const { error, value } = intentSchema.validate(
      JSON.parse(raw.slice(start, end + 1)),
      { stripUnknown: true },
    );
    if (error) {
      dlogError("intent:result", "NONE — schema rejected reply", error);
      return NONE;
    }

    const intent = value as DocumentIntent;

    if (!intent.useLastAnswer && REFERS_TO_EXISTING_DATA.test(message)) {
      dlog(
        "intent:result",
        `overriding useLastAnswer → true — message references existing data the classifier missed`,
      );
      intent.useLastAnswer = true;
    }

    dlogBlock("intent:result", `decided ${intent.intent}`, intent);
    return intent;
  } catch (error: any) {
    // Message only — a full stack per message would flood the chat logs, and
    // the outcome is always the same: fall through to a normal chat turn.
    console.error(
      `[document-intent] classification failed, treating as NONE: ${error?.message ?? error}`,
    );
    return NONE;
  }
};

/* ------------------------------------------------------------------ *
 * Stage 3 — telling the answering model what is about to happen
 * ------------------------------------------------------------------ */

/**
 * Builds the system note injected before the answer streams.
 *
 * Without this the answering model has no idea the platform can produce
 * files, so it refuses ("I can generate a PDF, but I need the full text
 * first") while the pipeline silently renders the document anyway — the
 * reply and the download card end up contradicting each other.
 *
 * The instructions differ per intent because the *source* of the document
 * differs: for `useLastAnswer` the material already exists and repeating it
 * wastes tokens, whereas otherwise the answer being written IS the material.
 */
export const buildDocumentSystemNote = (
  intent: DocumentIntent,
  opts: {
    sourceAlreadyExists: boolean;
    /** The format actually being rendered — differs when we can't do the ask. */
    effectiveFormat: DocumentFormat;
  },
): string => {
  const named = intent.title ? `titled "${intent.title}" ` : "";
  const effectiveLabel = DOCUMENT_FORMAT_META[opts.effectiveFormat].label;
  const lines = [
    `A downloadable ${effectiveLabel} ${named}is being generated from this turn and will appear as a download card directly beneath your reply. This is a real capability of this platform, not a hypothetical one.`,
    "Never tell the user you cannot create files, and never ask them to paste their content again or upload it elsewhere — the document pipeline already has the full, untruncated message.",
    `Do not describe the ${effectiveLabel}, its layout, fonts or formatting, and do not offer to generate it — it is already being generated.`,
  ];

  // Substitution must be disclosed. Handing over a PDF while the user believes
  // they asked for a spreadsheet is the failure mode this whole seam exists to
  // prevent, and only the reply can tell them.
  if (opts.effectiveFormat !== intent.format) {
    const requestedLabel = DOCUMENT_FORMAT_META[intent.format].label;
    lines.push(
      `IMPORTANT: the user asked for a ${requestedLabel}, which this platform cannot generate yet. A ${effectiveLabel} is being produced instead. State this plainly in one sentence — do not pretend the ${requestedLabel} was created, and do not apologise at length.`,
    );
  }

  if (!opts.sourceAlreadyExists && intent.requiresCurrentData) {
    const isSpreadsheet =
      opts.effectiveFormat === "XLSX" || opts.effectiveFormat === "CSV";
    lines.push(
      "This topic depends on current, recent or time-sensitive facts you cannot verify with certainty (up-to-date figures, rankings, prices, or ongoing events). Do not state specific numbers, rankings or statistics as verified fact unless you are certain they are current and correct — say plainly that a figure is an estimate, or that you do not have verified current data for it, rather than presenting an invented number with false confidence." +
        (isSpreadsheet
          ? " This matters more than usual here: your answer becomes spreadsheet cells with real number formatting and totals, which makes an uncertain figure look authoritative. Prefer a clearly-labelled estimate — or omitting the number — over a precise-looking invented one."
          : ""),
    );
  }

  if (!opts.sourceAlreadyExists) {
    // The answer IS the document. Write it out in full.
    lines.push(
      "The document is built from the answer you are about to write, so write the full content the user asked for as normal prose — that text becomes the document.",
    );
  } else if (intent.intent === "REPLACE") {
    // The material already exists (the user pasted it, or it is the previous
    // answer) AND nothing else was asked. Restating it here would bill the
    // user twice for the same content — once to stream it, once to render it.
    lines.push(
      "The document is built from material that ALREADY EXISTS — the user's own pasted text, or your previous answer. The pipeline has it in full. Restating it would bill the user twice for the same content, once to stream it and once to render it.",
      "Reply with a single short sentence confirming the document is being prepared, and nothing else. Do not summarise, restructure, preview or comment on the material.",
    );
  } else {
    // AUGMENT: a real question was asked alongside the file request, so the
    // answer still has to happen — it just must not parrot the source back.
    lines.push(
      "The document is built from material that already exists (the user's pasted text or your previous answer), so do not reproduce that material in your reply. Answer only the additional question the user actually asked.",
    );
  }

  return lines.join("\n");
};
