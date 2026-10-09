import type { DocumentTheme } from "./document.types.js";


export interface ThemeTokens {
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
  /** CSS font stacks — used by the HTML/PDF renderer. */
  headingFont: string;
  bodyFont: string;
  /**
   * Single concrete font names, for renderers that cannot express a fallback
   * stack. Word resolves one name per run, so a CSS stack would be written
   * into the file verbatim and resolve to nothing.
   */
  headingFontName: string;
  bodyFontName: string;
  monoFontName: string;
  baseFontPt: number;
  headingWeight: number;
  tableHeaderBg: string;
  tableHeaderText: string;
}

const THEME_TOKENS: Record<DocumentTheme, ThemeTokens> = {
  professional: {
    accent: "#1f4e78",
    accentSoft: "#eaf1f8",
    text: "#1a202c",
    muted: "#5a6473",
    border: "#d6dde5",
    headingFont: `"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
    bodyFont: `"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
    headingFontName: "Segoe UI",
    bodyFontName: "Segoe UI",
    monoFontName: "Consolas",
    baseFontPt: 11,
    headingWeight: 600,
    tableHeaderBg: "#1f4e78",
    tableHeaderText: "#ffffff",
  },
  minimal: {
    accent: "#111111",
    accentSoft: "#f4f4f4",
    text: "#1a1a1a",
    muted: "#6b6b6b",
    border: "#e0e0e0",
    headingFont: `"Helvetica Neue", Arial, sans-serif`,
    bodyFont: `"Helvetica Neue", Arial, sans-serif`,
    // Arial rather than Helvetica Neue: Word must resolve a single name, and
    // Helvetica Neue is absent on most Windows installs.
    headingFontName: "Arial",
    bodyFontName: "Arial",
    monoFontName: "Consolas",
    baseFontPt: 10.5,
    headingWeight: 600,
    tableHeaderBg: "#f4f4f4",
    tableHeaderText: "#111111",
  },
  report: {
    accent: "#0f766e",
    accentSoft: "#e6f4f1",
    text: "#14231f",
    muted: "#55665f",
    border: "#cfe0db",
    headingFont: `Georgia, "Times New Roman", serif`,
    bodyFont: `Georgia, "Times New Roman", serif`,
    headingFontName: "Georgia",
    bodyFontName: "Georgia",
    monoFontName: "Consolas",
    baseFontPt: 11,
    headingWeight: 700,
    tableHeaderBg: "#0f766e",
    tableHeaderText: "#ffffff",
  },
};

const CALLOUT_COLORS: Record<string, { bg: string; border: string }> = {
  info: { bg: "#eef4fb", border: "#3b7bbf" },
  warning: { bg: "#fdf6e7", border: "#c98a1b" },
  success: { bg: "#edf7ef", border: "#3d8f52" },
  danger: { bg: "#fdeeee", border: "#c0453f" },
};

/**
 * The theme as raw tokens, for renderers that are not CSS-based.
 *
 * A theme is a set of design decisions, not a stylesheet — each renderer
 * expresses the same tokens in its own medium. Sharing the tokens is what
 * keeps a "report" PDF and a "report" Word file recognisably the same theme.
 */
export const getThemeTokens = (theme: DocumentTheme): ThemeTokens =>
  THEME_TOKENS[theme] ?? THEME_TOKENS.professional;

export const getCalloutColors = (
  variant: string,
): { bg: string; border: string } => CALLOUT_COLORS[variant] ?? CALLOUT_COLORS.info;

export const getThemeCss = (theme: DocumentTheme): string => {
  const t = THEME_TOKENS[theme] ?? THEME_TOKENS.professional;

  const calloutRules = Object.entries(CALLOUT_COLORS)
    .map(
      ([variant, colors]) => `
      .callout--${variant} {
        background: ${colors.bg};
        border-left-color: ${colors.border};
      }
      .callout--${variant} .callout__title { color: ${colors.border}; }`,
    )
    .join("\n");

  return `
    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      color: ${t.text};
      font-family: ${t.bodyFont};
      font-size: ${t.baseFontPt}pt;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Keep headings with the content they introduce, and never strand a
       single line of a paragraph across a page boundary. */
    h1, h2, h3 {
      font-family: ${t.headingFont};
      font-weight: ${t.headingWeight};
      color: ${t.accent};
      margin: 0 0 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    h1 { font-size: 20pt; margin-top: 22px; }
    h2 { font-size: 15pt; margin-top: 20px; }
    h3 { font-size: 12.5pt; margin-top: 16px; color: ${t.text}; }

    p {
      margin: 0 0 10px;
      orphans: 3;
      widows: 3;
    }

    ul, ol { margin: 0 0 12px; padding-left: 22px; }
    li { margin-bottom: 5px; }

    .cover {
      page-break-after: always;
      break-after: page;
      padding-top: 190px;
      text-align: center;
    }
    .cover__title {
      font-family: ${t.headingFont};
      font-size: 30pt;
      font-weight: ${t.headingWeight};
      color: ${t.accent};
      margin: 0 0 14px;
      line-height: 1.25;
    }
    .cover__subtitle { font-size: 13pt; color: ${t.muted}; margin: 0 0 34px; }
    .cover__rule {
      width: 70px;
      height: 3px;
      background: ${t.accent};
      margin: 0 auto 34px;
    }
    .cover__meta { font-size: 10pt; color: ${t.muted}; }

    .doc-title {
      font-family: ${t.headingFont};
      font-size: 22pt;
      font-weight: ${t.headingWeight};
      color: ${t.accent};
      margin: 0 0 4px;
    }
    .doc-subtitle { color: ${t.muted}; font-size: 12pt; margin: 0 0 18px; }
    .doc-header {
      border-bottom: 2px solid ${t.accent};
      padding-bottom: 12px;
      margin-bottom: 22px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 14px;
      font-size: 9.5pt;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th {
      background: ${t.tableHeaderBg};
      color: ${t.tableHeaderText};
      text-align: left;
      padding: 7px 9px;
      font-weight: 600;
      border: 1px solid ${t.border};
    }
    td {
      padding: 6px 9px;
      border: 1px solid ${t.border};
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: ${t.accentSoft}; }
    .table-caption {
      font-size: 9pt;
      color: ${t.muted};
      margin: -8px 0 16px;
      font-style: italic;
    }

    .callout {
      border-left: 4px solid;
      padding: 11px 14px;
      margin: 0 0 14px;
      page-break-inside: avoid;
      break-inside: avoid;
      border-radius: 0 3px 3px 0;
    }
    .callout__title { font-weight: 600; margin: 0 0 4px; }
    .callout p:last-child { margin-bottom: 0; }
    ${calloutRules}

    .kv { width: 100%; border-collapse: collapse; margin: 0 0 14px; }
    .kv td { border: none; padding: 5px 0; vertical-align: top; }
    .kv__label {
      color: ${t.muted};
      width: 32%;
      font-weight: 600;
      padding-right: 14px;
    }

    blockquote {
      margin: 0 0 14px;
      padding: 4px 0 4px 16px;
      border-left: 3px solid ${t.border};
      color: ${t.muted};
      font-style: italic;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    blockquote .attribution {
      display: block;
      margin-top: 6px;
      font-style: normal;
      font-size: 9.5pt;
    }

    .inline-code {
      font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
      background: ${t.accentSoft};
      border: 1px solid ${t.border};
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 0.92em;
    }

    pre {
      background: ${t.accentSoft};
      border: 1px solid ${t.border};
      border-radius: 3px;
      padding: 11px 13px;
      margin: 0 0 14px;
      font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
      font-size: 9pt;
      line-height: 1.45;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    figure { margin: 0 0 16px; text-align: center; page-break-inside: avoid; }
    figure img { max-width: 100%; }
    figure.width--half img { max-width: 50%; }
    figcaption { font-size: 9pt; color: ${t.muted}; margin-top: 6px; }

    hr {
      border: none;
      border-top: 1px solid ${t.border};
      margin: 18px 0;
    }

    .page-break { page-break-after: always; break-after: page; height: 0; }
  `;
};

export const getRunningHeadCss = (theme: DocumentTheme): string => {
  const t = THEME_TOKENS[theme] ?? THEME_TOKENS.professional;
  return `font-family: ${t.bodyFont}; color: ${t.muted};`;
};
