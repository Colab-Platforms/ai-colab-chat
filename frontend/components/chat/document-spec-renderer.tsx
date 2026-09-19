"use client";

import { Fragment } from "react";

/**
 * Mirrors the shapes in `backend/src/modules/document/document.types.ts` and
 * `document.theme.ts`. Kept as a local, minimal copy rather than a shared
 * package — frontend and backend are separate deploys here — but the field
 * names must stay identical to what `GET /documents/:id/spec` returns.
 */
export type SpecKind = "document" | "presentation" | "workbook";

export type CalloutVariant = "info" | "warning" | "success" | "danger";

export type DocumentBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { type: "callout"; variant: CalloutVariant; title?: string; text: string }
  | { type: "keyValue"; items: Array<{ label: string; value: string }> }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "code"; language?: string; code: string }
  | { type: "image"; url: string; caption?: string; width?: "full" | "half" }
  | { type: "divider" }
  | { type: "pageBreak" };

export interface DocumentSpec {
  title: string;
  subtitle?: string;
  author?: string;
  coverPage?: boolean;
  blocks: DocumentBlock[];
}

export interface SlideSpec {
  layout?: "title" | "section" | "content";
  title: string;
  subtitle?: string;
  blocks: DocumentBlock[];
  notes?: string;
}

export interface PresentationSpec {
  title: string;
  subtitle?: string;
  slides: SlideSpec[];
}

export type CellValue = string | number | boolean | null;

export interface SheetColumn {
  header: string;
  type?: "text" | "number" | "currency" | "percent" | "date";
  total?: "sum" | "average" | "count";
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: CellValue[][];
  notes?: string;
}

export interface WorkbookSpec {
  title: string;
  sheets: SheetSpec[];
}

export type AnySpec = DocumentSpec | PresentationSpec | WorkbookSpec;

export interface ThemeTokens {
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
  headingFont: string;
  bodyFont: string;
  baseFontPt: number;
  headingWeight: number;
  tableHeaderBg: string;
  tableHeaderText: string;
}

const CALLOUT_COLORS: Record<CalloutVariant, { bg: string; border: string }> = {
  info: { bg: "#eef4fb", border: "#3b7bbf" },
  warning: { bg: "#fdf6e7", border: "#c98a1b" },
  success: { bg: "#edf7ef", border: "#3d8f52" },
  danger: { bg: "#fdeeee", border: "#c0453f" },
};

function BlockView({ block, tokens }: { block: DocumentBlock; tokens: ThemeTokens }) {
  switch (block.type) {
    case "heading": {
      const sizes = { 1: "20pt", 2: "15pt", 3: "12.5pt" };
      return (
        <div
          style={{
            fontFamily: tokens.headingFont,
            fontWeight: tokens.headingWeight,
            fontSize: sizes[block.level],
            color: block.level === 3 ? tokens.text : tokens.accent,
            margin: "16px 0 8px",
          }}
        >
          {block.text}
        </div>
      );
    }
    case "paragraph":
      return (
        <p style={{ margin: "0 0 10px", lineHeight: 1.55 }}>{block.text}</p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag style={{ margin: "0 0 12px", paddingLeft: 22 }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ marginBottom: 5 }}>
              {item}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div style={{ marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
            <thead>
              <tr>
                {block.columns.map((col, i) => (
                  <th
                    key={i}
                    style={{
                      background: tokens.tableHeaderBg,
                      color: tokens.tableHeaderText,
                      textAlign: "left",
                      padding: "7px 9px",
                      border: `1px solid ${tokens.border}`,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: "6px 9px",
                        border: `1px solid ${tokens.border}`,
                        background: ri % 2 === 1 ? tokens.accentSoft : undefined,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && (
            <p style={{ fontSize: "9pt", color: tokens.muted, fontStyle: "italic", margin: "-8px 0 0" }}>
              {block.caption}
            </p>
          )}
        </div>
      );
    case "callout": {
      const colors = CALLOUT_COLORS[block.variant] ?? CALLOUT_COLORS.info;
      return (
        <div
          style={{
            borderLeft: `4px solid ${colors.border}`,
            background: colors.bg,
            padding: "11px 14px",
            margin: "0 0 14px",
            borderRadius: "0 3px 3px 0",
          }}
        >
          {block.title && (
            <p style={{ fontWeight: 600, margin: "0 0 4px", color: colors.border }}>{block.title}</p>
          )}
          <p style={{ margin: 0 }}>{block.text}</p>
        </div>
      );
    }
    case "keyValue":
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <tbody>
            {block.items.map((item, i) => (
              <tr key={i}>
                <td style={{ color: tokens.muted, fontWeight: 600, width: "32%", padding: "5px 14px 5px 0" }}>
                  {item.label}
                </td>
                <td style={{ padding: "5px 0" }}>{item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "quote":
      return (
        <blockquote
          style={{
            margin: "0 0 14px",
            padding: "4px 0 4px 16px",
            borderLeft: `3px solid ${tokens.border}`,
            color: tokens.muted,
            fontStyle: "italic",
          }}
        >
          {block.text}
          {block.attribution && (
            <span style={{ display: "block", marginTop: 6, fontStyle: "normal", fontSize: "9.5pt" }}>
              — {block.attribution}
            </span>
          )}
        </blockquote>
      );
    case "code":
      return (
        <pre
          style={{
            background: tokens.accentSoft,
            border: `1px solid ${tokens.border}`,
            borderRadius: 3,
            padding: "11px 13px",
            margin: "0 0 14px",
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: "9pt",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {block.code}
        </pre>
      );
    case "image":
      return (
        <figure
          style={{
            margin: "0 0 16px",
            textAlign: "center",
            maxWidth: block.width === "half" ? "50%" : "100%",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.caption ?? ""} style={{ maxWidth: "100%" }} />
          {block.caption && (
            <figcaption style={{ fontSize: "9pt", color: tokens.muted, marginTop: 6 }}>
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "divider":
      return <hr style={{ border: "none", borderTop: `1px solid ${tokens.border}`, margin: "18px 0" }} />;
    case "pageBreak":
      return (
        <div
          style={{
            margin: "18px 0",
            borderTop: `1px dashed ${tokens.border}`,
            textAlign: "center",
            fontSize: "9pt",
            color: tokens.muted,
          }}
        >
          <span style={{ background: "var(--doc-preview-bg, #fff)", padding: "0 8px", position: "relative", top: -8 }}>
            page break
          </span>
        </div>
      );
    default:
      return null;
  }
}

function DocumentPreview({ spec, tokens }: { spec: DocumentSpec; tokens: ThemeTokens }) {
  return (
    <div style={{ fontFamily: tokens.bodyFont, fontSize: `${tokens.baseFontPt}pt`, color: tokens.text }}>
      <div style={{ borderBottom: `2px solid ${tokens.accent}`, paddingBottom: 12, marginBottom: 22 }}>
        <div style={{ fontFamily: tokens.headingFont, fontSize: "22pt", fontWeight: tokens.headingWeight, color: tokens.accent }}>
          {spec.title}
        </div>
        {spec.subtitle && <div style={{ color: tokens.muted, fontSize: "12pt", marginTop: 4 }}>{spec.subtitle}</div>}
      </div>
      {spec.blocks.map((block, i) => (
        <BlockView key={i} block={block} tokens={tokens} />
      ))}
    </div>
  );
}

function PresentationPreview({ spec, tokens }: { spec: PresentationSpec; tokens: ThemeTokens }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {spec.slides.map((slide, i) => (
        <div
          key={i}
          style={{
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: "24px 28px",
            aspectRatio: "16 / 9",
            overflow: "auto",
            background: "var(--doc-preview-bg, #fff)",
          }}
        >
          <div style={{ fontSize: "10px", color: tokens.muted, marginBottom: 8 }}>
            Slide {i + 1}
          </div>
          <div style={{ fontFamily: tokens.headingFont, fontWeight: tokens.headingWeight, fontSize: "18pt", color: tokens.accent, marginBottom: slide.subtitle ? 4 : 12 }}>
            {slide.title}
          </div>
          {slide.subtitle && (
            <div style={{ color: tokens.muted, fontSize: "11pt", marginBottom: 12 }}>{slide.subtitle}</div>
          )}
          <div style={{ fontFamily: tokens.bodyFont, fontSize: "10pt", color: tokens.text }}>
            {slide.blocks.map((block, bi) => (
              <BlockView key={bi} block={block} tokens={tokens} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkbookPreview({ spec, tokens }: { spec: WorkbookSpec; tokens: ThemeTokens }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {spec.sheets.map((sheet, si) => (
        <div key={si}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: tokens.accent }}>{sheet.name}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "9pt", minWidth: "100%" }}>
              <thead>
                <tr>
                  {sheet.columns.map((col, i) => (
                    <th
                      key={i}
                      style={{
                        background: tokens.tableHeaderBg,
                        color: tokens.tableHeaderText,
                        textAlign: col.type === "text" || !col.type ? "left" : "right",
                        padding: "6px 10px",
                        border: `1px solid ${tokens.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: "5px 10px",
                          border: `1px solid ${tokens.border}`,
                          textAlign: sheet.columns[ci]?.type && sheet.columns[ci].type !== "text" ? "right" : "left",
                          background: ri % 2 === 1 ? tokens.accentSoft : undefined,
                        }}
                      >
                        {cell === null || cell === undefined ? "" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders the same JSON spec the backend renderers turn into a real file, as
 * plain HTML. This is intentionally an approximation, not a pixel-exact
 * render of the PDF/DOCX/PPTX/XLSX — the point is to preview and edit
 * content/theme, then let the real renderer produce the actual file.
 */
export function DocumentSpecRenderer({
  specKind,
  spec,
  themeTokens,
}: {
  specKind: SpecKind;
  spec: AnySpec;
  themeTokens: ThemeTokens;
}) {
  return (
    <Fragment>
      {specKind === "presentation" && (
        <PresentationPreview spec={spec as PresentationSpec} tokens={themeTokens} />
      )}
      {specKind === "workbook" && (
        <WorkbookPreview spec={spec as WorkbookSpec} tokens={themeTokens} />
      )}
      {specKind === "document" && (
        <DocumentPreview spec={spec as DocumentSpec} tokens={themeTokens} />
      )}
    </Fragment>
  );
}
