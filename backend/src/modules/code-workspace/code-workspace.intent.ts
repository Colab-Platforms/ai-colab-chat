import Joi from "joi";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";
import {
  CODE_ASSISTANT_SLUG,
  CODE_FRAMEWORKS,
  MAX_TITLE_CHARS,
  type CodeFramework,
  type CodeIntent,
} from "./code-workspace.types.js";

/**
 * Decides whether a chat turn is a code-workspace turn.
 *
 *   0. Hard gate — only the Software Engineer assistant. Everything else is
 *      NONE, even if a client sends chatType "CODE" directly.
 *   1. Forced — the "Code" pill. Still classified, but only to pick NEW vs
 *      EDIT and a title; it can never come back NONE.
 *   2. Free regex gate — for chats without a project, skip the classifier
 *      unless the prompt looks like "build/create … app/site/component…".
 *   3. Cheap classifier (same model as document intent) → NEW/EDIT/ASK/NONE.
 *
 * Never throws: any failure falls back to a normal chat turn (or, when
 * forced, to NEW/EDIT with a title derived from the prompt).
 */

const getIntentModel = () =>
  process.env.CODE_INTENT_MODEL ?? process.env.DOCUMENT_INTENT_MODEL ?? "google/gemini-2.5-flash";
const INTENT_TIMEOUT_MS = Number(process.env.CODE_INTENT_TIMEOUT_MS ?? 8000);

const NONE: CodeIntent = { intent: "NONE", title: "", framework: "react" };

const BUILD_VERB =
  /\b(build|create|make|generate|scaffold|develop|code|implement|design|write|set ?up|bootstrap|clone|want|need|banao|bana ?do|bana ?de|banado|likho|chahiye)\b/i;
const BUILD_TARGET =
  /\b(app|apps|application|website|web ?site|site|landing ?page|web ?page|portfolio|dashboard|component|components|project|game|clone|ui|frontend|front-end|backend|back-end|api|rest api|server|todo|to-do|calculator|form|navbar|blog|e-?commerce|store|shop|chat ?bot|extension|cli|widget|admin panel|crud|react|reactjs|react\.js|vue|vuejs|next\.?js|express|node\.?js|html|tailwind|flask|django|fastapi)\b/i;

export const passesCodeGate = (message: string): boolean => {
  const head = message.slice(0, 1000);
  return BUILD_VERB.test(head) && BUILD_TARGET.test(head);
};

const SYSTEM_PROMPT = `You route messages for a coding assistant that has a live code workspace (a file tree + editor where it can write whole multi-file projects).

Classify the user's message. Reply with JSON only:
{"intent":"NEW"|"EDIT"|"ASK"|"NONE","title":"short project title, 2-5 words, Title Case","framework":"react"|"vue"|"vanilla"|"static"|"node"|"python"|"other"}

- NEW: the user wants a new runnable project, app, website, page, game or multi-file component built from scratch ("create a portfolio website using react", "build a todo app", "make a landing page for my bakery", "express api for a blog").
- EDIT: a current project exists and the user wants it changed, extended, fixed or restyled ("make the hero dark", "add a contact form", "fix the navbar on mobile", "use typescript instead").
- ASK: a current project exists and the user asks a question about it without asking for changes ("how does the routing work?", "explain App.jsx", "how do I deploy this?").
- NONE: anything else — general programming questions, a single small snippet or function ("write a function to reverse a string"), concepts, debugging code pasted in chat, or non-coding talk.

framework: what the project uses or should use. Web UI with no stated stack → "react". Plain HTML/CSS/JS → "static". Node/Express → "node". Python → "python".
If no current project exists, EDIT and ASK are not possible — use NEW or NONE.
title: for NEW, name the thing being built; otherwise repeat the current project's title.`;

const schema = Joi.object({
  intent: Joi.string().valid("NEW", "EDIT", "ASK", "NONE").required(),
  title: Joi.string().allow("").max(200).default(""),
  framework: Joi.string()
    .valid(...CODE_FRAMEWORKS)
    .default("react"),
});

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("code intent classification timed out")), ms),
    ),
  ]);

/** "create a portfolio website using reactjs" → "Portfolio Website". */
export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/\b(please|pls|can you|could you|i want to|i want|i need|help me)\b/gi, "")
    .replace(/\b(for me|using|with|in|that|which)\b.*$/i, "")
    .replace(BUILD_VERB, "")
    .replace(/\b(a|an|the|me|simple|basic|new|complete|full)\b/gi, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = (cleaned || "Code Project").split(" ").slice(0, 5);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").slice(0, MAX_TITLE_CHARS);
}

function guessFramework(prompt: string): CodeFramework {
  if (/\bvue/i.test(prompt)) return "vue";
  if (/\b(express|node\.?js|nest\.?js)\b/i.test(prompt)) return "node";
  if (/\b(python|flask|django|fastapi)\b/i.test(prompt)) return "python";
  if (/\b(html|vanilla|plain js|javascript only)\b/i.test(prompt) && !/\breact/i.test(prompt)) return "static";
  return "react";
}

async function classify(
  message: string,
  project: { title: string; framework: string; paths: string[] } | null,
): Promise<CodeIntent | null> {
  const userContent = [
    `Message: ${message.slice(0, 1500)}`,
    project
      ? `\nCurrent project: "${project.title}" (${project.framework}) — files: ${project.paths.slice(0, 40).join(", ")}`
      : `\n(No current project in this chat.)`,
  ].join("\n");

  try {
    const completion = await withTimeout(
      createOpenRouterJsonCompletion({
        model: getIntentModel(),
        systemPrompt: SYSTEM_PROMPT,
        userContent,
        max_tokens: 120,
        temperature: 0,
      }),
      INTENT_TIMEOUT_MS,
    );
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) return null;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    const { error, value } = schema.validate(JSON.parse(raw.slice(start, end + 1)), { stripUnknown: true });
    if (error) return null;
    return value as CodeIntent;
  } catch (error: any) {
    console.error(`[code-intent] classification failed: ${error?.message ?? error}`);
    return null;
  }
}

export async function detectCodeIntent(params: {
  message: string;
  assistantSlug: string | null | undefined;
  forced: boolean;
  project: { title: string; framework: string; paths: string[] } | null;
}): Promise<CodeIntent> {
  const { message, assistantSlug, forced, project } = params;

  if (assistantSlug !== CODE_ASSISTANT_SLUG) return NONE;
  const text = message.trim();
  if (!text) return NONE;

  // Without a project the only possible code turn is NEW — don't pay for a
  // classifier call on "what is a closure?".
  if (!forced && !project && !passesCodeGate(text)) return NONE;
  if (!forced && project && text.length < 4) return NONE;

  const result = await classify(text, project);

  let intent: CodeIntent = result ?? NONE;
  // EDIT/ASK are meaningless without a project.
  if (!project && (intent.intent === "EDIT" || intent.intent === "ASK")) {
    intent = { ...intent, intent: "NEW" };
  }
  if (forced && (intent.intent === "NONE" || intent.intent === "ASK")) {
    intent = { ...intent, intent: project ? "EDIT" : "NEW" };
  }

  if (intent.intent === "NEW") {
    const title = (intent.title || "").trim() || titleFromPrompt(text);
    const framework = result ? intent.framework : guessFramework(text);
    return { intent: "NEW", title: title.slice(0, MAX_TITLE_CHARS), framework };
  }
  if ((intent.intent === "EDIT" || intent.intent === "ASK") && project) {
    return { intent: intent.intent, title: project.title, framework: project.framework as CodeFramework };
  }
  return NONE;
}
