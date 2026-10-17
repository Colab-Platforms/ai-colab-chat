import type { MindmapTheme } from "./document.types.js";

/**
 * Visual tokens for a mind-map theme.
 *
 * Colour lives here and nowhere else: the spec carries no styling, so a stored
 * map can be re-skinned for free. Each top-level branch takes
 * `branchColors[index % length]`, and its whole subtree inherits that colour
 * the way a coloured mind map reads at a glance.
 */
export interface MindmapThemeTokens {
  key: MindmapTheme;
  label: string;
  /** Canvas background. */
  bg: string;
  /** Central node fill and its text. */
  rootBg: string;
  rootText: string;
  /** Node text and the secondary (note / depth 2+) text colour. */
  text: string;
  muted: string;
  /** One colour per top-level branch, cycled. */
  branchColors: string[];
  /** CSS font stack; SVG exports cannot rely on a webfont being installed. */
  fontFamily: string;
  headingWeight: number;
}

const SANS =
  'Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", "Noto Serif", serif';

const THEMES: Record<MindmapTheme, MindmapThemeTokens> = {
  vibrant: {
    key: "vibrant",
    label: "Vibrant",
    bg: "#FFFFFF",
    rootBg: "#111418",
    rootText: "#FFFFFF",
    text: "#1B2230",
    muted: "#5B6475",
    branchColors: [
      "#5B3FD9",
      "#16A870",
      "#F26A2E",
      "#1F6FEB",
      "#D6336C",
      "#0E9AA7",
      "#C99A06",
      "#7A5A3A",
    ],
    fontFamily: SANS,
    headingWeight: 600,
  },
  ocean: {
    key: "ocean",
    label: "Ocean",
    bg: "#F4F9FC",
    rootBg: "#0B3C5D",
    rootText: "#FFFFFF",
    text: "#0F2A3D",
    muted: "#52718A",
    branchColors: [
      "#0B6FA4",
      "#13A8A0",
      "#3B82C4",
      "#1E8E6E",
      "#5A6FD6",
      "#2AA9D6",
    ],
    fontFamily: SANS,
    headingWeight: 600,
  },
  autumn: {
    key: "autumn",
    label: "Autumn",
    bg: "#FFF8F0",
    rootBg: "#5A2A12",
    rootText: "#FFF4E6",
    text: "#3A2417",
    muted: "#8A6A54",
    branchColors: [
      "#C8501E",
      "#B8860B",
      "#8C3B2A",
      "#6B8E23",
      "#D9822B",
      "#A0522D",
    ],
    fontFamily: SERIF,
    headingWeight: 700,
  },
  midnight: {
    key: "midnight",
    label: "Midnight",
    bg: "#0F1220",
    rootBg: "#7C6BFF",
    rootText: "#FFFFFF",
    text: "#E8EAF6",
    muted: "#9AA0C3",
    branchColors: [
      "#8E7CFF",
      "#3DDC97",
      "#FF8A5B",
      "#4CC9F0",
      "#FF5D8F",
      "#F9C74F",
    ],
    fontFamily: SANS,
    headingWeight: 600,
  },
};

export const getMindmapThemeTokens = (theme: string): MindmapThemeTokens =>
  THEMES[theme as MindmapTheme] ?? THEMES.vibrant;
