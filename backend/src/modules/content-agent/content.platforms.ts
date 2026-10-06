/**
 * Per-platform constraints. Used in the writer prompt now and by the
 * deterministic reviewer checks in Phase 3, so the limits live in one place.
 */
export interface PlatformRule {
  label: string;
  captionMax: number;
  hashtags: string;
  notes: string;
}

export const PLATFORM_RULES: Record<string, PlatformRule> = {
  instagram: {
    label: "Instagram",
    captionMax: 2200,
    hashtags: "5-10 relevant hashtags",
    notes: "Strong first line (it is cut off after ~125 characters). Conversational, visual language.",
  },
  linkedin: {
    label: "LinkedIn",
    captionMax: 3000,
    hashtags: "3-5 hashtags",
    notes: "Professional but human. Short paragraphs, one idea per line, a clear takeaway.",
  },
  x: {
    label: "X (Twitter)",
    captionMax: 280,
    hashtags: "0-2 hashtags",
    notes: "Hard limit of 280 characters for the caption. Punchy, no filler.",
  },
  facebook: {
    label: "Facebook",
    captionMax: 2000,
    hashtags: "0-3 hashtags",
    notes: "Friendly and community-oriented. Questions drive comments.",
  },
  tiktok: {
    label: "TikTok",
    captionMax: 2200,
    hashtags: "3-6 hashtags",
    notes: "Hook in the first second. Trend-aware, casual, short.",
  },
  youtube: {
    label: "YouTube",
    captionMax: 5000,
    hashtags: "3-5 hashtags",
    notes: "Keyword-rich title and description; first two lines carry the pitch.",
  },
};

export const normalizePlatform = (raw?: string | null): string | null => {
  if (!raw) return null;
  const p = raw.trim().toLowerCase();
  if (p === "twitter") return "x";
  if (p === "ig") return "instagram";
  return p || null;
};

export const platformRuleText = (platform?: string | null): string => {
  const rule = platform ? PLATFORM_RULES[platform] : undefined;
  if (!rule) return "";
  return `Platform rules (${rule.label}): caption max ${rule.captionMax} characters; ${rule.hashtags}. ${rule.notes}`;
};
