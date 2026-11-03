/**
 * Auto model routing: pure logic (no DB, no I/O) so it can be unit-tested.
 *
 * Two steps per user message:
 *   1. classifyMessage  rule-based complexity (SIMPLE / MEDIUM / COMPLEX).
 *   2. selectAutoModel  choose from OUR candidate list by quality score + cost.
 *
 * Deliberately no LLM router: the answer can only ever be a model from the
 * list passed in, so it can't name a model that doesn't exist.
 */

export type AutoPriority = "ECONOMY" | "BALANCED" | "QUALITY";
export type Complexity = "SIMPLE" | "MEDIUM" | "COMPLEX";

export const AUTO_PRIORITIES: AutoPriority[] = ["ECONOMY", "BALANCED", "QUALITY"];

export interface ClassifyInput {
  content: string;
  chatType?: string;
  attachmentMimeTypes?: string[];
  /** Messages already in the chat before this one. */
  historyLength?: number;
}

export interface Classification {
  complexity: Complexity;
  score: number;
  needsVision: boolean;
}

const CODE_FENCE = /```/;
const CODE_WORDS =
  /\b(function|class|stack ?trace|exception|compile[dr]?|refactor|debug|bug|regex|sql|query|typescript|javascript|python|react|api|endpoint|algorithm|runtime|segfault|deploy|dockerfile|kubernetes)\b|error:/i;
const REASONING_WORDS =
  /\b(prove|derive|step[- ]by[- ]step|analy[sz]e|analysis|compare|trade-?offs?|architecture|design (a|an|the)|optimi[sz]e|strategy|evaluate|why does|explain why|pros and cons|root cause)\b/i;
const MATH_WORDS = /\b(integral|derivative|equation|theorem|probability|matrix|proof|calculate|solve for)\b/i;
const GREETING = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|good (morning|evening|night))\b[\s!.?]*$/i;

const DOC_MIME = /pdf|word|powerpoint|presentation|spreadsheet|excel|csv/i;

export function classifyMessage(input: ClassifyInput): Classification {
  const text = (input.content ?? "").trim();
  const mimes = input.attachmentMimeTypes ?? [];
  const needsVision = mimes.some((m) => m.startsWith("image/"));

  if (GREETING.test(text)) {
    return { complexity: "SIMPLE", score: 0, needsVision };
  }

  let score = 0;
  if (text.length > 1500) score += 2;
  else if (text.length > 400) score += 1;

  if (CODE_FENCE.test(text)) score += 2;
  if (CODE_WORDS.test(text)) score += 2;
  if (REASONING_WORDS.test(text)) score += 2;
  if (MATH_WORDS.test(text)) score += 2;

  score += Math.min(2, mimes.filter((m) => DOC_MIME.test(m)).length);

  if (input.chatType === "CODE") score += 2;
  if (input.chatType === "DEEP_RESEARCH") score += 4;
  if (input.chatType === "WEB_SEARCH") score += 1;

  if ((input.historyLength ?? 0) >= 12) score += 1;

  const complexity: Complexity = score >= 4 ? "COMPLEX" : score >= 2 ? "MEDIUM" : "SIMPLE";
  return { complexity, score, needsVision };
}

/** Minimum quality score a model needs for a request of this complexity. */
export const MIN_QUALITY: Record<AutoPriority, Record<Complexity, number>> = {
  ECONOMY: { SIMPLE: 4, MEDIUM: 6, COMPLEX: 7 },
  BALANCED: { SIMPLE: 5, MEDIUM: 7, COMPLEX: 8 },
  QUALITY: { SIMPLE: 8, MEDIUM: 9, COMPLEX: 10 },
};

export interface AutoCandidate {
  id: number;
  name: string;
  /** 1-10; candidates without a score never reach this function. */
  quality: number;
  /** tokenMultiplier: higher = more expensive. 0 = free. */
  cost: number;
}

/** Below this a free/near-free model would divide by ~0 in the value score. */
const COST_FLOOR = 0.25;

/** Within this many points of the top score counts as "equally good". */
const QUALITY_TIE_BAND = 1;

function byCostThenQuality(a: AutoCandidate, b: AutoCandidate) {
  return a.cost - b.cost || b.quality - a.quality;
}

/**
 * Pick the best candidate for a priority + complexity, or null if the list is
 * empty. If nothing clears the quality floor, the strongest candidate wins
 * rather than failing the request.
 */
export function selectAutoModel(
  candidates: AutoCandidate[],
  priority: AutoPriority,
  complexity: Complexity,
): AutoCandidate | null {
  if (candidates.length === 0) return null;

  const floor = MIN_QUALITY[priority][complexity];
  const eligible = candidates.filter((c) => c.quality >= floor);

  if (eligible.length === 0) {
    return [...candidates].sort((a, b) => b.quality - a.quality || a.cost - b.cost)[0];
  }

  if (priority === "ECONOMY") {
    return [...eligible].sort(byCostThenQuality)[0];
  }

  if (priority === "QUALITY") {
    const top = Math.max(...eligible.map((c) => c.quality));
    const near = eligible.filter((c) => c.quality >= top - QUALITY_TIE_BAND);
    // Highest score first, but a model within the tie band that costs less wins.
    return [...near].sort(byCostThenQuality)[0];
  }

  // BALANCED: best quality per unit of cost among models that clear the floor.
  const value = (c: AutoCandidate) => c.quality / Math.sqrt(Math.max(c.cost, COST_FLOOR));
  return [...eligible].sort((a, b) => value(b) - value(a) || b.quality - a.quality)[0];
}

export interface StickyInput {
  candidates: AutoCandidate[];
  /** The model that answered the previous turn, if any. */
  currentId: number | null;
  priority: AutoPriority;
  complexity: Complexity;
}

export interface StickyResult {
  chosen: AutoCandidate | null;
  /** current model kept / fresh pick / moved off the current model. */
  outcome: "KEPT" | "FRESH" | "SWITCHED";
  /** When SWITCHED: the current model is still allowed, but too weak. */
  currentTooWeak: boolean;
}

/**
 * Sticky, upgrade-only routing. A chat keeps its current model while that
 * model is still a valid candidate and strong enough; otherwise it moves to
 * the normal pick. Never downgrades just because a message looks easier.
 */
export function selectWithStickiness(input: StickyInput): StickyResult {
  const { candidates, currentId, priority, complexity } = input;
  const current = currentId != null ? candidates.find((c) => c.id === currentId) : undefined;

  if (current && current.quality >= MIN_QUALITY[priority][complexity]) {
    return { chosen: current, outcome: "KEPT", currentTooWeak: false };
  }

  const picked = selectAutoModel(candidates, priority, complexity);
  if (currentId == null) return { chosen: picked, outcome: "FRESH", currentTooWeak: false };
  if (picked && picked.id === currentId) return { chosen: picked, outcome: "KEPT", currentTooWeak: false };
  return { chosen: picked, outcome: "SWITCHED", currentTooWeak: Boolean(current) };
}
