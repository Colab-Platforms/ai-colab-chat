import Joi from "joi";
import { createOpenRouterCompletion } from "@/utils/openrouter.js";
import { normalizePlatform } from "./content.platforms.js";
import { CONTENT_TYPES, type ContentType } from "./content.schemas.js";
import { addUsage, type UsageTally } from "./content.meter.js";

/**
 * Step 1 of the pipeline: turn a chat message into a structured brief.
 *
 * Doubles as the router. Anything that is not a request for finished content
 * (strategy questions, brainstorming, small talk) comes back as `chat` and is
 * handled by the ordinary streaming path - so the agent never hijacks a
 * conversation, and every failure here fails open to that path.
 */

const getBriefModel = () =>
  process.env.CONTENT_BRIEF_MODEL ?? "google/gemini-2.5-flash";
const BRIEF_TIMEOUT_MS = Number(process.env.CONTENT_BRIEF_TIMEOUT_MS ?? 15000);
const MAX_PIECES = 5;

export interface ContentBrief {
  action: "create" | "revise" | "chat";
  type: ContentType;
  platform: string | null;
  topic: string;
  goal: string;
  audience: string;
  tone: string;
  count: number;
  product: string | null;
  assumptions: string[];
  instruction: string;
}

export interface LastItemSummary {
  id: number;
  type: string;
  platform: string | null;
  title: string;
}

const SYSTEM_PROMPT = `You route requests for a content-writing assistant. Reply with ONE JSON object and nothing else:
{
  "action": "create" | "revise" | "chat",
  "type": "social_post" | "blog" | "ad_copy" | "video_script" | "email",
  "platform": string | null,
  "topic": string,
  "goal": string,
  "audience": string,
  "tone": string,
  "count": number,
  "product": string | null,
  "assumptions": string[],
  "instruction": string
}

action:
- "create": the user wants new finished content written (a post, article, ad, script, email...).
- "revise": the user wants a change to the MOST RECENT content item shown in LAST_ITEM (shorter, different tone, add X, rewrite the hook...). Only valid when LAST_ITEM exists.
- "chat": anything else - questions, strategy advice, brainstorming ideas, greetings, feedback about the product. When unsure between chat and create, choose chat.

Fields:
- type: pick the best fit. A social platform implies social_post. For "revise", copy LAST_ITEM's type.
- platform: lowercase (instagram, linkedin, x, facebook, tiktok, youtube) or null.
- topic: what the content is about, in one short phrase.
- goal/audience/tone: use what the user said; if unspecified write a sensible default and list it in "assumptions" (e.g. "Assumed goal: product awareness").
- count: number of separate pieces requested (1-${MAX_PIECES}). Default 1.
- product: the product/brand name if one is named, else null.
- instruction: for "revise", the change requested; otherwise "".
- assumptions: at most 3 short strings. Empty array if the user specified everything.`;

const briefSchema = Joi.object({
  action: Joi.string().valid("create", "revise", "chat").required(),
  type: Joi.string()
    .valid(...CONTENT_TYPES)
    .default("social_post"),
  platform: Joi.string().allow(null, "").default(null),
  topic: Joi.string().allow("").default(""),
  goal: Joi.string().allow("").default(""),
  audience: Joi.string().allow("").default(""),
  tone: Joi.string().allow("").default(""),
  count: Joi.number().integer().min(1).default(1),
  product: Joi.string().allow(null, "").default(null),
  assumptions: Joi.array().items(Joi.string()).default([]),
  instruction: Joi.string().allow("").default(""),
}).unknown(true);

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("brief timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

/** Returns null on any failure - the caller treats that as "not handled". */
export async function extractBrief(params: {
  message: string;
  lastItem: LastItemSummary | null;
  tally: UsageTally;
}): Promise<ContentBrief | null> {
  try {
    const userContent = [
      `LAST_ITEM: ${params.lastItem ? JSON.stringify(params.lastItem) : "none"}`,
      `USER_MESSAGE: ${params.message.slice(0, 4000)}`,
    ].join("\n");

    const result = await withTimeout(
      createOpenRouterCompletion({
        model: getBriefModel(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        jsonMode: true,
        max_tokens: 400,
        temperature: 0,
      }),
      BRIEF_TIMEOUT_MS,
    );
    addUsage(params.tally, result);

    const raw = JSON.parse(result.content);
    const { error, value } = briefSchema.validate(raw, { stripUnknown: true });
    if (error) return null;

    // "revise" with nothing to revise is really a fresh request.
    if (value.action === "revise" && !params.lastItem) value.action = "create";

    return {
      ...value,
      platform: normalizePlatform(value.platform),
      count: Math.min(value.count, MAX_PIECES),
      assumptions: value.assumptions.slice(0, 3),
    } as ContentBrief;
  } catch (error) {
    console.error("[content-agent] brief extraction failed:", error);
    return null;
  }
}
