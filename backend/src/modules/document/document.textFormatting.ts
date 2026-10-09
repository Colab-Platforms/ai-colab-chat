
export interface InlineSegment {
  text: string;
  bold?: boolean;
  code?: boolean;
}

export interface FormattedLine {
  bullet: boolean;
  segments: InlineSegment[];
}


const INLINE_TOKEN = /\*\*(.+?)\*\*|`([^`]+?)`/g;

export const parseInlineSegments = (value: unknown): InlineSegment[] => {
  const line = String(value ?? "");
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_TOKEN.lastIndex = 0;
  while ((match = INLINE_TOKEN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ text: match[1], bold: true });
    } else if (match[2] !== undefined) {
      segments.push({ text: match[2], code: true });
    }
    lastIndex = INLINE_TOKEN.lastIndex;
  }
  if (lastIndex < line.length || segments.length === 0) {
    segments.push({ text: line.slice(lastIndex) });
  }
  return segments;
};

/**
 * A line whose only content is a leading "- " or "* " marker followed by a
 * space is a list item the model wrote inline instead of using a list block.
 * Bold markers ("**") never match this — there is no space between the two
 * asterisks — so the two syntaxes cannot collide.
 */
const BULLET_LINE = /^\s*[-*]\s+(.*)$/;

/** Splits a multi-line value into per-line bullet + inline-segment data. */
export const parseFormattedText = (value: unknown): FormattedLine[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((rawLine) => {
      const bulletMatch = BULLET_LINE.exec(rawLine);
      const bullet = bulletMatch !== null;
      const content = bullet ? bulletMatch[1] : rawLine;
      return { bullet, segments: parseInlineSegments(content) };
    });
