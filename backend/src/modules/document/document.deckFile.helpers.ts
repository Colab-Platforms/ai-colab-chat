import type { Leaf } from "./document.deckFile.schema.js";

/** Short builders so a template's slide catalog reads as a table, not as boilerplate. */
export const str = (max: number, hint: string): Leaf => ({ type: "string", max, hint });
export const num = (min: number, max: number, hint: string): Leaf => ({ type: "number", min, max, hint });
export const list = (min: number, max: number, item: Record<string, Leaf>, hint?: string): Leaf => ({
  type: "list",
  min,
  max,
  item,
  ...(hint ? { hint } : {}),
});

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export const upper = (s: string): string => s.toUpperCase();

export const quoted = (s: string): string => `“${s.replace(/^["“]|["”]$/g, "")}”`;

/** Rough rendered width in points of bold sans text, per character class. Good enough to place a chip beside a number. */
export const estWidth = (text: string, sizePt: number): number =>
  [...text].reduce((w, ch) => {
    if (/[0-9]/.test(ch)) return w + 0.6 * sizePt;
    if (ch === "%") return w + 0.92 * sizePt;
    if (/[.,:;'|!]/.test(ch)) return w + 0.3 * sizePt;
    if (/\s/.test(ch)) return w + 0.3 * sizePt;
    if (/[A-Z$\u20B9]/.test(ch)) return w + 0.68 * sizePt;
    return w + 0.58 * sizePt;
  }, 0);
