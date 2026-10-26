import { readFile } from "node:fs/promises";
import path from "node:path";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";
import { dlog, dlogBlock, dlogError } from "./document.logger.js";
import { buildDeckFromTemplate, fillSlideXmls } from "./document.deckFile.engine.js";
import { slideXmlToHtml, SLIDE_HEIGHT, SLIDE_WIDTH } from "./document.deckFile.preview.js";
import {
  describeCatalog,
  validateDeckFill,
  type DeckFileTemplate,
  type FilledSlide,
  type Leaf,
  type OverflowRef,
  capSlides,
  requestedSlideCap,
  trimOverflow,
} from "./document.deckFile.schema.js";
import { PITCH_DECK } from "./document.deckFile.pitchDeck.js";
import { MARKETING_PLAN } from "./document.deckFile.marketingPlan.js";
import { SALES_PROPOSAL } from "./document.deckFile.salesProposal.js";
import { PROJECT_KICKOFF } from "./document.deckFile.projectKickoff.js";
import { QUARTERLY_REVIEW } from "./document.deckFile.quarterlyReview.js";
import { TRAINING_DECK } from "./document.deckFile.trainingDeck.js";
import type { PresentationSpec, SlideBlock, SlideSpec } from "./document.types.js";

/**
 * Decks built from a real designed .pptx (see document.deckFile.engine.ts)
 * instead of the generic slide builder. A theme key that appears here selects
 * this path; every other PPTX theme keeps using document.pptx.ts.
 */
const DECK_FILE_TEMPLATES: Record<string, DeckFileTemplate> = {
  [PITCH_DECK.key]: PITCH_DECK,
  [MARKETING_PLAN.key]: MARKETING_PLAN,
  [SALES_PROPOSAL.key]: SALES_PROPOSAL,
  [PROJECT_KICKOFF.key]: PROJECT_KICKOFF,
  [QUARTERLY_REVIEW.key]: QUARTERLY_REVIEW,
  [TRAINING_DECK.key]: TRAINING_DECK,
};

export const getDeckFileTemplate = (theme: string | null | undefined): DeckFileTemplate | null =>
  (theme && DECK_FILE_TEMPLATES[theme]) || null;

const TEMPLATE_DIR = path.join(process.cwd(), "assets", "pptx-templates");

const getSpecModel = () => process.env.DOCUMENT_SPEC_MODEL ?? "google/gemini-2.5-flash";
const SPEC_MAX_TOKENS = Number(process.env.DOCUMENT_SPEC_MAX_TOKENS ?? 8000);
const MAX_ATTEMPTS = 2;

/* ------------------------------------------------------------------ *
 * Stored shape
 *
 * A filled deck is stored as an ordinary PresentationSpec so everything that
 * already handles a deck (listing, preview, theme switching) keeps working.
 * Each slide additionally carries `fill` (which template slide it is, and the
 * values); the generic title/blocks are derived from it for those consumers.
 * ------------------------------------------------------------------ */

export interface DeckFill {
  slide: string;
  fields: Record<string, unknown>;
}

type SlideWithFill = SlideSpec & { fill?: DeckFill };

/** Flattens a slide's fields into generic blocks, for previews that do not know the template. */
const deriveBlocks = (def: DeckFileTemplate["slides"][number], fields: Record<string, unknown>): { title: string; blocks: SlideBlock[] } => {
  let title = "";
  const blocks: SlideBlock[] = [];

  const flat = (schema: Record<string, Leaf>, data: Record<string, unknown>): string[] => {
    const out: string[] = [];
    for (const [key, leaf] of Object.entries(schema)) {
      const v = data[key];
      if (leaf.type === "string" && typeof v === "string") out.push(v);
      else if (leaf.type === "number" && typeof v === "number") out.push(String(v));
    }
    return out;
  };

  for (const [key, leaf] of Object.entries(def.schema)) {
    const v = fields[key];
    if (leaf.type === "string" && typeof v === "string") {
      if (!title && (key === "heading" || key === "title")) title = v;
      else if (key !== "monogram" && key !== "brand") blocks.push({ type: "paragraph", text: v });
    } else if (leaf.type === "list" && Array.isArray(v)) {
      const items = v
        .map((item) => flat(leaf.item, item as Record<string, unknown>).join(" - "))
        .filter(Boolean);
      if (items.length) blocks.push({ type: "list", items });
    } else if (leaf.type === "object" && v && typeof v === "object") {
      const items = flat(leaf.fields, v as Record<string, unknown>);
      if (items.length) blocks.push({ type: "paragraph", text: items.join(" - ") });
    }
  }
  return { title: title || def.id.charAt(0).toUpperCase() + def.id.slice(1), blocks };
};

const toPresentationSpec = (
  template: DeckFileTemplate,
  deck: { title: string; subtitle?: string; slides: FilledSlide[] },
): PresentationSpec => ({
  title: deck.title,
  ...(deck.subtitle ? { subtitle: deck.subtitle } : {}),
  slides: deck.slides.map((s, i): SlideWithFill => {
    const def = template.slides.find((d) => d.id === s.slide)!;
    const { title, blocks } = deriveBlocks(def, s.fields);
    return {
      layout: i === 0 ? "title" : "content",
      title,
      blocks: i === 0 ? [] : blocks,
      ...(s.notes ? { notes: s.notes } : {}),
      fill: { slide: s.slide, fields: s.fields },
    };
  }),
});

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** True when every slide of the spec is a filled slide of this template. */
export const specMatchesDeckTemplate = (template: DeckFileTemplate, spec: PresentationSpec): boolean =>
  spec.slides.length > 0 &&
  spec.slides.every((s) => {
    const fill = (s as SlideWithFill).fill;
    return Boolean(fill && template.slides.some((d) => d.id === fill.slide));
  });

const planFor = (template: DeckFileTemplate, spec: PresentationSpec) => {
  const ordered = spec.slides
    .map((s) => {
      const fill = (s as SlideWithFill).fill!;
      return { s, fill, def: template.slides.find((d) => d.id === fill.slide)! };
    })
    .sort((a, b) => a.def.source - b.def.source);
  return ordered.map(({ s, fill, def }, i) => ({
    source: def.source,
    edit: (slide: Parameters<typeof def.apply>[0]) => def.apply(slide, fill.fields, { pos: i + 1, total: ordered.length }),
    notes: s.notes,
  }));
};

export const renderDeckFromTemplate = async (
  template: DeckFileTemplate,
  spec: PresentationSpec,
): Promise<Buffer> => {
  const file = await readFile(path.join(TEMPLATE_DIR, template.file));
  const plans = planFor(template, spec);
  dlog("pptx:template", `template=${template.key} slides=${plans.length}/${template.slides.length} filling real file`);
  return buildDeckFromTemplate(file, plans, template.fontMap);
};

export interface DeckPreview {
  width: number;
  height: number;
  /** One self-contained HTML fragment per slide, drawn on a width x height canvas. */
  slides: string[];
}

/** The in-app preview of a filled deck: the same slides, drawn as HTML. */
export const renderDeckPreview = async (
  template: DeckFileTemplate,
  spec: PresentationSpec,
): Promise<DeckPreview> => {
  const file = await readFile(path.join(TEMPLATE_DIR, template.file));
  const xmls = await fillSlideXmls(file, planFor(template, spec), template.fontMap);
  return { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, slides: xmls.map(slideXmlToHtml) };
};

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

const systemPromptFor = (template: DeckFileTemplate): string => `You are a presentation composition engine. You fill a professionally designed ${template.label} template with the user's content. The template has fixed slide designs; you choose which to use and write the text for each.

${template.guidance}

Return ONLY a JSON object:

{
  "title": string,          // deck title
  "subtitle": string,       // optional, one line
  "slides": [ { "slide": string, "fields": object, "notes": string } ]   // "notes" optional speaker notes, max 400 chars
}

The slide catalog. Use only these slides, each at most once, in this order. The FIRST slide must be "${template.slides[0].id}". Every field of a slide you use is required, and "fields" must contain exactly the listed keys.

${describeCatalog(template)}

Hard rules:
- Output raw JSON only. No markdown fences, no commentary.
- Respect every character limit; the designs have fixed-size text boxes. Write short, punchy, specific text: no filler, no markdown, no line breaks.
- Pick the slides that fit the request. Aim for the number of slides the user asked for (default 8); leave out slides that do not apply rather than padding them.
- Write in the language of the user's request.
- Do not mention that you are an AI.`;

const REVISION_OMITTED_KEYS = new Set(["id", "photoUrl", "coverPhotoUrl"]);

const buildUserContent = (
  prompt: string,
  sourceText: string | null | undefined,
  revision: { spec: unknown; instruction: string } | null | undefined,
): string => {
  if (revision) {
    const json = JSON.stringify(revision.spec, (k, v) => (REVISION_OMITTED_KEYS.has(k) ? undefined : v));
    return [
      `Below is the current deck as JSON. Use its content as the basis; it may come from a different layout, so re-express it in the slide catalog.`,
      ``,
      json.slice(0, 60000),
      ``,
      `The user asked for this change:`,
      revision.instruction,
      ``,
      `Return the COMPLETE updated deck as one JSON object in the schema above. Keep everything the change does not affect.`,
    ].join("\n");
  }
  const src = sourceText?.trim();
  return src
    ? `Create a presentation for this request:\n\n${prompt}\n\nBase it on the following source material. Do not invent facts that contradict it:\n\n${src.slice(0, 60000)}`
    : `Create a presentation for this request:\n\n${prompt}`;
};

const parseJsonLoosely = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Model did not return parseable JSON");
    return JSON.parse(raw.slice(start, end + 1));
  }
};

/**
 * One small follow-up call asking the model to shorten just the strings that
 * overflow their text boxes. Much more likely to be obeyed than the limits in
 * the first, large prompt, and far cheaper than regenerating the deck. Never
 * throws: whatever it cannot fix is trimmed deterministically afterwards.
 */
const shortenOverflow = async (
  overflow: OverflowRef[],
): Promise<{ promptTokens: number; completionTokens: number }> => {
  if (overflow.length === 0) return { promptTokens: 0, completionTokens: 0 };
  try {
    const items = overflow.map((o, i) => ({
      id: String(i),
      maxChars: o.max,
      currentChars: String(o.target[o.key]).length,
      text: o.target[o.key],
    }));
    const completion = await createOpenRouterJsonCompletion({
      model: getSpecModel(),
      systemPrompt:
        'You shorten text for slide text boxes. For each item, rewrite "text" so it is AT MOST "maxChars" characters long, keeping the meaning, the facts and the same language. Count characters carefully; shorter is better. Return ONLY JSON: {"items":[{"id":string,"text":string}]}.',
      userContent: JSON.stringify({ items }),
      max_tokens: 2000,
      temperature: 0.2,
    });
    const raw = completion?.choices?.[0]?.message?.content;
    const parsed = raw ? (parseJsonLoosely(raw) as { items?: Array<{ id?: unknown; text?: unknown }> }) : null;
    let fixed = 0;
    for (const it of parsed?.items ?? []) {
      const o = overflow[Number(it.id)];
      if (o && typeof it.text === "string" && it.text.trim() && it.text.length < String(o.target[o.key]).length) {
        // A shorter rewrite is always progress, even if still over: the next
        // round (or the final trim) takes it the rest of the way.
        o.target[o.key] = it.text.replace(/\s+/g, " ").trim();
        fixed += 1;
      }
    }
    dlog("deck:shorten", `${fixed}/${overflow.length} overlong field(s) rewritten shorter`);
    return {
      promptTokens: completion?.usage?.prompt_tokens ?? 0,
      completionTokens: completion?.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    dlogError("deck:shorten", "shorten pass failed; trimming instead", e);
    return { promptTokens: 0, completionTokens: 0 };
  }
};

export const generateDeckFileSpec = async (
  template: DeckFileTemplate,
  prompt: string,
  sourceText?: string | null,
  revision?: { spec: unknown; instruction: string } | null,
): Promise<{ spec: PresentationSpec; promptTokens: number; completionTokens: number }> => {
  const baseContent = buildUserContent(prompt, sourceText, revision);
  const systemPrompt = systemPromptFor(template);
  const model = getSpecModel();
  let userContent = baseContent;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    dlog("deck:request", `template=${template.key} attempt ${attempt}/${MAX_ATTEMPTS} model=${model}`);

    const completion = await createOpenRouterJsonCompletion({
      model,
      systemPrompt,
      userContent,
      max_tokens: SPEC_MAX_TOKENS,
      temperature: 0.4,
    });
    promptTokens += completion?.usage?.prompt_tokens ?? 0;
    completionTokens += completion?.usage?.completion_tokens ?? 0;

    const raw = completion?.choices?.[0]?.message?.content;
    dlogBlock("deck:response", `reply in ${Date.now() - started}ms`, {
      finishReason: completion?.choices?.[0]?.finish_reason,
      contentLength: raw?.length ?? 0,
    });

    if (!raw) {
      lastError = "Model returned an empty response";
    } else {
      try {
        const { value, error } = validateDeckFill(template, parseJsonLoosely(raw));
        if (value) {
          if (value.overflow.length) {
            dlog(
              "deck:overflow",
              `${value.overflow.length} field(s) over their limit: ${value.overflow.map((o) => `${o.path} (${String(o.target[o.key]).length}/${o.max})`).join(", ")}`,
            );
            for (let round = 0; round < 3; round += 1) {
              const stillOver = value.overflow.filter((o) => String(o.target[o.key]).length > o.max);
              if (stillOver.length === 0) break;
              const extra = await shortenOverflow(stillOver);
              promptTokens += extra.promptTokens;
              completionTokens += extra.completionTokens;
            }
            trimOverflow(value.overflow);
          }
          const cap = requestedSlideCap(prompt);
          if (cap && value.slides.length > cap) {
            dlog("deck:cap", `model wrote ${value.slides.length} slides, user asked for at most ${cap}`);
            capSlides(template, value, cap);
          }
          dlog("deck:valid", `accepted on attempt ${attempt}: ${value.slides.map((s) => s.slide).join(", ")}`);
          return { spec: toPresentationSpec(template, value), promptTokens, completionTokens };
        }
        lastError = error ?? "Invalid deck";
        dlogError("deck:invalid", `attempt ${attempt} rejected`, new Error(lastError));
      } catch (e: any) {
        lastError = String(e?.message ?? e);
        dlogError("deck:parse", `attempt ${attempt} unparseable`, e);
      }
    }

    userContent = [
      baseContent,
      ``,
      `Your previous response was rejected with this error:`,
      lastError,
      ``,
      `Return corrected JSON that satisfies the catalog and every limit exactly.`,
    ].join("\n");
  }

  throw new Error(`Could not produce a valid ${template.label} deck: ${lastError}`);
};
