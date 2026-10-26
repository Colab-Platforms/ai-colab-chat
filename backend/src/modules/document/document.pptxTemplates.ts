import type { PptxTemplate } from "./document.types.js";

/**
 * Visual design tokens for a PPTX template.
 *
 * Deliberately a separate, richer shape from `ThemeTokens` (document.theme.ts)
 * rather than an extension of it PDF/DOCX themes are flat color/font pairs
 * because those renderers reflow text on a page; a slide is a fixed canvas,
 * so a template also owns layout decisions (title treatment, whether content
 * slides make room for a photo) that a document theme has no use for.
 */
export interface PptxTemplateTokens {
  key: PptxTemplate;
  label: string;

  /** Slide background for content/section slides. */
  bg: string;
  /** Secondary background soft fills, alternating table rows. */
  bgSoft: string;
  /** Primary accent headings, rules, the title-slide treatment. */
  accent: string;
  /** Secondary accent a second color for contrast (rarely the whole fill). */
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
   * - solid: no photo attempted/available solid accent background, centered text.
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

  // The six below are sampled from the decks in frontend/Templates. Fonts are
  // the nearest system face (PowerPoint resolves one installed name), with the
  // design's web font noted.

  // Young Serif / Figtree
  "marketing-plan": {
    key: "marketing-plan",
    label: "Marketing Plan",
    bg: "#FBF6EC",
    bgSoft: "#F7EADB",
    accent: "#B8452F",
    accent2: "#F3E3A1",
    text: "#2B2118",
    muted: "#8A7765",
    onAccent: "#FFFFFF",
    border: "#E5D8C4",
    tableHeaderBg: "#B8452F",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Georgia",
    bodyFontName: "Calibri",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "splitPhoto",
    contentImageLayout: true,
    decoration: "cornerBlob",
  },
  // Bricolage Grotesque / Geist
  "pitch-deck": {
    key: "pitch-deck",
    label: "Pitch Deck",
    bg: "#F6F4EF",
    bgSoft: "#E2DAFB",
    accent: "#5B3FD1",
    accent2: "#8B6FF0",
    text: "#16141B",
    muted: "#5E5A66",
    onAccent: "#FFFFFF",
    border: "#D8D4CC",
    tableHeaderBg: "#5B3FD1",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Trebuchet MS",
    bodyFontName: "Segoe UI",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "solid",
    contentImageLayout: true,
    decoration: "thinBar",
  },
  // Red Hat Display / Red Hat Mono
  "project-kickoff": {
    key: "project-kickoff",
    label: "Project Kickoff",
    bg: "#0B2545",
    bgSoft: "#133660",
    accent: "#8FC0E9",
    accent2: "#F4D35E",
    text: "#E8F1F8",
    muted: "#B8C9DB",
    onAccent: "#0B2545",
    border: "#1F4470",
    tableHeaderBg: "#8FC0E9",
    tableHeaderText: "#0B2545",
    headingFontName: "Segoe UI",
    bodyFontName: "Segoe UI",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "solid",
    contentImageLayout: true,
    decoration: "thinBar",
  },
  // Archivo
  "quarterly-review": {
    key: "quarterly-review",
    label: "Quarterly Review",
    bg: "#FFFFFF",
    bgSoft: "#F1F4F3",
    accent: "#0CA678",
    accent2: "#111111",
    text: "#111111",
    muted: "#555555",
    onAccent: "#FFFFFF",
    border: "#E0E3E2",
    tableHeaderBg: "#111111",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Arial",
    bodyFontName: "Arial",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "solid",
    contentImageLayout: false,
    decoration: "bigNumber",
  },
  // Gloock / Albert Sans
  "sales-proposal": {
    key: "sales-proposal",
    label: "Sales Proposal",
    bg: "#F5EFE6",
    bgSoft: "#EAE2D3",
    accent: "#12372A",
    accent2: "#E9B44C",
    text: "#12372A",
    muted: "#5C6F66",
    onAccent: "#F5EFE6",
    border: "#D8CDBB",
    tableHeaderBg: "#12372A",
    tableHeaderText: "#F5EFE6",
    headingFontName: "Georgia",
    bodyFontName: "Calibri",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "splitPhoto",
    contentImageLayout: true,
    decoration: "thinBar",
  },
  // Lexend
  "training-deck": {
    key: "training-deck",
    label: "Training Deck",
    bg: "#F7F4EC",
    bgSoft: "#D7E3E4",
    accent: "#0E7C86",
    accent2: "#FFD23F",
    text: "#0E3B43",
    muted: "#4F6F74",
    onAccent: "#FFFFFF",
    border: "#BFD8DB",
    tableHeaderBg: "#0E7C86",
    tableHeaderText: "#FFFFFF",
    headingFontName: "Verdana",
    bodyFontName: "Verdana",
    monoFontName: "Consolas",
    headingBold: true,
    titleLayout: "splitPhoto",
    contentImageLayout: true,
    decoration: "cornerBlob",
  },
};

export const getPptxTemplateTokens = (theme: string): PptxTemplateTokens =>
  TEMPLATES[theme as PptxTemplate] ?? TEMPLATES.corporate;
