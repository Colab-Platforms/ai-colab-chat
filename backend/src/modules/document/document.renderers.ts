import { renderSpecToPdf } from "./document.pdf.js";
import { renderSpecToDocx } from "./document.docx.js";
import { renderSpecToPptx } from "./document.pptx.js";
import { renderSpecToXlsx } from "./document.xlsx.js";
import { renderSpecToCsv } from "./document.csv.js";
import {
  DOCUMENT_FORMATS,
  type AnyTheme,
  type DocumentFormat,
  type DocumentSpec,
  type DocumentTheme,
  type PresentationSpec,
  type WorkbookSpec,
} from "./document.types.js";

/**
 * A renderer turns a validated spec into the bytes of one file format.
 *
 * Every format shares the same `DocumentSpec` input on purpose — the spec is
 * the contract with the model, so adding a format must never mean adding a
 * second thing for the model to learn.
 */
/**
 * A renderer, tagged with the spec shape it consumes.
 *
 * Tagged rather than widened to a union parameter so the worker has to narrow
 * before calling — handing a `DocumentSpec` to the PPTX renderer would
 * otherwise typecheck and fail at runtime on `spec.slides`.
 */
export type RendererEntry =
  | {
      kind: "document";
      render: (spec: DocumentSpec, theme: DocumentTheme) => Promise<Buffer>;
    }
  | {
      kind: "presentation";
      render: (spec: PresentationSpec, theme: AnyTheme) => Promise<Buffer>;
    }
  | {
      kind: "workbook";
      render: (spec: WorkbookSpec, theme: DocumentTheme) => Promise<Buffer>;
    };

/**
 * The single source of truth for "which formats can we actually produce".
 *
 * Deliberately `Partial`: the Prisma enum lists all four formats, but only the
 * ones registered here are real. Everything else in the pipeline asks this map
 * rather than assuming — which is what stops "make me an excel" from quietly
 * handing back a PDF. Implementing a format means adding one line here.
 */
const RENDERERS: Partial<Record<DocumentFormat, RendererEntry>> = {
  PDF: { kind: "document", render: renderSpecToPdf },
  DOCX: { kind: "document", render: renderSpecToDocx },
  PPTX: { kind: "presentation", render: renderSpecToPptx },
  XLSX: { kind: "workbook", render: renderSpecToXlsx },
  CSV: { kind: "workbook", render: renderSpecToCsv },
};

export const isFormatSupported = (format: DocumentFormat): boolean =>
  Boolean(RENDERERS[format]);

export const getRenderer = (format: DocumentFormat): RendererEntry | null =>
  RENDERERS[format] ?? null;

export const getSupportedFormats = (): DocumentFormat[] =>
  DOCUMENT_FORMATS.filter(isFormatSupported);

/**
 * The format actually used when the user asks for one we cannot produce yet.
 *
 * PDF is the fallback because it is the only format guaranteed to be
 * registered. Callers must disclose the substitution to the user rather than
 * silently swapping — an undisclosed swap is the exact failure this registry
 * exists to prevent.
 */
export const FALLBACK_FORMAT: DocumentFormat = "PDF";

export const resolveRenderableFormat = (
  requested: DocumentFormat,
): { format: DocumentFormat; substituted: boolean } =>
  isFormatSupported(requested)
    ? { format: requested, substituted: false }
    : { format: FALLBACK_FORMAT, substituted: true };
