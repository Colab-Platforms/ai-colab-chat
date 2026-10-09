import type { CellValue, ColumnType } from "./document.types.js";

/**
 * Shared by the XLSX and CSV renderers so a coercion rule (or a bug in one)
 * cannot drift between the two — they render the same `WorkbookSpec`, so a
 * cell must convert identically regardless of which file it ends up in.
 *
 * The hard part in a generated spreadsheet is not layout, it is TYPE. A model
 * asked for JSON will happily emit "$1,234.00", "12%" or "1,234" as strings.
 * Written through unchanged, a spreadsheet stores them as text: unsortable,
 * uncountable, and SUM() over the column returns 0. The file looks perfect and
 * is useless. So every cell is coerced against its column's declared type
 * before it is written anywhere.
 */

export type CoercedCell = string | number | boolean | Date | null;

/** Currency symbols we strip when parsing, and may echo back in a format. */
export const CURRENCY_SYMBOLS = ["$", "€", "£", "¥", "₹", "₩", "₽", "R$", "CHF"];

const stripNumeric = (raw: string): string =>
  raw
    .replace(/[\s, ]/g, "")
    .replace(/%/g, "")
    // Accounting negatives: (1,234) means -1234.
    .replace(/^\((.*)\)$/, "-$1");

export const detectCurrencySymbol = (raw: string): string | null =>
  CURRENCY_SYMBOLS.find((symbol) => raw.includes(symbol)) ?? null;

const parseNumeric = (value: CellValue): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let text = value.trim();
  if (!text) return null;

  for (const symbol of CURRENCY_SYMBOLS) text = text.split(symbol).join("");
  const parsed = Number(stripNumeric(text));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: CellValue): Date | null => {
  // No Date branch: this runs on JSON-parsed model output, where a date can
  // only ever have arrived as a string.
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Converts one cell to what the target file should actually store.
 *
 * Anything that cannot be coerced falls back to the original value rather than
 * becoming null — a visibly wrong string beats silently deleting the user's
 * data, and it shows up immediately when they open the file.
 */
export const coerceCell = (value: CellValue, type: ColumnType): CoercedCell => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;

  switch (type) {
    case "number":
    case "currency": {
      const parsed = parseNumeric(value);
      return parsed === null ? (value as string) : parsed;
    }

    case "percent": {
      // The prompt fixes the convention: the model emits the NUMBER OF PERCENT
      // (12.5 meaning 12.5%). A percent format multiplies by 100 for display,
      // so the stored value must be the fraction. Applied uniformly — guessing
      // from magnitude would silently turn "0.5%" into "50%".
      const parsed = parseNumeric(value);
      return parsed === null ? (value as string) : parsed / 100;
    }

    case "date": {
      const parsed = parseDate(value);
      return parsed ?? (value as string);
    }

    case "text":
    default:
      return typeof value === "number" ? String(value) : (value as string);
  }
};
