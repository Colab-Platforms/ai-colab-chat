import Joi from "joi";

/**
 * Content types and the shape of each one's `body`.
 *
 * One source of truth: the Joi schema validates model output, `SHAPE_HINT`
 * tells the model what to emit, and `renderMarkdown` turns a body into the chat
 * transcript text - so adding a type means touching this file, not three.
 */

export const CONTENT_TYPES = [
  "social_post",
  "blog",
  "ad_copy",
  "video_script",
  "email",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const isContentType = (v: unknown): v is ContentType =>
  typeof v === "string" && (CONTENT_TYPES as readonly string[]).includes(v);

const str = (max: number) => Joi.string().trim().max(max).allow("");

const schemas: Record<ContentType, Joi.ObjectSchema> = {
  social_post: Joi.object({
    hook: str(300).required(),
    caption: str(4000).required(),
    cta: str(300).default(""),
    hashtags: Joi.array().items(Joi.string().trim().max(60)).max(40).default([]),
    visualDirection: str(1000).default(""),
  }),
  blog: Joi.object({
    title: str(200).required(),
    metaDescription: str(400).default(""),
    outline: Joi.array().items(Joi.string().max(300)).max(30).default([]),
    sections: Joi.array()
      .items(Joi.object({ heading: str(200).required(), body: str(20000).required() }))
      .min(1)
      .max(30)
      .required(),
  }),
  ad_copy: Joi.object({
    variants: Joi.array()
      .items(
        Joi.object({
          headline: str(200).required(),
          primaryText: str(1500).required(),
          cta: str(100).default(""),
        }),
      )
      .min(1)
      .max(10)
      .required(),
  }),
  video_script: Joi.object({
    title: str(200).required(),
    scenes: Joi.array()
      .items(
        Joi.object({
          visual: str(1000).required(),
          voiceover: str(2000).default(""),
          durationSec: Joi.number().min(1).max(600).default(5),
        }),
      )
      .min(1)
      .max(40)
      .required(),
  }),
  email: Joi.object({
    subject: str(300).required(),
    preheader: str(300).default(""),
    body: str(20000).required(),
    cta: str(200).default(""),
  }),
};

/** Human/LLM-readable description of each type's JSON shape, for prompts. */
export const SHAPE_HINT: Record<ContentType, string> = {
  social_post:
    '{"hook": string, "caption": string, "cta": string, "hashtags": string[] (without #), "visualDirection": string}',
  blog: '{"title": string, "metaDescription": string, "outline": string[], "sections": [{"heading": string, "body": string (markdown)}]}',
  ad_copy:
    '{"variants": [{"headline": string, "primaryText": string, "cta": string}]}',
  video_script:
    '{"title": string, "scenes": [{"visual": string, "voiceover": string, "durationSec": number}]}',
  email:
    '{"subject": string, "preheader": string, "body": string (plain text or markdown), "cta": string}',
};

export type ContentBody = Record<string, any>;

export function validateBody(
  type: ContentType,
  raw: unknown,
): { value?: ContentBody; error?: string } {
  const { error, value } = schemas[type].validate(raw, {
    abortEarly: false,
    stripUnknown: true,
  });
  return error ? { error: error.message } : { value };
}

export function titleOf(type: ContentType, body: ContentBody): string {
  const raw =
    type === "social_post"
      ? body.hook
      : type === "ad_copy"
        ? body.variants?.[0]?.headline
        : type === "email"
          ? body.subject
          : body.title;
  return String(raw || "Untitled").slice(0, 120);
}

const hashtagLine = (tags: string[] = []) =>
  tags.length ? tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ") : "";

export function renderMarkdown(
  type: ContentType,
  body: ContentBody,
  platform?: string | null,
): string {
  switch (type) {
    case "social_post":
      return [
        platform ? `**${platform}**` : "",
        `**Hook:** ${body.hook}`,
        body.caption,
        body.cta ? `**CTA:** ${body.cta}` : "",
        hashtagLine(body.hashtags),
        body.visualDirection ? `*Visual:* ${body.visualDirection}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "blog":
      return [
        `# ${body.title}`,
        body.metaDescription ? `> ${body.metaDescription}` : "",
        ...(body.sections ?? []).map(
          (s: any) => `## ${s.heading}\n\n${s.body}`,
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
    case "ad_copy":
      return (body.variants ?? [])
        .map(
          (v: any, i: number) =>
            `**Variant ${i + 1}**\n\n**${v.headline}**\n\n${v.primaryText}${v.cta ? `\n\n**CTA:** ${v.cta}` : ""}`,
        )
        .join("\n\n---\n\n");
    case "video_script":
      return [
        `# ${body.title}`,
        ...(body.scenes ?? []).map(
          (s: any, i: number) =>
            `**Scene ${i + 1}** (${s.durationSec ?? 5}s)\n\n*Visual:* ${s.visual}${s.voiceover ? `\n\n*Voiceover:* ${s.voiceover}` : ""}`,
        ),
      ].join("\n\n");
    case "email":
      return [
        `**Subject:** ${body.subject}`,
        body.preheader ? `*Preheader:* ${body.preheader}` : "",
        body.body,
        body.cta ? `**CTA:** ${body.cta}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
  }
}

/** Tolerant JSON extraction: strips code fences and surrounding prose. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}
