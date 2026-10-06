import { createOpenRouterCompletion } from "@/utils/openrouter.js";
import { buildSystemMessage } from "@/utils/systemPrompt.js";
import type { ContentBrief } from "./content.brief.js";
import { platformRuleText } from "./content.platforms.js";
import {
  SHAPE_HINT,
  parseJsonLoose,
  validateBody,
  type ContentBody,
  type ContentType,
} from "./content.schemas.js";
import { addUsage, type UsageTally } from "./content.meter.js";

/**
 * Step 3: write. One call returns every requested piece (so the pieces differ
 * from each other), validated against the type's schema, with a single repair
 * retry when the model's JSON is malformed or off-shape.
 */

interface WriterModel {
  externalId: string;
}

const MAX_TOKENS: Record<ContentType, number> = {
  social_post: 2500,
  ad_copy: 2500,
  email: 3500,
  video_script: 4000,
  blog: 8000,
};

const contract = (type: ContentType, count: number) => `
OUTPUT CONTRACT - you are producing structured content, not chat.
Respond with ONLY one JSON object, no prose, no code fences:
{"items": [ ${count} object(s), each shaped exactly like: ${SHAPE_HINT[type]} ]}
Write finished, publish-ready copy inside the fields. Never leave placeholders like [Your Brand].
Field text is shown in a plain-text editor: do NOT use markdown (no **bold**, no # headings, no "- " bullets) in any field, except the "body" of blog sections where markdown is allowed. Use line breaks for structure.`;

const briefText = (brief: ContentBrief, userRequest: string) =>
  [
    `Request: ${userRequest}`,
    `Type: ${brief.type}${brief.platform ? ` for ${brief.platform}` : ""}`,
    brief.topic && `Topic: ${brief.topic}`,
    brief.goal && `Goal: ${brief.goal}`,
    brief.audience && `Audience: ${brief.audience}`,
    brief.tone && `Tone: ${brief.tone}`,
    `Pieces: ${brief.count}${brief.count > 1 ? " - each must take a clearly different angle" : ""}`,
    platformRuleText(brief.platform),
  ]
    .filter(Boolean)
    .join("\n");

async function callAndValidate(params: {
  model: WriterModel;
  messages: any[];
  type: ContentType;
  expected: number;
  temperature: number;
  tally: UsageTally;
  signal?: AbortSignal;
}): Promise<{ items?: ContentBody[]; error?: string; raw: string }> {
  const result = await createOpenRouterCompletion({
    model: params.model.externalId,
    messages: params.messages,
    max_tokens: MAX_TOKENS[params.type],
    temperature: params.temperature,
    signal: params.signal,
  });
  addUsage(params.tally, result);

  try {
    const parsed: any = parseJsonLoose(result.content);
    const rawItems: unknown[] = Array.isArray(parsed?.items)
      ? parsed.items
      : parsed && typeof parsed === "object"
        ? [parsed]
        : [];
    if (!rawItems.length) return { error: "No items returned", raw: result.content };

    const items: ContentBody[] = [];
    for (const raw of rawItems.slice(0, params.expected)) {
      const { value, error } = validateBody(params.type, raw);
      if (error || !value) return { error: error ?? "Invalid item", raw: result.content };
      items.push(value);
    }
    return { items, raw: result.content };
  } catch (error: any) {
    return { error: error?.message ?? "Invalid JSON", raw: result.content };
  }
}

async function runWithRepair(params: {
  model: WriterModel;
  messages: any[];
  type: ContentType;
  expected: number;
  temperature: number;
  tally: UsageTally;
  signal?: AbortSignal;
}): Promise<ContentBody[]> {
  const first = await callAndValidate(params);
  if (first.items) return first.items;

  const retry = await callAndValidate({
    ...params,
    messages: [
      ...params.messages,
      { role: "assistant", content: first.raw.slice(0, 6000) },
      {
        role: "user",
        content: `That response was rejected: ${first.error}. Return ONLY the corrected JSON object, exactly matching the contract.`,
      },
    ],
  });
  if (retry.items) return retry.items;
  throw new Error(`Could not produce valid content: ${retry.error}`);
}

const systemBlocks = (params: {
  persona: string;
  stableBlock: string;
  knowledgeBlock: string;
  userContext: string[];
  modelExternalId: string;
  type: ContentType;
  count: number;
}) => {
  const stable = [
    params.persona,
    params.stableBlock,
    params.userContext.length
      ? `User context (personalisation):\n${params.userContext.map((c) => `- ${c}`).join("\n")}`
      : "",
    contract(params.type, params.count),
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: any[] = [buildSystemMessage(stable, params.modelExternalId)];
  if (params.knowledgeBlock) {
    // Separate and uncached: it changes with every request, and putting it in
    // the stable block would invalidate the cached prefix each time.
    messages.push({ role: "system", content: params.knowledgeBlock });
  }
  return messages;
};

export async function generateContent(params: {
  model: WriterModel;
  persona: string;
  temperature: number;
  brief: ContentBrief;
  userRequest: string;
  stableBlock: string;
  knowledgeBlock: string;
  userContext: string[];
  history: { role: "user" | "assistant"; content: string }[];
  tally: UsageTally;
  signal?: AbortSignal;
}): Promise<ContentBody[]> {
  const messages = [
    ...systemBlocks({
      persona: params.persona,
      stableBlock: params.stableBlock,
      knowledgeBlock: params.knowledgeBlock,
      userContext: params.userContext,
      modelExternalId: params.model.externalId,
      type: params.brief.type,
      count: params.brief.count,
    }),
    ...params.history,
    { role: "user", content: briefText(params.brief, params.userRequest) },
  ];

  return runWithRepair({
    model: params.model,
    messages,
    type: params.brief.type,
    expected: params.brief.count,
    temperature: params.temperature,
    tally: params.tally,
    signal: params.signal,
  });
}

export async function reviseContent(params: {
  model: WriterModel;
  persona: string;
  temperature: number;
  type: ContentType;
  platform: string | null;
  existing: ContentBody;
  instruction: string;
  stableBlock: string;
  knowledgeBlock: string;
  userContext: string[];
  tally: UsageTally;
  signal?: AbortSignal;
}): Promise<ContentBody> {
  const messages = [
    ...systemBlocks({
      persona: params.persona,
      stableBlock: params.stableBlock,
      knowledgeBlock: params.knowledgeBlock,
      userContext: params.userContext,
      modelExternalId: params.model.externalId,
      type: params.type,
      count: 1,
    }),
    {
      role: "user",
      content: [
        `Here is the current ${params.type}${params.platform ? ` for ${params.platform}` : ""} as JSON:`,
        JSON.stringify(params.existing),
        `Apply this change and return the full updated item (keep everything the change does not touch): ${params.instruction}`,
        platformRuleText(params.platform),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  const items = await runWithRepair({
    model: params.model,
    messages,
    type: params.type,
    expected: 1,
    temperature: params.temperature,
    tally: params.tally,
    signal: params.signal,
  });
  return items[0];
}
