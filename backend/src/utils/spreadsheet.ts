import ExcelJS from "exceljs";
import readline from "node:readline";
import { Readable } from "node:stream";

type PrimitiveCell = string | number | boolean | null;

export interface SpreadsheetParseOptions {
  requiredColumns?: string[];
  maxPreviewRows?: number;
  maxAiChars?: number;
  maxRowsToParse?: number;
}

export interface SpreadsheetReport {
  sourceFileName: string;
  worksheetName: string;
  headers: string[];
  selectedColumns: string[];
  totalRowsParsed: number;
  isRowLimitHit: boolean;
  previewRows: Array<Record<string, PrimitiveCell>>;
  numericSummary: Record<
    string,
    { count: number; sum: number; min: number; max: number; avg: number }
  >;
  aiText: string;
}

export interface SpreadsheetExcelExportOptions {
  report: SpreadsheetReport;
  outputPath: string;
}

interface ColumnMap {
  name: string;
  index: number;
}

const DEFAULT_MAX_PREVIEW_ROWS = 200;
const DEFAULT_MAX_AI_CHARS = 25_000;
const DEFAULT_MAX_ROWS_TO_PARSE = 3000;

const CSV_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
];

const XLSX_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel",
];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toPrimitiveCell(value: unknown): PrimitiveCell {
  if (value === undefined || value === null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (typeof value === "object") {
    const maybeRichText = value as { richText?: Array<{ text?: string }> };
    if (Array.isArray(maybeRichText.richText)) {
      const combined = maybeRichText.richText
        .map((part) => part.text || "")
        .join("");
      const trimmed = combined.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    const maybeText = String(value).trim();
    return maybeText.length > 0 ? maybeText : null;
  }

  return String(value);
}

function extractColumnMap(
  headers: string[],
  requiredColumns?: string[],
): ColumnMap[] {
  if (!requiredColumns || requiredColumns.length === 0) {
    return headers.map((header, index) => ({ name: header, index }));
  }

  const normalizedHeaders = new Map<string, { name: string; index: number }>();
  headers.forEach((header, index) => {
    normalizedHeaders.set(normalizeHeader(header), { name: header, index });
  });

  return requiredColumns
    .map((required) => normalizedHeaders.get(normalizeHeader(required)))
    .filter((value): value is { name: string; index: number } =>
      Boolean(value),
    );
}

function rowHasContent(values: unknown[]): boolean {
  return values.some((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}

function truncateForAi(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  return `${truncated}\n\n[Spreadsheet report truncated due to token limits.]`;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function buildAiText(
  report: Omit<SpreadsheetReport, "aiText">,
  maxAiChars: number,
): string {
  const lines: string[] = [];

  lines.push(`[Attached Spreadsheet: ${report.sourceFileName}]`);
  lines.push(`Worksheet: ${report.worksheetName}`);
  lines.push(`Rows Parsed: ${report.totalRowsParsed}`);
  if (report.isRowLimitHit) {
    lines.push(
      "Row limit reached: file was partially analyzed to control token usage.",
    );
  }
  lines.push(
    `Columns Used: ${report.selectedColumns.join(", ") || "(none matched)"}`,
  );

  if (report.previewRows.length > 0) {
    lines.push("Preview Rows:");
    lines.push(JSON.stringify(report.previewRows, null, 2));
  }

  const numericColumns = Object.keys(report.numericSummary);
  if (numericColumns.length > 0) {
    lines.push("Numeric Summary:");
    lines.push(JSON.stringify(report.numericSummary, null, 2));
  }

  return truncateForAi(lines.join("\n"), maxAiChars);
}

export function inferRequiredColumnsFromPrompt(prompt: string): string[] {
  if (!prompt) return [];

  const patterns = [
    /(?:columns?|fields?)\s*[:=]\s*([^\n\.]+)/i,
    /(?:include|use|extract)\s+(?:columns?|fields?)\s+([^\n\.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match || !match[1]) continue;

    return match[1]
      .split(/,|\band\b/i)
      .map((value) => value.replace(/["'`]/g, "").trim())
      .filter(Boolean);
  }

  return [];
}

export async function parseSpreadsheetFromUrl(
  url: string,
  fileName: string,
  mimeType: string,
  options: SpreadsheetParseOptions = {},
): Promise<SpreadsheetReport> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch spreadsheet: ${response.status}`);
  }

  const nodeStream = Readable.fromWeb(response.body as any);
  const lowerName = fileName.toLowerCase();
  const isCsv = CSV_MIME_TYPES.includes(mimeType) || lowerName.endsWith(".csv");
  const isXlsx =
    XLSX_MIME_TYPES.includes(mimeType) ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xlsm") ||
    lowerName.endsWith(".xls");

  if (isCsv) {
    return parseCsvStream(nodeStream, fileName, options);
  }

  if (isXlsx) {
    return parseXlsxStream(nodeStream, fileName, options);
  }

  throw new Error("Unsupported spreadsheet format");
}

async function parseCsvStream(
  input: NodeJS.ReadableStream,
  fileName: string,
  options: SpreadsheetParseOptions,
): Promise<SpreadsheetReport> {
  const maxPreviewRows = options.maxPreviewRows ?? DEFAULT_MAX_PREVIEW_ROWS;
  const maxAiChars = options.maxAiChars ?? DEFAULT_MAX_AI_CHARS;
  const maxRowsToParse = options.maxRowsToParse ?? DEFAULT_MAX_ROWS_TO_PARSE;

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let columnMap: ColumnMap[] = [];
  let totalRowsParsed = 0;
  let isRowLimitHit = false;
  const previewRows: Array<Record<string, PrimitiveCell>> = [];
  const numericAccumulator = new Map<
    string,
    { count: number; sum: number; min: number; max: number }
  >();

  for await (const rawLine of rl) {
    const line = rawLine.replace(/^\uFEFF/, "");
    if (!line.trim()) continue;

    const values = parseCsvLine(line);

    if (headers.length === 0) {
      headers = values.map((value, index) => {
        const normalized = String(value).trim();
        return normalized.length > 0 ? normalized : `Column ${index + 1}`;
      });
      columnMap = extractColumnMap(headers, options.requiredColumns);
      continue;
    }

    if (!rowHasContent(values)) continue;

    if (totalRowsParsed >= maxRowsToParse) {
      isRowLimitHit = true;
      break;
    }

    totalRowsParsed += 1;
    const rowObject: Record<string, PrimitiveCell> = {};

    for (const column of columnMap) {
      const primitive = toPrimitiveCell(values[column.index]);
      rowObject[column.name] = primitive;

      if (typeof primitive === "number") {
        const previous = numericAccumulator.get(column.name);
        if (previous) {
          previous.count += 1;
          previous.sum += primitive;
          previous.min = Math.min(previous.min, primitive);
          previous.max = Math.max(previous.max, primitive);
        } else {
          numericAccumulator.set(column.name, {
            count: 1,
            sum: primitive,
            min: primitive,
            max: primitive,
          });
        }
      }
    }

    if (previewRows.length < maxPreviewRows) {
      previewRows.push(rowObject);
    }
  }

  const numericSummary: SpreadsheetReport["numericSummary"] = {};
  for (const [columnName, metrics] of numericAccumulator.entries()) {
    numericSummary[columnName] = {
      ...metrics,
      avg:
        metrics.count > 0
          ? Number((metrics.sum / metrics.count).toFixed(4))
          : 0,
    };
  }

  const baseReport: Omit<SpreadsheetReport, "aiText"> = {
    sourceFileName: fileName,
    worksheetName: "CSV",
    headers,
    selectedColumns: columnMap.map((column) => column.name),
    totalRowsParsed,
    isRowLimitHit,
    previewRows,
    numericSummary,
  };

  return {
    ...baseReport,
    aiText: buildAiText(baseReport, maxAiChars),
  };
}

async function parseXlsxStream(
  input: NodeJS.ReadableStream,
  fileName: string,
  options: SpreadsheetParseOptions,
): Promise<SpreadsheetReport> {
  const maxPreviewRows = options.maxPreviewRows ?? DEFAULT_MAX_PREVIEW_ROWS;
  const maxAiChars = options.maxAiChars ?? DEFAULT_MAX_AI_CHARS;
  const maxRowsToParse = options.maxRowsToParse ?? DEFAULT_MAX_ROWS_TO_PARSE;

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "cache",
    worksheets: "emit",
  });

  let worksheetName = "Sheet1";
  let headers: string[] = [];
  let columnMap: ColumnMap[] = [];
  let totalRowsParsed = 0;
  let isRowLimitHit = false;
  const previewRows: Array<Record<string, PrimitiveCell>> = [];
  const numericAccumulator = new Map<
    string,
    { count: number; sum: number; min: number; max: number }
  >();

  for await (const worksheetReader of workbookReader as any) {
    worksheetName = worksheetReader.name || worksheetName;

    for await (const row of worksheetReader) {
      // row.values from ExcelJS can be a sparse array (blank cells are holes,
      // not explicit undefined) - densify it so .map()/.slice() below don't
      // silently skip indices, which would desync headers from columnMap.
      const rowValues: unknown[] = Array.from((row.values as unknown[]) ?? []);
      const normalizedValues = rowValues.slice(1);

      if (!rowHasContent(normalizedValues)) {
        continue;
      }

      if (headers.length === 0) {
        headers = normalizedValues.map((value, index) => {
          const primitive = toPrimitiveCell(value);
          if (typeof primitive === "string") return primitive;
          if (typeof primitive === "number") return String(primitive);
          return `Column ${index + 1}`;
        });
        columnMap = extractColumnMap(headers, options.requiredColumns);
        continue;
      }

      if (totalRowsParsed >= maxRowsToParse) {
        isRowLimitHit = true;
        break;
      }

      totalRowsParsed += 1;
      const rowObject: Record<string, PrimitiveCell> = {};

      for (const column of columnMap) {
        const primitive = toPrimitiveCell(normalizedValues[column.index]);
        rowObject[column.name] = primitive;

        if (typeof primitive === "number") {
          const previous = numericAccumulator.get(column.name);
          if (previous) {
            previous.count += 1;
            previous.sum += primitive;
            previous.min = Math.min(previous.min, primitive);
            previous.max = Math.max(previous.max, primitive);
          } else {
            numericAccumulator.set(column.name, {
              count: 1,
              sum: primitive,
              min: primitive,
              max: primitive,
            });
          }
        }
      }

      if (previewRows.length < maxPreviewRows) {
        previewRows.push(rowObject);
      }
    }

    // Parse the first worksheet only to stay memory and CPU efficient.
    break;
  }

  const numericSummary: SpreadsheetReport["numericSummary"] = {};
  for (const [columnName, metrics] of numericAccumulator.entries()) {
    numericSummary[columnName] = {
      ...metrics,
      avg:
        metrics.count > 0
          ? Number((metrics.sum / metrics.count).toFixed(4))
          : 0,
    };
  }

  const baseReport: Omit<SpreadsheetReport, "aiText"> = {
    sourceFileName: fileName,
    worksheetName,
    headers,
    selectedColumns: columnMap.map((column) => column.name),
    totalRowsParsed,
    isRowLimitHit,
    previewRows,
    numericSummary,
  };

  return {
    ...baseReport,
    aiText: buildAiText(baseReport, maxAiChars),
  };
}

export async function writeStructuredReportToExcel(
  options: SpreadsheetExcelExportOptions,
): Promise<void> {
  const { report, outputPath } = options;

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outputPath,
    useStyles: true,
    useSharedStrings: true,
  });

  const reportSheet = workbook.addWorksheet("Report");
  const columns = report.selectedColumns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(Math.max(column.length + 4, 14), 36),
  }));

  reportSheet.columns = columns;

  const headerRow = reportSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.commit();

  for (const row of report.previewRows) {
    reportSheet.addRow(row).commit();
  }

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 60 },
  ];

  summarySheet
    .addRow({ metric: "Source File", value: report.sourceFileName })
    .commit();
  summarySheet
    .addRow({ metric: "Worksheet", value: report.worksheetName })
    .commit();
  summarySheet
    .addRow({ metric: "Rows Parsed", value: report.totalRowsParsed })
    .commit();
  summarySheet
    .addRow({
      metric: "Row Limit Hit",
      value: report.isRowLimitHit ? "Yes (partial parse)" : "No",
    })
    .commit();
  summarySheet
    .addRow({
      metric: "Selected Columns",
      value: report.selectedColumns.join(", "),
    })
    .commit();

  for (const [columnName, metrics] of Object.entries(report.numericSummary)) {
    summarySheet
      .addRow({
        metric: `Numeric Summary (${columnName})`,
        value: `count=${metrics.count}, sum=${metrics.sum}, min=${metrics.min}, max=${metrics.max}, avg=${metrics.avg}`,
      })
      .commit();
  }

  await workbook.commit();
}

export const SPREADSHEET_MIME_TYPES = [
  ...new Set([...CSV_MIME_TYPES, ...XLSX_MIME_TYPES]),
];
