import type { SlideContext, SlideXml } from "./document.deckFile.engine.js";

/**
 * The fields the model fills for one slide of a template file, with the limits
 * the design can hold. One definition drives three things so they cannot drift:
 * the prompt shown to the model, the validator that checks its reply, and the
 * hand-written `apply` that writes the values into the slide.
 */
export type Leaf =
  | {
      type: "string";
      /** Characters the design's text box holds comfortably. */
      max: number;
      /** Per list-index override of `max` (e.g. a narrower third column). */
      maxAt?: number[];
      hint: string;
    }
  | { type: "number"; min: number; max: number; hint: string }
  | { type: "bool"; hint: string }
  | { type: "bools"; length: number; hint: string }
  | { type: "object"; fields: Record<string, Leaf>; hint?: string }
  | { type: "list"; min: number; max: number; item: Record<string, Leaf>; hint?: string };

export interface DeckSlideDef {
  /** Stable id the model refers to this slide by. */
  id: string;
  /** 1-based slide number in the template file. */
  source: number;
  /** What the slide is for, in plain words, for the model. */
  purpose: string;
  schema: Record<string, Leaf>;
  /** Writes validated values into the slide. */
  apply: (slide: SlideXml, data: any, ctx: SlideContext) => void;
}

export interface DeckFileTemplate {
  key: string;
  /** File under backend/assets/pptx-templates/. */
  file: string;
  label: string;
  /** What the deck is and how to tell its story, for the model. */
  guidance: string;
  /** Web fonts in the file -> a font every Office install has. */
  fontMap?: Record<string, string>;
  /** Slide ids to drop first when the user asks for fewer slides than the model wrote. */
  dropOrder?: string[];
  slides: DeckSlideDef[];
}

type Fields = Record<string, unknown>;

/** A string longer than its box holds, with a handle to rewrite it in place. */
export interface OverflowRef {
  path: string;
  max: number;
  target: Fields;
  key: string;
}

const TRAILING_FILLER = /\s+(a|an|the|of|to|and|or|for|with|in|on|that|which|by|at|from|as|is|are|into|than|so)$/i;

/**
 * Last-resort shortening: cut at the best natural break at or under `max`
 * (sentence end, then comma/dash, then word), and drop dangling filler words,
 * so the text stays readable and fits its box.
 */
export const trimToFit = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const head = text.slice(0, max + 1);
  const floor = Math.floor(max * 0.55);
  const breaks = [/[.!?](?=\s)/g, /[,;:\u2013\u2014-](?=\s)/g, /\s/g];
  let cut = -1;
  for (const re of breaks) {
    let last = -1;
    for (const m of head.matchAll(re)) if (m.index! >= floor && m.index! < max) last = m.index!;
    if (last >= 0) {
      cut = last + (re === breaks[0] ? 1 : 0);
      break;
    }
  }
  let out = (cut >= 0 ? text.slice(0, cut) : text.slice(0, max)).trim();
  out = out.replace(/[,;:&+\u2013\u2014-]+$/, "").trim();
  while (TRAILING_FILLER.test(out)) out = out.replace(TRAILING_FILLER, "").replace(/[,;:&+\u2013\u2014-]+$/, "").trim();
  return out;
};

/** Applies the last-resort trim to everything still over its limit. */
export const trimOverflow = (overflow: OverflowRef[]): void => {
  for (const o of overflow) {
    const v = o.target[o.key];
    if (typeof v === "string" && v.length > o.max) o.target[o.key] = trimToFit(v, o.max);
  }
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const checkLeaf = (
  leaf: Leaf,
  value: unknown,
  path: string,
  errors: string[],
  overflow: OverflowRef[],
): unknown => {
  switch (leaf.type) {
    case "string": {
      if (typeof value !== "string" || !clean(value)) {
        errors.push(`${path} must be a non-empty string`);
        return "";
      }
      // Length is not checked here: small models overshoot limits routinely,
      // and failing a whole deck over one long caption is the wrong trade.
      // Overlong strings are collected by checkFields and shortened afterwards.
      return clean(value);
    }
    case "number": {
      const n = typeof value === "string" ? Number(value.replace(/[, ]/g, "")) : value;
      if (typeof n !== "number" || !Number.isFinite(n) || n < leaf.min || n > leaf.max) {
        errors.push(`${path} must be a number between ${leaf.min} and ${leaf.max}`);
        return leaf.min;
      }
      return n;
    }
    case "bool":
      if (typeof value !== "boolean") errors.push(`${path} must be true or false`);
      return value === true;
    case "bools":
      if (!Array.isArray(value) || value.length !== leaf.length || value.some((v) => typeof v !== "boolean")) {
        errors.push(`${path} must be an array of exactly ${leaf.length} true/false values`);
        return Array(leaf.length).fill(false);
      }
      return value;
    case "object":
      return checkFields(leaf.fields, value, path, errors, null, overflow);
    case "list": {
      if (!Array.isArray(value) || value.length < leaf.min || value.length > leaf.max) {
        errors.push(
          leaf.min === leaf.max
            ? `${path} must have exactly ${leaf.min} items`
            : `${path} must have ${leaf.min} to ${leaf.max} items`,
        );
        return [];
      }
      return value.map((item, i) => checkFields(leaf.item, item, `${path}[${i}]`, errors, i, overflow));
    }
  }
};

const checkFields = (
  schema: Record<string, Leaf>,
  value: unknown,
  path: string,
  errors: string[],
  index: number | null,
  overflow: OverflowRef[],
): Fields => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return {};
  }
  const out: Fields = {};
  for (const [key, leaf] of Object.entries(schema)) {
    out[key] = checkLeaf(leaf, (value as Fields)[key], `${path}.${key}`, errors, overflow);
    if (leaf.type === "string" && typeof out[key] === "string") {
      const max = (index !== null && leaf.maxAt?.[index]) || leaf.max;
      if ((out[key] as string).length > max) overflow.push({ path: `${path}.${key}`, max, target: out, key });
    }
  }
  return out;
};

export interface FilledSlide {
  slide: string;
  fields: Fields;
  notes?: string;
}

export interface ValidatedDeck {
  title: string;
  subtitle?: string;
  slides: FilledSlide[];
  /** Strings over their limit; see {@link trimOverflow}. */
  overflow: OverflowRef[];
}

/** Checks a model reply against a template's slide catalog. */
export const validateDeckFill = (
  template: DeckFileTemplate,
  data: unknown,
): { value?: ValidatedDeck; error?: string } => {
  const errors: string[] = [];
  const overflow: OverflowRef[] = [];
  const root = (data ?? {}) as { title?: unknown; subtitle?: unknown; slides?: unknown };

  if (!Array.isArray(root.slides) || root.slides.length === 0) {
    return { error: `"slides" must be a non-empty array` };
  }

  const order = new Map(template.slides.map((s, i) => [s.id, i]));
  const seen = new Set<string>();
  const slides: FilledSlide[] = [];
  let lastOrder = -1;

  root.slides.forEach((raw, i) => {
    const entry = (raw ?? {}) as { slide?: unknown; fields?: unknown; notes?: unknown };
    const id = typeof entry.slide === "string" ? entry.slide : "";
    const def = template.slides.find((s) => s.id === id);
    if (!def) {
      errors.push(`slides[${i}].slide "${id}" is not one of: ${template.slides.map((s) => s.id).join(", ")}`);
      return;
    }
    if (seen.has(id)) errors.push(`slide "${id}" is used more than once`);
    seen.add(id);
    const pos = order.get(id)!;
    if (pos < lastOrder) errors.push(`slide "${id}" is out of order; keep the catalog order`);
    lastOrder = Math.max(lastOrder, pos);

    const fields = checkFields(def.schema, entry.fields, `slides[${i}](${id}).fields`, errors, null, overflow);
    const notes = typeof entry.notes === "string" ? clean(entry.notes).slice(0, 1500) : undefined;
    slides.push({ slide: id, fields, ...(notes ? { notes } : {}) });
  });

  if (slides[0]?.slide !== template.slides[0].id) {
    errors.push(`the first slide must be "${template.slides[0].id}"`);
  }
  if (errors.length) return { error: errors.slice(0, 12).join("; ") };

  const titleSlide = slides[0].fields as { title?: string; tagline?: string };
  const title = typeof root.title === "string" && clean(root.title) ? clean(root.title) : (titleSlide.title ?? "Presentation");
  const subtitle = typeof root.subtitle === "string" && clean(root.subtitle) ? clean(root.subtitle) : titleSlide.tagline;
  return { value: { title: title.slice(0, 200), subtitle: subtitle?.slice(0, 300), slides, overflow } };
};

const describeLeaf = (leaf: Leaf, indent: string): string => {
  switch (leaf.type) {
    case "string":
      return `string, at most ${leaf.max} chars${leaf.maxAt ? ` (per item: ${leaf.maxAt.join(", ")})` : ""} - ${leaf.hint}`;
    case "number":
      return `number ${leaf.min}-${leaf.max} - ${leaf.hint}`;
    case "bool":
      return `true/false - ${leaf.hint}`;
    case "bools":
      return `array of exactly ${leaf.length} true/false - ${leaf.hint}`;
    case "object":
      return `object${leaf.hint ? ` - ${leaf.hint}` : ""}\n${describeFields(leaf.fields, indent + "  ")}`;
    case "list":
      return `array of ${leaf.min === leaf.max ? `exactly ${leaf.min}` : `${leaf.min}-${leaf.max}`} objects${leaf.hint ? ` - ${leaf.hint}` : ""}\n${describeFields(leaf.item, indent + "  ")}`;
  }
};

const describeFields = (schema: Record<string, Leaf>, indent: string): string =>
  Object.entries(schema)
    .map(([key, leaf]) => `${indent}"${key}": ${describeLeaf(leaf, indent)}`)
    .join("\n");

/** The slide catalog, rendered for the model. */
export const describeCatalog = (template: DeckFileTemplate): string =>
  template.slides
    .map((s) => `Slide "${s.id}" - ${s.purpose}\n${describeFields(s.schema, "  ")}`)
    .join("\n\n");

/** The slide count the user asked for ("5-7 slides", "about 6 slides"), upper bound, if any. */
export const requestedSlideCap = (prompt: string): number | null => {
  const range = /(\d{1,2})\s*(?:-|\u2013|to)\s*(\d{1,2})\s*slides?/i.exec(prompt);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const single = /(\d{1,2})\s*slides?/i.exec(prompt);
  return single ? Number(single[1]) : null;
};

/** Removes the least important slides until the deck fits `cap`; the first slide is never removed. */
export const capSlides = (template: DeckFileTemplate, deck: ValidatedDeck, cap: number): void => {
  const order = template.dropOrder ?? [...template.slides].reverse().map((s) => s.id);
  for (const id of order) {
    if (deck.slides.length <= cap) break;
    const i = deck.slides.findIndex((s) => s.slide === id);
    if (i > 0) deck.slides.splice(i, 1);
  }
};
