import type { PptxTemplate } from "./document.types.js";

/**
 * Visual design tokens for a PPTX template.
 *
 * Deliberately a separate, richer shape from `ThemeTokens` (document.theme.ts)
 * rather than an extension of it — PDF/DOCX themes are flat color/font pairs
 * because those renderers reflow text on a page; a slide is a fixed canvas,
 * so a template also owns layout decisions (title treatment, whether content
 * slides make room for a photo) that a document theme has no use for.
 */
export interface PptxTemplateTokens {
  key: PptxTemplate;
  label: string;

  /** Slide background for content/section slides. */
  bg: string;
  /** Secondary background — soft fills, alternating table rows. */
  bgSoft: string;
  /** Primary accent — headings, rules, the title-slide treatment. */
  accent: string;
  /** Secondary accent — a second color for contrast (rarely the whole fill). */
  accent2: string;
  /** Body text color against `bg`. */
  text: string;
  /** Muted text (captions, page numbers, subtitles) against `bg`. */
  muted: string;
  /** Text color against a solid `accent` fill. */
  onAccent: string;
  border: string;
  tableHeaderBg: string;
  tableHeaderText: string;

  headingFontName: string;
  bodyFontName: string;
  monoFontName: string;
  headingBold: boolean;

  /**
   * How the title (first) slide is built.
   * - fullBleedPhoto: photo covers the whole slide, dark scrim, centered text.
   * - splitPhoto: photo fills one half, text sits in a solid panel on the other.
   * - solid: no photo attempted/available — solid accent background, centered text.
   */
  titleLayout: "fullBleedPhoto" | "splitPhoto" | "solid";
  /** Whether a content slide with a `photoUrl` gets a two-column layout. */
  contentImageLayout: boolean;
  /** Decorative accent shown on section/content slides. */
  decoration: "cornerBlob" | "thinBar" | "bigNumber" | "none";
}

const TEMPLATES: Record<PptxTemplate, PptxTemplateTokens> = {
  corporate: {
    key: "corporate",
    label: "Corporate",
    bg: "#FFFFFF",
    bgSoft: "#F0F4FA",
    accent: "#0B3D91",
    accent2: "#C9971F",
    text: "#1A2233",
    muted: "#5D6B82",
    onAccent: "#FFFFFF",
    border: "#D9E1EC",
    tableHeaderBg: "#0B3D91",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Cambria",
    bodyFontName: "Calibri",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "splitPhoto",
    contentImageLayout: true,
    decoration: "thinBar",
  },
  aurora: {
    key: "aurora",
    label: "Aurora",
    bg: "#0B1220",
    bgSoft: "#161F33",
    accent: "#7C3AED",
    accent2: "#22D3EE",
    text: "#F3F4F8",
    muted: "#9AA4C0",
    onAccent: "#FFFFFF",
    border: "#2A3450",
    tableHeaderBg: "#7C3AED",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Trebuchet MS",
    bodyFontName: "Calibri",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "fullBleedPhoto",
    contentImageLayout: true,
    decoration: "cornerBlob",
  },
  sunset: {
    key: "sunset",
    label: "Sunset",
    bg: "#FFF8F0",
    bgSoft: "#FDEDE2",
    accent: "#FF6B4A",
    accent2: "#4A1942",
    text: "#2B1B1F",
    muted: "#8A6F68",
    onAccent: "#FFFFFF",
    border: "#F3D9C9",
    tableHeaderBg: "#FF6B4A",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Georgia",
    bodyFontName: "Verdana",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "fullBleedPhoto",
    contentImageLayout: true,
    decoration: "cornerBlob",
  },
  emerald: {
    key: "emerald",
    label: "Emerald",
    bg: "#FAF9F6",
    bgSoft: "#E7F1EC",
    accent: "#0B6E4F",
    accent2: "#B08D57",
    text: "#1E2A24",
    muted: "#5F6E67",
    onAccent: "#FFFFFF",
    border: "#DCE6E0",
    tableHeaderBg: "#0B6E4F",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Garamond",
    bodyFontName: "Calibri",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "splitPhoto",
    contentImageLayout: true,
    decoration: "thinBar",
  },
  mono: {
    key: "mono",
    label: "Mono",
    bg: "#0A0A0A",
    bgSoft: "#1A1A1A",
    accent: "#D7FF3E",
    accent2: "#FFFFFF",
    text: "#F5F5F5",
    muted: "#A0A0A0",
    onAccent: "#0A0A0A",
    border: "#2E2E2E",
    tableHeaderBg: "#D7FF3E",
    tableHeaderText: "#0A0A0A",
    headingFontName: "Bahnschrift",
    bodyFontName: "Segoe UI",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "solid",
    contentImageLayout: false,
    decoration: "bigNumber",
  },
};

export const getPptxTemplateTokens = (theme: string): PptxTemplateTokens =>
  TEMPLATES[theme as PptxTemplate] ?? TEMPLATES.corporate;
