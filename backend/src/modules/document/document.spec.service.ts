import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";
import { dlog, dlogBlock, dlogError } from "./document.logger.js";
import {
  pruneInvalidEntries,
  validateSpecForKind,
} from "./document.validators.js";
import {
  isPresentationSpec,
  isWorkbookSpec,
  MAX_BLOCKS,
  MAX_BLOCKS_PER_SLIDE,
  MAX_NOTES_CHARS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_NAME_CHARS,
  MAX_SHEET_ROWS,
  MAX_SHEETS,
  MAX_SLIDES,
  MAX_SOURCE_TEXT_CHARS,
  type AnySpec,
  type SpecKind,
} from "./document.types.js";

// Pinned independently of the chat model the client selected: document
// structure quality should not swing based on which model the user picked for
// conversation. Overridable per-deployment, and a future change can honour the
// client-supplied model id instead.
//
// Read per call, NOT captured at module load — a module-level const would be
// frozen at import time, which silently ignores any later override and makes
// per-model comparison impossible.
const getSpecModel = () =>
  process.env.DOCUMENT_SPEC_MODEL ?? "google/gemini-2.5-flash";
const SPEC_MAX_TOKENS = Number(process.env.DOCUMENT_SPEC_MAX_TOKENS ?? 8000);
const MAX_SPEC_ATTEMPTS = 2;

/**
 * How much of a spec may be discarded before salvaging stops being honest.
 *
 * Below this, dropping the bad blocks loses less content than a reroll would.
 * Above it, the model misunderstood the schema broadly and the right answer is
 * to ask again with the (now specific) error fed back.
 */
const MAX_SALVAGE_RATIO = Number(
  process.env.DOCUMENT_SALVAGE_MAX_RATIO ?? 0.05,
);

const DOCUMENT_SYSTEM_PROMPT = `You are a document composition engine. You convert a user's request into a structured document specification that a rendering engine turns into a PDF.

Return ONLY a JSON object matching this schema:

{
  "title": string,                      // required, max 200 chars
  "subtitle": string,                   // optional
  "author": string,                     // optional
  "coverPage": boolean,                 // optional, default false. Use true for formal reports/proposals.
  "showPageNumbers": boolean,           // optional, default true
  "blocks": Block[]                     // required, 1..${MAX_BLOCKS} items
}

Block is one of:
  { "type": "heading", "level": 1|2|3, "text": string }
  { "type": "paragraph", "text": string }
  { "type": "list", "ordered": boolean, "items": string[] }
  { "type": "table", "columns": string[], "rows": string[][], "caption": string }
  { "type": "callout", "variant": "info"|"warning"|"success"|"danger", "title": string, "text": string }
  { "type": "keyValue", "items": [{ "label": string, "value": string }] }
  { "type": "quote", "text": string, "attribution": string }
  { "type": "code", "language": string, "code": string }
  { "type": "image", "url": string, "caption": string, "width": "full"|"half" }
  { "type": "divider" }
  { "type": "pageBreak" }

Hard rules:
- Output raw JSON only. No markdown fences, no commentary.
- NEVER emit HTML, CSS, colours, fonts, sizes, or any styling. The renderer owns all visual design. Your job is meaning and structure only.
- Do not use markdown syntax inside text fields (no **bold**, no # headings, no | tables). Use the block types instead — a heading is a heading block, a table is a table block.
- Every table row must have exactly as many cells as there are columns.
- Only include an "image" block if the user's material supplies a real https:// image URL. Never invent one.
- Use "pageBreak" sparingly, to separate major sections of long documents.
- Prefer tables and keyValue blocks over prose when presenting structured facts.
- Write in a clear, professional register. Do not address the user or mention that you are an AI.`;

const PRESENTATION_SYSTEM_PROMPT = `You are a presentation composition engine. You convert a user's request into a structured slide deck specification that a rendering engine turns into a PowerPoint file.

Return ONLY a JSON object matching this schema:

{
  "title": string,                      // required, deck title, max 200 chars
  "subtitle": string,                   // optional
  "author": string,                     // optional
  "slides": Slide[]                     // required, 1..${MAX_SLIDES} items
}

Slide is:
{
  "layout": "title" | "section" | "content",   // optional, default "content"
  "title": string,                             // required (may be "" on a title slide)
  "subtitle": string,                          // optional
  "blocks": Block[],                           // 0..${MAX_BLOCKS_PER_SLIDE} items
  "notes": string                              // optional speaker notes, max ${MAX_NOTES_CHARS} chars
}

Block is one of:
  { "type": "paragraph", "text": string }
  { "type": "list", "ordered": boolean, "items": string[] }
  { "type": "table", "columns": string[], "rows": string[][], "caption": string }
  { "type": "callout", "variant": "info"|"warning"|"success"|"danger", "title": string, "text": string }
  { "type": "keyValue", "items": [{ "label": string, "value": string }] }
  { "type": "quote", "text": string, "attribution": string }
  { "type": "code", "language": string, "code": string }
  { "type": "image", "url": string, "caption": string, "width": "full"|"half" }

Hard rules:
- Output raw JSON only. No markdown fences, no commentary.
- NEVER emit HTML, CSS, colours, fonts, sizes, or any styling. The renderer owns all visual design.
- Do not use markdown syntax inside text fields. Use the block types instead.
- There is no "heading" block: the slide's own title is the heading.
- Every table row must have exactly as many cells as there are columns.
- Only include an "image" block if the user's material supplies a real https:// image URL. Never invent one.

Composition rules — these are what separate a deck from a sliced-up document:
- A slide is a BOUNDED space. One idea per slide. Prefer 1-2 blocks per slide; never fill all ${MAX_BLOCKS_PER_SLIDE}.
- Bullets are fragments, not sentences. Aim for under 100 characters each, and at most 6 per slide. Split a longer list across consecutive slides.
- The FIRST slide must be layout "title", carrying the deck title and subtitle, with no blocks.
- Use layout "section" for a divider slide that opens a major part — title only, no blocks.
- Slide titles are statements, not labels: "Revenue grew 40% in Q3" beats "Revenue".
- Put the detail a presenter would SAY in "notes", not on the slide. A slide the audience must read in full is a failed slide.
- Tables on slides must be small — at most 5 columns and 8 rows. Summarise rather than dump.`;

const WORKBOOK_SYSTEM_PROMPT = `You are a spreadsheet composition engine. You convert a user's request into a structured workbook specification that a rendering engine turns into a spreadsheet file (Excel or CSV).

Return ONLY a JSON object matching this schema:

{
  "title": string,                      // required, max 200 chars
  "author": string,                     // optional
  "sheets": Sheet[]                     // required, 1..${MAX_SHEETS} items
}

Sheet is:
{
  "name": string,                       // required, max ${MAX_SHEET_NAME_CHARS} chars, must NOT contain [ ] : * ? / \\
  "columns": Column[],                  // required, 1..${MAX_SHEET_COLUMNS}
  "rows": Cell[][],                     // required, 0..${MAX_SHEET_ROWS} rows
  "freezeHeader": boolean,              // optional, default true
  "notes": string                       // optional, max 1000 chars
}

Column is:
{
  "header": string,                                                   // required
  "type": "text"|"number"|"currency"|"percent"|"date",                // optional, default "text"
  "width": number,                                                    // optional, characters
  "total": "sum"|"average"|"count"                                    // optional, adds a totals row
}

Cell is a string, a number, a boolean, or null. null means an empty cell.

Hard rules:
- Output raw JSON only. No markdown fences, no commentary.
- NEVER write formulas. Do not emit any value starting with "=". To total a column, set "total" on that column and the renderer writes the formula.
- Every row must have exactly as many cells as the sheet has columns. Use null for blanks.
- Emit numbers as JSON NUMBERS, not strings. Write 1234.5, never "1,234.50" and never "$1,234.50". The column "type" controls how it is displayed.
- For "percent" columns emit the NUMBER OF PERCENT: write 12.5 to mean 12.5%. Do not write 0.125.
- For "date" columns use ISO format: "2026-08-12".
- Sheet names must be unique and describe their contents ("Revenue by Quarter", not "Sheet1").

Choosing what goes in the spreadsheet:
- NEVER invent numeric data. If the source material contains no figures, build the correct column headers and leave the rows empty (or omit rows entirely) so the user has a template to fill in. A spreadsheet of plausible-looking invented numbers is worse than an empty one, because numbers in a grid look authoritative.
- You may always derive columns and labels from the material; the prohibition is on fabricating VALUES that were not given to you.
- If the source is not already tabular — an article, an explanation, a process — find the genuinely tabular structure inside it: entities and their attributes, steps and their descriptions, options and their trade-offs, terms and their definitions.
- Do NOT pour paragraphs into cells. A cell holds a value or a short phrase, not prose.
- Prefer several focused sheets over one wide sheet when the material covers distinct subjects.
- Set "total" only on columns where a sum, average or count is genuinely meaningful. Never total an identifier, a year, or a percentage.`;

const buildUserContent = (
  kind: SpecKind,
  prompt: string,
  sourceText?: string | null,
): string => {
  const noun =
    kind === "presentation"
      ? "presentation"
      : kind === "workbook"
        ? "spreadsheet"
        : "document";
  const trimmedSource = sourceText?.trim();
  if (!trimmedSource) {
    return `Create a ${noun} for this request:\n\n${prompt}`;
  }

  return [
    `Create a ${noun} for this request:\n\n${prompt}`,
    ``,
    `Base the ${noun} on the following source material. Do not invent facts that contradict it:`,
    ``,
    trimmedSource.slice(0, MAX_SOURCE_TEXT_CHARS),
  ].join("\n");
};

const parseJsonLoosely = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    // Some models still wrap JSON in fences despite response_format. Fall back
    // to the outermost braces before giving up.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model did not return parseable JSON");
    }
    return JSON.parse(raw.slice(start, end + 1));
  }
};

export interface GeneratedSpecResult {
  spec: AnySpec;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Asks the model for a spec of the given kind and validates it.
 *
 * Validation failures are retried once with the specific error fed back, which
 * is the whole reason the spec is JSON rather than markup — a bad response is
 * detectable and correctable instead of silently rendering as a broken PDF.
 */
export const generateSpec = async (
  kind: SpecKind,
  prompt: string,
  sourceText?: string | null,
): Promise<GeneratedSpecResult> => {
  let userContent = buildUserContent(kind, prompt, sourceText);
  let promptTokens = 0;
  let completionTokens = 0;
  let lastError = "";

  const systemPrompt =
    kind === "presentation"
      ? PRESENTATION_SYSTEM_PROMPT
      : kind === "workbook"
        ? WORKBOOK_SYSTEM_PROMPT
        : DOCUMENT_SYSTEM_PROMPT;
  const model = getSpecModel();

  for (let attempt = 1; attempt <= MAX_SPEC_ATTEMPTS; attempt += 1) {
    const started = Date.now();

    dlogBlock(
      "spec:request",
      `attempt ${attempt}/${MAX_SPEC_ATTEMPTS} model=${model} → OpenRouter`,
      {
        model,
        temperature: 0.3,
        max_tokens: SPEC_MAX_TOKENS,
        response_format: { type: "json_object" },
        specKind: kind,
        systemPrompt: `${systemPrompt.slice(0, 300)}… [${systemPrompt.length} chars]`,
        userContent,
      },
    );

    const completion = await createOpenRouterJsonCompletion({
      model,
      systemPrompt,
      userContent,
      max_tokens: SPEC_MAX_TOKENS,
      temperature: 0.3,
    });

    promptTokens += completion?.usage?.prompt_tokens ?? 0;
    completionTokens += completion?.usage?.completion_tokens ?? 0;

    const raw = completion?.choices?.[0]?.message?.content;

    dlogBlock("spec:response", `raw reply in ${Date.now() - started}ms`, {
      finishReason: completion?.choices?.[0]?.finish_reason,
      usage: completion?.usage,
      contentLength: raw?.length ?? 0,
      content: raw,
    });

    // finish_reason "length" means the spec was cut off mid-JSON — the most
    // common failure on models with a low output ceiling, and one that looks
    // like a bad model unless it is called out explicitly.
    if (completion?.choices?.[0]?.finish_reason === "length") {
      dlog(
        "spec:warn",
        `output hit the ${SPEC_MAX_TOKENS}-token ceiling — JSON is likely truncated. Raise DOCUMENT_SPEC_MAX_TOKENS or use a model with a larger output limit.`,
      );
    }

    if (!raw) {
      lastError = "Model returned an empty response";
      dlog("spec:parse", "FAILED — empty content");
      continue;
    }

    try {
      const parsed = parseJsonLoosely(raw);
      dlog("spec:parse", `JSON parsed OK → validating as a ${kind} spec`);

      let { error, value } = validateSpecForKind(kind, parsed);
      let salvaged = 0;

      // Before spending a whole second call, try dropping just the blocks that
      // failed. A retry regenerates the document from scratch and usually
      // comes back shorter, so salvaging a handful of bad blocks preserves
      // more content than the "fix" would.
      if (error) {
        const prune = pruneInvalidEntries(kind, parsed);
        const ratio = prune.total > 0 ? prune.dropped / prune.total : 1;

        if (prune.dropped > 0 && ratio <= MAX_SALVAGE_RATIO) {
          const retried = validateSpecForKind(kind, prune.spec);
          if (!retried.error) {
            error = retried.error;
            value = retried.value;
            salvaged = prune.dropped;
            dlogBlock(
              "spec:salvage",
              `dropped ${prune.dropped}/${prune.total} invalid block(s) (${(ratio * 100).toFixed(1)}%) instead of re-asking`,
              { reasons: prune.reasons.slice(0, 5) },
            );
          }
        } else if (prune.dropped > 0) {
          dlog(
            "spec:salvage",
            `NOT salvaging — ${prune.dropped}/${prune.total} blocks invalid (${(ratio * 100).toFixed(1)}%) exceeds the ${(MAX_SALVAGE_RATIO * 100).toFixed(0)}% threshold`,
          );
        }
      }

      if (!error) {
        const spec = value as AnySpec;
        const blocks = isWorkbookSpec(spec)
          ? []
          : isPresentationSpec(spec)
            ? spec.slides.flatMap((slide) => slide.blocks)
            : spec.blocks;
        const blockCounts = blocks.reduce<Record<string, number>>((acc, b) => {
          acc[b.type] = (acc[b.type] ?? 0) + 1;
          return acc;
        }, {});

        dlogBlock(
          "spec:valid",
          `spec accepted on attempt ${attempt}${salvaged ? ` (after salvaging ${salvaged} entr${salvaged === 1 ? "y" : "ies"})` : ""}`,
          {
            kind,
            salvagedEntries: salvaged,
            title: spec.title,
            ...(isWorkbookSpec(spec)
              ? {
                  totalSheets: spec.sheets.length,
                  sheets: spec.sheets.map((sheet) => ({
                    name: sheet.name,
                    columns: sheet.columns.length,
                    rows: sheet.rows.length,
                  })),
                }
              : isPresentationSpec(spec)
                ? {
                    subtitle: spec.subtitle,
                    totalSlides: spec.slides.length,
                    slideTitles: spec.slides.map((slide) => slide.title),
                  }
                : { subtitle: spec.subtitle, coverPage: spec.coverPage }),
            totalBlocks: blocks.length,
            blockCounts,
            promptTokens,
            completionTokens,
          },
        );
        return { spec, promptTokens, completionTokens };
      }

      lastError = error.message;
      dlogError("spec:invalid", `schema rejected attempt ${attempt}`, error);
    } catch (parseError: any) {
      lastError = String(parseError?.message ?? parseError);
      dlogError("spec:parse", `could not parse attempt ${attempt}`, parseError);
    }

    if (attempt < MAX_SPEC_ATTEMPTS) {
      dlog("spec:retry", `re-asking with the validation error fed back`);
    }

    userContent = [
      buildUserContent(kind, prompt, sourceText),
      ``,
      `Your previous response was rejected by the schema validator with this error:`,
      lastError,
      ``,
      `Return corrected JSON that satisfies the schema exactly.`,
    ].join("\n");
  }

  throw new Error(`Could not produce a valid ${kind} spec: ${lastError}`);
};
