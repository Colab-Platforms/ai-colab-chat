import {
  AlignLeft,
  BadgeCheck,
  Blocks,
  BookOpen,
  Braces,
  Bug,
  Gavel,
  GitCommitHorizontal,
  Lightbulb,
  LineChart,
  MessageSquare,
  Megaphone,
  Palette,
  PenLine,
  Quote,
  Rocket,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Terminal,
  TrendingUp,
  Type,
  Users,
  Wand2,
  Zap,
  LayoutTemplate,
  MousePointerClick,
  Brush,
  Ruler,
  FileText,
  Scale,
  type LucideIcon,
} from "lucide-react";

/**
 * Look of an assistant's start screen: one accent colour and six small icons
 * that float around its title. Matched by name so the five built-in
 * assistants get a hand-picked look; anything else falls back to a colour
 * taken from its own gradient (or the app accent) and a generic icon set.
 */
export interface AssistantLook {
  /** Accent colour used for icons and tints (light mode). */
  color: string;
  /** Six icons, ordered: top-left, top-right, mid-left, mid-right, low-left, low-right. */
  icons: LucideIcon[];
}

const LOOKS: { match: RegExp; look: AssistantLook }[] = [
  {
    match: /engineer|developer|coder|software|code/i,
    look: { color: "#1D6FC4", icons: [Terminal, Blocks, Bug, Braces, GitCommitHorizontal, Zap] },
  },
  {
    match: /writer|content|copy|blog/i,
    look: { color: "#B8381F", icons: [Quote, Type, PenLine, BookOpen, FileText, AlignLeft] },
  },
  {
    match: /legal|law|advisor|attorney/i,
    look: { color: "#A8620C", icons: [Gavel, ShieldCheck, ScrollText, BadgeCheck, Scale, FileText] },
  },
  {
    match: /market|growth|brand|seo/i,
    look: { color: "#A1317E", icons: [Megaphone, Target, TrendingUp, Rocket, Users, LineChart] },
  },
  {
    match: /design|website|web|ui|ux/i,
    look: { color: "#0E8F83", icons: [LayoutTemplate, Palette, MousePointerClick, Brush, Ruler, Blocks] },
  },
];

const GENERIC_ICONS: LucideIcon[] = [Sparkles, MessageSquare, Lightbulb, Star, Zap, Wand2];

/** Hue (0-360) of a #rrggbb colour, or null when it can't be read. */
function hueOf(hex?: string | null): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
}

export function getAssistantLook(assistant: {
  name?: string;
  bgVia?: string | null;
  bgFrom?: string | null;
  bgTo?: string | null;
}): AssistantLook {
  const named = LOOKS.find((l) => l.match.test(assistant.name ?? ""));
  if (named) return named.look;

  const hue = hueOf(assistant.bgVia) ?? hueOf(assistant.bgFrom) ?? hueOf(assistant.bgTo);
  return {
    color: hue === null ? "#6A45D9" : `hsl(${hue} 62% 38%)`,
    icons: GENERIC_ICONS,
  };
}
