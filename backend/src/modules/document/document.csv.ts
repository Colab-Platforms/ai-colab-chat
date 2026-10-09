import { dlog } from "./document.logger.js";
import { coerceCell, type CoercedCell } from "./document.cellCoercion.js";
import type {
  ColumnTotal,
  ColumnType,
  DocumentTheme,
  SheetSpec,
  WorkbookSpec,
} from "./document.types.js";

/**
 * Renders a validated WorkbookSpec to a CSV buffer.
 *
 * CSV has no concept of multiple sheets, cell formats, or formulas â€” it is a
 * single flat grid of text. Formulas are computed here as static numbers
 * (there is no engine to recalculate them on open), and formatting choices
 * (percent as "12.5%", a plain number for currency) are baked into the text
 * itself rather than attached as a display format, because there is nowhere
 * else to put them.
 *
 * Shares `coerceCell` with the XLSX renderer so a value converts identically
 * regardless of which file it ends up in â€” only the *output representation*
 * differs here, not the parsing.
 */

const RFC4180_SPECIAL = /[",\r\n]/;

const escapeCsvField = (raw: string): string =>
  RFC4180_SPECIAL.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;

/** Trims trailing zeros from a fixed-point string without leaving a bare ".". */
const trimTrailingZeros = (fixed: string): string =>
  fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

const formatCellForCsv = (value: CoercedCell, type: ColumnType): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (type === "percent" && typeof value === "number") {
    // Cells hold the fraction (0.125); CSV has no display format to lean on,
    // so the human-facing "12.5%" convention is written directly into the text.
    return `${trimTrailingZeros((value * 100).toFixed(2))}%`;
  }

  return String(value);
};

const computeTotal = (values: number[], kind: ColumnTotal): number => {
  if (kind === "count") return values.length;
  if (values.length === 0) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  return kind === "average" ? sum / values.length : sum;
};

const sheetToCsvLines = (sheet: SheetSpec): string[] => {
  const columns = sheet.columns;
  const lines: string[] = [
    columns.map((column) => escapeCsvField(column.header)).join(","),
  ];

  const coercedRows = sheet.rows.map((row) =>
    columns.map((column, index) =>
      // Pad or trim â€” same reasoning as the XLSX renderer: a ragged row must
      // not shift later cells into the wrong column.
      coerceCell(row?.[index] ?? null, column.type ?? "text"),
    ),
  );

  for (const row of coercedRows) {
    lines.push(
      row
        .map((value, index) =>
          escapeCsvField(formatCellForCsv(value, columns[index].type ?? "text")),
        )
        .join(","),
    );
  }

  const hasTotals = columns.some((column) => column.total);
  if (hasTotals && coercedRows.length > 0) {
    const totalsLine = columns.map((column, index) => {
      if (!column.total) return index === 0 ? "Total" : "";
      const numericValues = coercedRows
        .map((row) => row[index])
        .filter((value): value is number => typeof value === "number");
      const total = computeTotal(numericValues, column.total);
      return formatCellForCsv(total, column.type ?? "number");
    });
    lines.push(totalsLine.map(escapeCsvField).join(","));
  }

  return lines;
};

export const renderSpecToCsv = async (
  spec: WorkbookSpec,
  /**
   * Unused â€” CSV carries no colour, font or number format. Kept so this
   * renderer has the same signature as every other format's, which is what
   * lets the worker call it generically through the RendererEntry registry.
   */
  _theme: DocumentTheme,
): Promise<Buffer> => {
  if (spec.sheets.length === 0) {
    throw new Error("Workbook spec has no sheets to export as CSV");
  }

  const sheet = spec.sheets[0];
  if (spec.sheets.length > 1) {
    // Dropped rather than concatenated: multiple tables jammed into one CSV
    // with ad-hoc separators would not be valid CSV, and a reader (Excel,
    // pandas, Sheets) would silently misparse it. Dropping and logging is the
    // same choice the PDF renderer makes for a disallowed image.
    dlog(
      "csv",
      `spec has ${spec.sheets.length} sheets â€” CSV holds one flat table, exporting "${sheet.name}" only and dropping the rest`,
    );
  }

  dlog(
    "csv",
    `sheet="${sheet.name}" rows=${sheet.rows.length} columns=${sheet.columns.length} â€” building CSV`,
  );

  const lines = sheetToCsvLines(sheet);

  // BOM: without it, Excel guesses the wrong encoding for any non-ASCII byte
  // (currency symbols, accented names) and shows mojibake. CRLF: the RFC4180
  // and Excel-native line ending, safer than bare "\n" on Windows. Written as
  // an escape, not a literal character, so it cannot be silently stripped or
  // mangled by an editor's encoding.
  const UTF8_BOM = "\uFEFF";
  const body = UTF8_BOM + lines.join("\r\n") + "\r\n";
  const buffer = Buffer.from(body, "utf8");
  dlog("csv", `packed ${buffer.length} bytes`);
  return buffer;
};
