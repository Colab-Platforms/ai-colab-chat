/**
 * Detects when a plain-chat message is really asking for another mode, so the
 * composer can OFFER the switch. It never switches on its own: auto-switching
 * spends credits on a wrong guess, so the user always confirms.
 *
 * Patterns are deliberately strict (explicit verb + explicit noun). A missed
 * suggestion costs nothing; a wrong one is noise.
 */

export interface SpecialistOption {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  supportsCodeMode?: boolean;
  bgVia?: string | null;
  bgFrom?: string | null;
  bgTo?: string | null;
}

export type IntentSuggestion =
  | { kind: "IMAGE" }
  | { kind: "CODE" }
  | { kind: "SPECIALIST"; specialist: SpecialistOption };

export interface IntentContext {
  /** The chat's assistant has the Code pill (Software Engineer). */
  supportsCodeMode: boolean;
  codeModeActive: boolean;
  imageGenEnabled: boolean;
  specialists: SpecialistOption[];
  currentAssistantId: number | null;
}

const MIN_LENGTH = 8;

const IMAGE_REQUEST =
  /\b(generate|create|make|draw|design|render|paint)\b[^.?!\n]{0,40}\b(image|picture|photo|illustration|logo|icon|poster|banner|wallpaper|artwork)s?\b/i;
// "how do I draw an image in canvas", SVG/HTML asks and the like are code questions.
const IMAGE_FALSE_POSITIVE = /\b(how (do|to|can|would)|explain|svg|html|css|canvas|python|script|function|library|api)\b/i;

const CODE_BUILD =
  /\b(build|create|make|develop|code|write)\b[^.?!\n]{0,40}\b(website|web ?site|web ?app|web ?page|landing page|app|application|dashboard|component|game|calculator|portfolio|todo)\b/i;

/**
 * Specialists are matched by what they ARE (name + description), not by a
 * hard-coded id, so renaming one in the admin doesn't break its suggestion.
 */
const SPECIALIST_RULES: { who: RegExp; asks: RegExp }[] = [
  {
    who: /legal|law|lawyer|compliance|contract/i,
    asks: /\b(contract|clause|nda|indemnity|liability|lease|terms (of|and) (service|use)|privacy policy|trademark|copyright|lawsuit|legal(ly)?|sue|gdpr|incorporat\w*)\b/i,
  },
  {
    who: /financ|budget|account|money|invest/i,
    asks: /\b(budget|cash ?flow|break-?even|runway|forecast|roi|profit margin|valuation|loan|emi|investment|mutual fund|tax (planning|saving)|balance sheet)\b/i,
  },
  {
    who: /software|engineer|developer|code|program/i,
    asks: /\b(bug|stack ?trace|exception|refactor|typescript|javascript|python|react|sql query|regex|api endpoint|docker(file)?|compile error|unit test)\b|```|error:/i,
  },
  {
    who: /market|seo|brand|growth|ads?\b/i,
    asks: /\b(marketing|campaign|seo|ad copy|brand(ing)?|target audience|go-?to-?market|social media (plan|strategy)|conversion rate|funnel)\b/i,
  },
  {
    who: /content|writer|copy|blog/i,
    asks: /\b(blog post|article|newsletter|caption|copywriting|product description|press release|script for)\b/i,
  },
];

export function detectIntent(text: string, ctx: IntentContext): IntentSuggestion | null {
  const t = text.trim();
  if (t.length < MIN_LENGTH) return null;

  if (ctx.imageGenEnabled && IMAGE_REQUEST.test(t) && !IMAGE_FALSE_POSITIVE.test(t)) {
    return { kind: "IMAGE" };
  }

  if (ctx.supportsCodeMode && !ctx.codeModeActive && CODE_BUILD.test(t)) {
    return { kind: "CODE" };
  }

  for (const rule of SPECIALIST_RULES) {
    if (!rule.asks.test(t)) continue;
    // Name first: descriptions mention neighbouring topics ("marketing copy").
    const specialist =
      ctx.specialists.find((s) => rule.who.test(s.name)) ??
      ctx.specialists.find((s) => rule.who.test(s.description ?? ""));
    if (specialist && specialist.id !== ctx.currentAssistantId) {
      return { kind: "SPECIALIST", specialist };
    }
  }

  return null;
}
