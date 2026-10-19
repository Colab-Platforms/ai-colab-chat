import Joi from "joi";
import {
  COLUMN_TOTALS,
  COLUMN_TYPES,
  DOCUMENT_FORMATS,
  DOCUMENT_THEMES,
  MINDMAP_THEMES,
  PPTX_TEMPLATES,
  MAX_BLOCKS,
  MAX_MINDMAP_CHILDREN,
  MAX_MINDMAP_DEPTH,
  MAX_MINDMAP_NODE_CHARS,
  MAX_MINDMAP_NODES,
  MAX_MINDMAP_NOTE_CHARS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_NAME_CHARS,
  MAX_SHEET_ROWS,
  MAX_SHEETS,
  MAX_BLOCKS_PER_SLIDE,
  MAX_NOTES_CHARS,
  MAX_SLIDES,
  MAX_SOURCE_TEXT_CHARS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_TEXT_CHARS,
  MAX_TITLE_CHARS,
  SLIDE_BLOCK_TYPES,
  type MindmapNode,
  type SpecKind,
} from "./document.types.js";

/* ------------------------------------------------------------------ *
 * API input
 * ------------------------------------------------------------------ */

export const createDocumentSchema = Joi.object({
  prompt: Joi.string().trim().max(4000).required().messages({
    "string.empty": "Prompt is required",
    "any.required": "Prompt is required",
    "string.max": "Prompt cannot exceed 4000 characters",
  }),
  chatId: Joi.number().integer().optional().allow(null),
  messageId: Joi.number().integer().optional().allow(null),
  title: Joi.string().trim().max(MAX_TITLE_CHARS).optional().allow(""),
  // Any enum value is accepted here; the service rejects the ones with no
  // renderer, so the error names the formats that genuinely work today rather
  // than the ones that merely exist in the schema.
  format: Joi.string()
    .valid(...DOCUMENT_FORMATS)
    .optional(),
  // Shared with PPTX-only template keys: the `theme` field is reused for
  // both, since which set applies is decided by the document's format, not
  // by the schema (see document.types.ts:PptxTemplate).
  theme: Joi.string()
    .valid(...DOCUMENT_THEMES, ...PPTX_TEMPLATES, ...MINDMAP_THEMES)
    .optional(),
  sourceText: Joi.string()
    .trim()
    .max(MAX_SOURCE_TEXT_CHARS)
    .optional()
    .allow(""),
});

export const validateCreateDocumentSchema = (data: unknown) => {
  return createDocumentSchema.validate(data, { abortEarly: false });
};

/**
 * v1 style-edit surface: theme/title only. Structural spec edits (reordering,
 * adding/removing blocks or pages) are a later phase and will get their own,
 * stricter schema this one deliberately does not accept a `spec` field.
 */
export const updateDocumentStyleSchema = Joi.object({
  title: Joi.string().trim().min(1).max(MAX_TITLE_CHARS).optional(),
  theme: Joi.string()
    .valid(...DOCUMENT_THEMES, ...PPTX_TEMPLATES, ...MINDMAP_THEMES)
    .optional(),
})
  .min(1)
  .messages({
    "object.min": "Provide at least a title or theme to update",
  });

export const validateUpdateDocumentStyleSchema = (data: unknown) => {
  return updateDocumentStyleSchema.validate(data, { abortEarly: false });
};

/* ------------------------------------------------------------------ *
 * Model output
 *
 * The spec model is instructed to return this shape, but a model can always
 * drift. Validating here (rather than trusting it) is what lets the worker
 * retry with the validation error fed back, instead of rendering garbage.
 * ------------------------------------------------------------------ */

const text = (max = MAX_TEXT_CHARS) => Joi.string().allow("").max(max);

/**
 * Optional fields must tolerate null, not just "".
 *
 * Models routinely emit `"attribution": null` for an absent optional value,
 * which is semantically identical to omitting the key but a bare
 * Joi.string().allow("") rejects it, forcing a full retry and doubling the
 * cost of the document for nothing.
 */
const optionalText = (max = MAX_TEXT_CHARS) =>
  Joi.string().allow("", null).max(max).optional();

/**
 * One schema per block type, keyed by type.
 *
 * Keyed rather than inlined into `alternatives()` so the presentation spec can
 * compose its own narrower subset from the same definitions two hand-written
 * copies would drift the moment a block gains a field.
 */
const BLOCK_SCHEMAS: Record<string, Joi.ObjectSchema> = {
  heading: Joi.object({
    type: Joi.string().valid("heading").required(),
    level: Joi.number().valid(1, 2, 3).required(),
    text: text(500).required(),
  }),
  paragraph: Joi.object({
    type: Joi.string().valid("paragraph").required(),
    text: text().required(),
  }),
  list: Joi.object({
    type: Joi.string().valid("list").required(),
    ordered: Joi.boolean().allow(null).optional(),
    items: Joi.array().items(text(2000).allow(null)).min(1).max(200).required(),
  }),
  table: Joi.object({
    type: Joi.string().valid("table").required(),
    columns: Joi.array()
      .items(text(200))
      .min(1)
      .max(MAX_TABLE_COLUMNS)
      .required(),
    rows: Joi.array()
      .items(Joi.array().items(text(2000).allow(null)).max(MAX_TABLE_COLUMNS))
      .max(MAX_TABLE_ROWS)
      .required(),
    caption: optionalText(300),
  }),
  callout: Joi.object({
    type: Joi.string().valid("callout").required(),
    variant: Joi.string()
      .valid("info", "warning", "success", "danger")
      .required(),
    title: optionalText(200),
    text: text(4000).required(),
  }),
  keyValue: Joi.object({
    type: Joi.string().valid("keyValue").required(),
    items: Joi.array()
      .items(
        Joi.object({
          label: text(200).required(),
          value: text(2000).required(),
        }),
      )
      .min(1)
      .max(100)
      .required(),
  }),
  quote: Joi.object({
    type: Joi.string().valid("quote").required(),
    text: text(4000).required(),
    attribution: optionalText(200),
  }),
  code: Joi.object({
    type: Joi.string().valid("code").required(),
    language: Joi.string().alphanum().max(20).allow("", null).optional(),
    code: text().required(),
  }),
  image: Joi.object({
    type: Joi.string().valid("image").required(),
    // Only https the renderer additionally enforces a host allowlist. A
    // model-supplied file://, data: or http:// URL is an SSRF / local-file
    // read against our own renderer, so it never gets past this line.
    url: Joi.string().uri({ scheme: ["https"] }).max(2000).required(),
    caption: optionalText(300),
    width: Joi.string().valid("full", "half").allow(null).optional(),
  }),
  divider: Joi.object({ type: Joi.string().valid("divider").required() }),
  pageBreak: Joi.object({ type: Joi.string().valid("pageBreak").required() }),
};

/**
 * Validates a block by dispatching on its `type`.
 *
 * Deliberately NOT `Joi.alternatives().try(...)`. When a value fails every
 * branch of an alternatives schema, Joi reports only "does not match any of
 * the allowed types" and throws away the per-branch reasons so a rejected
 * spec was undiagnosable, and the retry fed the model an error it could not
 * act on, turning a repair into a full reroll.
 *
 * Dispatching first means the error names the actual field: `blocks[150].
 * language must only contain alpha-numeric characters`.
 */
const makeBlockValidator = (allowedTypes: readonly string[]) =>
  Joi.any().custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("block must be an object");
    }

    const type = (value as { type?: unknown }).type;
    if (typeof type !== "string") {
      throw new Error('block is missing a string "type"');
    }
    if (!allowedTypes.includes(type)) {
      throw new Error(
        `unknown block type "${type}" (allowed: ${allowedTypes.join(", ")})`,
      );
    }

    const { error, value: validated } = BLOCK_SCHEMAS[type].validate(value, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      throw new Error(error.message);
    }
    return validated;
  });

const ALL_BLOCK_TYPES = Object.keys(BLOCK_SCHEMAS);

const blockSchema = makeBlockValidator(ALL_BLOCK_TYPES);

export const documentSpecSchema = Joi.object({
  title: Joi.string().trim().max(MAX_TITLE_CHARS).required(),
  subtitle: optionalText(300),
  author: optionalText(200),
  coverPage: Joi.boolean().allow(null).optional(),
  showPageNumbers: Joi.boolean().allow(null).optional(),
  blocks: Joi.array().items(blockSchema).min(1).max(MAX_BLOCKS).required(),
});

export const validateDocumentSpec = (data: unknown) => {
  return documentSpecSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
};

/* ------------------------------------------------------------------ *
 * Presentation spec
 * ------------------------------------------------------------------ */

/**
 * Slides accept a subset of the block vocabulary.
 *
 * Composed from the same `BLOCK_SCHEMAS` entries the document spec uses, so a
 * change to how a table or callout validates cannot drift between the two.
 */
const slideBlockSchema = makeBlockValidator(SLIDE_BLOCK_TYPES);

const slideSchema = Joi.object({
  layout: Joi.string().valid("title", "section", "content").allow(null).optional(),
  title: Joi.string().trim().allow("").max(MAX_TITLE_CHARS).required(),
  subtitle: optionalText(300),
  blocks: Joi.array()
    .items(slideBlockSchema)
    // A slide with no blocks is legitimate title and section slides are
    // exactly that.
    .max(MAX_BLOCKS_PER_SLIDE)
    .default([]),
  notes: optionalText(MAX_NOTES_CHARS),
});

export const presentationSpecSchema = Joi.object({
  title: Joi.string().trim().max(MAX_TITLE_CHARS).required(),
  subtitle: optionalText(300),
  author: optionalText(200),
  slides: Joi.array().items(slideSchema).min(1).max(MAX_SLIDES).required(),
});

export const validatePresentationSpec = (data: unknown) => {
  return presentationSpecSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
};

/* ------------------------------------------------------------------ *
 * Workbook spec
 * ------------------------------------------------------------------ */

/**
 * A cell is a scalar, never an object or array.
 *
 * `null` is meaningful and must be allowed: it is how the model says "this
 * cell is empty", which the template behaviour depends on.
 */
const cellSchema = Joi.alternatives().try(
  Joi.string().allow("").max(2000),
  Joi.number(),
  Joi.boolean(),
  Joi.valid(null),
);

const sheetColumnSchema = Joi.object({
  header: Joi.string().trim().allow("").max(200).required(),
  type: Joi.string()
    .valid(...COLUMN_TYPES)
    .allow(null)
    .optional(),
  width: Joi.number().min(4).max(120).allow(null).optional(),
  total: Joi.string()
    .valid(...COLUMN_TOTALS)
    .allow(null)
    .optional(),
});

const sheetSchema = Joi.object({
  // Length and character rules are enforced here so a bad name is a
  // correctable validation error rather than a workbook Excel refuses to open.
  name: Joi.string()
    .trim()
    .min(1)
    .max(MAX_SHEET_NAME_CHARS)
    .required()
    .messages({
      "string.max": `Sheet name must be ${MAX_SHEET_NAME_CHARS} characters or fewer (an Excel limit)`,
    }),
  columns: Joi.array()
    .items(sheetColumnSchema)
    .min(1)
    .max(MAX_SHEET_COLUMNS)
    .required(),
  rows: Joi.array()
    .items(Joi.array().items(cellSchema).max(MAX_SHEET_COLUMNS))
    .max(MAX_SHEET_ROWS)
    .required(),
  freezeHeader: Joi.boolean().allow(null).optional(),
  notes: optionalText(1000),
});

export const workbookSpecSchema = Joi.object({
  title: Joi.string().trim().max(MAX_TITLE_CHARS).required(),
  author: optionalText(200),
  sheets: Joi.array().items(sheetSchema).min(1).max(MAX_SHEETS).required(),
});

export const validateWorkbookSpec = (data: unknown) => {
  return workbookSpecSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
};

/* ------------------------------------------------------------------ *
 * Mind-map spec
 *
 * Normalises rather than rejects. A tree that is a little too deep or too
 * bushy is trimmed to the caps instead of failing, because a reroll of a
 * mind map costs a whole model call to fix something harmless. Only a spec
 * with no usable structure at all (no title, no branches) is an error, and
 * that error names the problem so the retry can act on it.
 * ------------------------------------------------------------------ */

const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const MINDMAP_ID_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

interface MindmapNormalizeContext {
  /** Shared across the walk so the node cap holds for the tree, not per branch. */
  budget: { left: number };
  usedIds: Set<string>;
  /**
   * Keep ids the client supplied instead of assigning path ids. Model output
   * has no ids, so it takes path ids; an editor save carries the ids the user's
   * session (and its undo history) already knows, which must survive the save.
   */
  preserveIds: boolean;
  /**
   * Record cap violations instead of silently trimming. A model can be trimmed
   * harmlessly, but a user's edit must not quietly lose nodes they can see.
   */
  strict: boolean;
  problems: string[];
}

/**
 * Rebuilds a node (and its subtree) from untrusted input: drops children with
 * no text and enforces depth / fan-out / total caps, either trimming or, in
 * strict mode, reporting them.
 */
const normalizeMindmapNode = (
  input: unknown,
  pathId: string,
  depth: number,
  ctx: MindmapNormalizeContext,
  fallbackText = "",
): MindmapNode | null => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    if (ctx.strict) ctx.problems.push("a node is not an object");
    return null;
  }
  const raw = input as {
    id?: unknown;
    text?: unknown;
    note?: unknown;
    children?: unknown;
  };

  const text = cleanText(raw.text, MAX_MINDMAP_NODE_CHARS) || fallbackText;
  if (!text) {
    if (ctx.strict) ctx.problems.push("every node needs some text");
    return null;
  }
  if (ctx.budget.left <= 0) {
    if (ctx.strict) {
      ctx.problems.push(`a mind map can have at most ${MAX_MINDMAP_NODES} nodes`);
    }
    return null;
  }
  ctx.budget.left -= 1;

  const supplied =
    typeof raw.id === "string" && MINDMAP_ID_PATTERN.test(raw.id) ? raw.id : null;
  let id =
    ctx.preserveIds && supplied && !ctx.usedIds.has(supplied) ? supplied : pathId;
  while (ctx.usedIds.has(id)) id = `${id}_x`;
  ctx.usedIds.add(id);

  const note = cleanText(raw.note, MAX_MINDMAP_NOTE_CHARS);
  const node: MindmapNode = { id, text, children: [] };
  if (note) node.note = note;

  const rawChildren = Array.isArray(raw.children) ? raw.children : [];
  if (rawChildren.length > 0 && depth >= MAX_MINDMAP_DEPTH) {
    if (ctx.strict) {
      ctx.problems.push(`branches can go at most ${MAX_MINDMAP_DEPTH} levels deep`);
    }
    return node;
  }
  for (const child of rawChildren) {
    if (node.children.length >= MAX_MINDMAP_CHILDREN) {
      if (ctx.strict) {
        ctx.problems.push(`a node can have at most ${MAX_MINDMAP_CHILDREN} children`);
      }
      break;
    }
    const built = normalizeMindmapNode(
      child,
      `${id}.${node.children.length + 1}`,
      depth + 1,
      ctx,
    );
    if (built) node.children.push(built);
  }
  return node;
};

export interface MindmapValidationOptions {
  preserveIds?: boolean;
  strict?: boolean;
}

export const validateMindmapSpec = (
  data: unknown,
  options: MindmapValidationOptions = {},
): Joi.ValidationResult => {
  const fail = (message: string): Joi.ValidationResult => ({
    error: new Joi.ValidationError(message, [], data),
    value: data,
  });

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return fail("mind map must be a JSON object");
  }
  const source = data as { title?: unknown; root?: unknown };

  const title = cleanText(source.title, MAX_TITLE_CHARS);
  if (!title) return fail('"title" is required');

  const ctx: MindmapNormalizeContext = {
    budget: { left: MAX_MINDMAP_NODES },
    usedIds: new Set(),
    preserveIds: options.preserveIds ?? false,
    strict: options.strict ?? false,
    problems: [],
  };

  const root = normalizeMindmapNode(
    source.root,
    "0",
    0,
    ctx,
    // A model that forgot the root's own text still gave us the topic.
    title,
  );
  if (ctx.problems.length > 0) {
    return fail([...new Set(ctx.problems)].slice(0, 3).join("; "));
  }
  if (!root) return fail('"root" must be an object with a "text" and "children"');
  if (root.children.length === 0) {
    return fail('"root.children" must contain at least one branch');
  }

  return { error: undefined, value: { title, root } };
};

const nodeIdSchema = Joi.string().pattern(MINDMAP_ID_PATTERN);

export const expandMindmapNodeSchema = Joi.object({
  nodeId: nodeIdSchema.required(),
  instruction: Joi.string().trim().max(500).allow("").optional(),
});

export const askMindmapSchema = Joi.object({
  question: Joi.string().trim().min(1).max(1000).required().messages({
    "string.empty": "Type a question first",
  }),
  nodeId: nodeIdSchema.allow(null, "").optional(),
  history: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid("user", "assistant").required(),
        content: Joi.string().allow("").max(4000).required(),
      }),
    )
    .max(20)
    .optional(),
});

export const validateExpandMindmapNodeSchema = (data: unknown) =>
  expandMindmapNodeSchema.validate(data, { abortEarly: false });

export const validateAskMindmapSchema = (data: unknown) =>
  askMindmapSchema.validate(data, { abortEarly: false });

/** An editor save: client ids kept, and over-limit trees rejected, not trimmed. */
export const validateMindmapEdit = (data: unknown) =>
  validateMindmapSpec(data, { preserveIds: true, strict: true });

/**
 * Body of `PATCH /documents/:id/spec`. The spec itself is deliberately left
 * opaque here and checked by the format's own validator in the service, since
 * which validator applies depends on the stored document's format.
 */
export const updateDocumentSpecSchema = Joi.object({
  spec: Joi.object().unknown(true).required(),
});

export const validateUpdateDocumentSpecSchema = (data: unknown) =>
  updateDocumentSpecSchema.validate(data, { abortEarly: false });

/** Dispatches to the right validator for the format's spec kind. */
export const validateSpecForKind = (kind: SpecKind, data: unknown) => {
  if (kind === "mindmap") return validateMindmapSpec(data);
  if (kind === "presentation") return validatePresentationSpec(data);
  if (kind === "workbook") return validateWorkbookSpec(data);
  return validateDocumentSpec(data);
};

/* ------------------------------------------------------------------ *
 * Salvage
 * ------------------------------------------------------------------ */

export interface PruneResult {
  /** The spec with invalid entries removed. Unchanged when nothing failed. */
  spec: unknown;
  dropped: number;
  total: number;
  /** Human-readable reason per dropped entry, for the log. */
  reasons: string[];
}

/**
 * Removes the individual entries that fail validation, leaving the rest intact.
 * Blocks for documents and slides, table rows for workbooks.
 *
 * Exists because a whole-spec retry is a *reroll*, not a repair: the model
 * regenerates from scratch and typically returns less content, so two bad
 * blocks out of 150 can cost half the document plus a second full model call.
 * Dropping the bad entries keeps everything else and costs nothing.
 *
 * Only meaningful for entry-level failures a spec missing its title prunes
 * nothing, reports `dropped: 0`, and the caller falls through to a real retry.
 */
export const pruneInvalidEntries = (
  kind: SpecKind,
  data: unknown,
): PruneResult => {
  const reasons: string[] = [];
  let dropped = 0;
  let total = 0;

  const filterWith = (
    schema: Joi.Schema,
    entries: unknown,
    label: string,
  ): unknown[] => {
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry, index) => {
      total += 1;
      const { error } = schema.validate(entry);
      if (!error) return true;
      dropped += 1;
      reasons.push(`${label}[${index}]: ${error.message}`);
      return false;
    });
  };

  const untouched = { spec: data, dropped: 0, total: 0, reasons };
  if (!data || typeof data !== "object") return untouched;

  // The mind-map validator already trims instead of rejecting, so there is
  // never a bad entry to salvage; a failure there is structural.
  if (kind === "mindmap") return untouched;

  if (kind === "presentation") {
    const source = data as { slides?: unknown };
    if (!Array.isArray(source.slides)) return untouched;

    const slides = source.slides.map((slide, slideIndex) => {
      if (!slide || typeof slide !== "object") return slide;
      const typed = slide as { blocks?: unknown };
      return {
        ...typed,
        blocks: filterWith(
          slideBlockSchema,
          typed.blocks,
          `slides[${slideIndex}].blocks`,
        ),
      };
    });
    return { spec: { ...source, slides }, dropped, total, reasons };
  }

  if (kind === "workbook") {
    const source = data as { sheets?: unknown };
    if (!Array.isArray(source.sheets)) return untouched;

    // Rows are the workbook's repeating unit one malformed row out of 200
    // should not force a reroll of the whole sheet.
    const rowSchema = Joi.array().items(cellSchema).max(MAX_SHEET_COLUMNS);
    const sheets = source.sheets.map((sheet, sheetIndex) => {
      if (!sheet || typeof sheet !== "object") return sheet;
      const typed = sheet as { rows?: unknown };
      return {
        ...typed,
        rows: filterWith(
          rowSchema,
          typed.rows,
          `sheets[${sheetIndex}].rows`,
        ),
      };
    });
    return { spec: { ...source, sheets }, dropped, total, reasons };
  }

  const source = data as { blocks?: unknown };
  if (!Array.isArray(source.blocks)) return untouched;
  return {
    spec: { ...source, blocks: filterWith(blockSchema, source.blocks, "blocks") },
    dropped,
    total,
    reasons,
  };
};
