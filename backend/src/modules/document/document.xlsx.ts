import ExcelJS from "exceljs";
import { dlog } from "./document.logger.js";
import { getThemeTokens, type ThemeTokens } from "./document.theme.js";
import { coerceCell, detectCurrencySymbol } from "./document.cellCoercion.js";
import {
  ILLEGAL_SHEET_NAME_CHARS,
  MAX_SHEET_NAME_CHARS,
  type ColumnType,
  type DocumentTheme,
  type SheetColumn,
  type SheetSpec,
  type WorkbookSpec,
} from "./document.types.js";

/**
 * Renders a validated WorkbookSpec to an .xlsx buffer.
 *
 * The hard part here is not layout, it is TYPE. A model asked for JSON will
 * happily emit "$1,234.00", "12%" or "1,234" as strings. Written through
 * unchanged, Excel stores them as text: left-aligned, unsortable, and SUM()
 * over the column returns 0. The file looks perfect and is useless. So every
 * cell is coerced against its column's declared type before it is written, and
 * presentation is handled by a number *format* rather than by baking symbols
 * into the value. Coercion itself lives in document.cellCoercion.ts, shared
 * with the CSV renderer so the two cannot drift.
 *
 * Formulas are generated here from a column's declarative `total`, never taken
 * from the model — same principle as the renderer owning HTML for PDFs.
 */

const numberFormatFor = (
  type: ColumnType,
  currencySymbol: string | null,
): string | undefined => {
  switch (type) {
    case "number":
      return "#,##0.##";
    case "currency":
      return currencySymbol
        ? `"${currencySymbol}"#,##0.00`
        : "#,##0.00";
    case "percent":
      return "0.0%";
    case "date":
      return "yyyy-mm-dd";
    default:
      return undefined;
  }
};

/* ------------------------------------------------------------------ *
 * Sheet naming
 * ------------------------------------------------------------------ */

/**
 * Excel rejects names over 31 chars, containing []:*?/\, or duplicated — and
 * it does so by declaring the whole workbook corrupt and "repairing" it, which
 * loses content silently. The validator catches the common cases; this is the
 * last line of defence.
 */
const safeSheetName = (raw: string, taken: Set<string>): string => {
  const cleaned =
    raw
      .replace(ILLEGAL_SHEET_NAME_CHARS, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_SHEET_NAME_CHARS) || "Sheet";

  if (!taken.has(cleaned.toLowerCase())) {
    taken.add(cleaned.toLowerCase());
    return cleaned;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const tag = ` (${suffix})`;
    const candidate =
      cleaned.slice(0, MAX_SHEET_NAME_CHARS - tag.length) + tag;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }

  const fallback = `Sheet ${taken.size + 1}`;
  taken.add(fallback.toLowerCase());
  return fallback;
};

/* ------------------------------------------------------------------ *
 * Sheets
 * ------------------------------------------------------------------ */

const argb = (color: string): string =>
  `FF${color.replace(/^#/, "").toUpperCase()}`;

const columnWidth = (
  column: SheetColumn,
  values: Array<string | number | boolean | Date | null>,
): number => {
  if (column.width) return column.width;

  const longestValue = values.reduce<number>((longest, value) => {
    if (value === null) return longest;
    const length =
      value instanceof Date ? 10 : String(value).slice(0, 200).length;
    return Math.max(longest, length);
  }, 0);

  return Math.min(Math.max(column.header.length + 4, longestValue + 3, 10), 50);
};

const addSheet = (
  workbook: ExcelJS.Workbook,
  sheetSpec: SheetSpec,
  t: ThemeTokens,
  taken: Set<string>,
): void => {
  const name = safeSheetName(sheetSpec.name, taken);
  const sheet = workbook.addWorksheet(name);
  const columns = sheetSpec.columns;

  // Coerce everything up front: widths and the currency symbol both depend on
  // the converted values, not the raw ones.
  const coerced = sheetSpec.rows.map((row) =>
    columns.map((column, index) =>
      // Pad or trim — a ragged row would otherwise shift every later cell into
      // the wrong column, which is worse than a blank.
      coerceCell(row?.[index] ?? null, column.type ?? "text"),
    ),
  );

  const currencySymbols = columns.map((column, index) => {
    if (column.type !== "currency") return null;
    for (const row of sheetSpec.rows) {
      const raw = row?.[index];
      if (typeof raw === "string") {
        const symbol = detectCurrencySymbol(raw);
        if (symbol) return symbol;
      }
    }
    return null;
  });

  sheet.columns = columns.map((column, index) => ({
    header: column.header,
    key: `c${index}`,
    width: columnWidth(
      column,
      coerced.map((row) => row[index]),
    ),
    style: {
      numFmt: numberFormatFor(column.type ?? "text", currencySymbols[index]),
      alignment: {
        vertical: "top",
        horizontal:
          column.type && column.type !== "text"
            ? ("right" as const)
            : ("left" as const),
        wrapText: (column.type ?? "text") === "text",
      },
    },
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: argb(t.tableHeaderText) } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: argb(t.tableHeaderBg) },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 20;

  for (const row of coerced) sheet.addRow(row);

  // Totals row. The formula is built here from the column's declarative
  // `total`; the model never writes Excel syntax.
  const hasTotals = columns.some((column) => column.total);
  if (hasTotals && coerced.length > 0) {
    const firstDataRow = 2;
    const lastDataRow = coerced.length + 1;
    const totalsRow = sheet.getRow(lastDataRow + 1);

    columns.forEach((column, index) => {
      const cell = totalsRow.getCell(index + 1);
      if (!column.total) {
        // Label the row once, in the first column that has no total of its own.
        if (index === 0) cell.value = "Total";
        return;
      }
      const letter = sheet.getColumn(index + 1).letter;
      const range = `${letter}${firstDataRow}:${letter}${lastDataRow}`;
      const fn =
        column.total === "average"
          ? "AVERAGE"
          : column.total === "count"
            ? "COUNT"
            : "SUM";
      cell.value = { formula: `${fn}(${range})` } as ExcelJS.CellFormulaValue;

      // COUNT yields a plain count even on a currency column, so it must not
      // inherit that column's currency format.
      const totalFormat =
        column.total === "count"
          ? "#,##0"
          : numberFormatFor(column.type ?? "number", currencySymbols[index]);
      if (totalFormat) cell.numFmt = totalFormat;
    });

    totalsRow.font = { bold: true };
    totalsRow.border = {
      top: { style: "thin", color: { argb: argb(t.border) } },
    };
    totalsRow.commit();
  }

  if (sheetSpec.freezeHeader !== false) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  if (columns.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  // Notes go on A1 as a comment rather than as a row, so they cannot be
  // mistaken for data or break sorting and filtering.
  if (sheetSpec.notes) {
    sheet.getCell("A1").note = sheetSpec.notes;
  }
};

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export const renderSpecToXlsx = async (
  spec: WorkbookSpec,
  theme: DocumentTheme,
): Promise<Buffer> => {
  const t = getThemeTokens(theme);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = spec.author || "AI Colab Chat";
  workbook.created = new Date();
  workbook.title = spec.title;

  dlog(
    "xlsx",
    `theme=${theme} sheets=${spec.sheets.length} rows=${spec.sheets.reduce((n, s) => n + s.rows.length, 0)} — building workbook`,
  );

  const taken = new Set<string>();
  for (const sheetSpec of spec.sheets) {
    addSheet(workbook, sheetSpec, t, taken);
  }

  const data = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  dlog("xlsx", `packed ${data.byteLength} bytes`);
  return Buffer.from(data);
};
