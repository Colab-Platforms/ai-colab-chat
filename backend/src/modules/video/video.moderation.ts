/**
 * Cheap keyword gate on video prompts, checked BEFORE the paid OpenRouter
 * call — the provider models also refuse disallowed content, but by then the
 * wallet reservation has already been made and the request has cost a round
 * trip. This is deliberately narrow (obvious sexual/exploitative terms) and
 * not a substitute for real moderation; it exists to catch the cheap,
 * obvious cases before they reach a paid API call.
 *
 * TODO: replace with a proper moderation model/API call if abuse volume
 * shows this keyword list isn't enough.
 */
const DISALLOWED_PATTERNS: RegExp[] = [
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bporn(ographic)?\b/i,
  /\bsex(ual|ually)?\b/i,
  /\berotic\b/i,
  /\bnsfw\b/i,
  /\bfetish\b/i,
  /\bhentai\b/i,
  /\bexplicit\b/i,
];

export const containsDisallowedContent = (prompt: string): boolean =>
  DISALLOWED_PATTERNS.some((pattern) => pattern.test(prompt));
