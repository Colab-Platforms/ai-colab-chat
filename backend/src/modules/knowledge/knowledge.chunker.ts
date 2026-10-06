/**
 * Splits extracted text into overlapping chunks for embedding.
 *
 * Paragraph-first on purpose: a chunk that ends mid-sentence embeds worse and
 * reads worse when it is pasted into a prompt. Oversized paragraphs fall back to
 * sentence splitting, then to a hard cut, so no input can produce an unbounded
 * chunk. The nearest preceding markdown heading is carried as metadata so a
 * retrieved chunk can say which section it came from.
 */

const CHARS_PER_TOKEN = 4;
const TARGET_CHARS = Number(process.env.KNOWLEDGE_CHUNK_CHARS ?? 2000);
const OVERLAP_CHARS = Number(process.env.KNOWLEDGE_CHUNK_OVERLAP_CHARS ?? 240);

export interface TextChunk {
  ordinal: number;
  content: string;
  tokenCount: number;
  heading?: string;
}

export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

const HEADING_RE = /^#{1,6}\s+(.+)$/;

const splitOversized = (paragraph: string): string[] => {
  if (paragraph.length <= TARGET_CHARS) return [paragraph];

  const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > TARGET_CHARS) {
      if (current) pieces.push(current);
      current = "";
      for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
        pieces.push(sentence.slice(i, i + TARGET_CHARS));
      }
      continue;
    }
    if (current.length + sentence.length > TARGET_CHARS) {
      pieces.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
};

export function chunkText(raw: string): TextChunk[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) return [];

  const chunks: TextChunk[] = [];
  let heading: string | undefined;
  let buffer = "";
  let bufferHeading: string | undefined;

  const flush = () => {
    const content = buffer.trim();
    if (content) {
      chunks.push({
        ordinal: chunks.length,
        content,
        tokenCount: estimateTokens(content),
        heading: bufferHeading,
      });
    }
    // Carry the tail forward so a thought split across the boundary survives.
    buffer =
      OVERLAP_CHARS > 0 && content.length > OVERLAP_CHARS
        ? content.slice(-OVERLAP_CHARS)
        : "";
    bufferHeading = heading;
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const headingMatch = HEADING_RE.exec(trimmed.split("\n")[0]);
    if (headingMatch) heading = headingMatch[1].trim();
    if (!buffer) bufferHeading = heading;

    for (const piece of splitOversized(trimmed)) {
      if (buffer.length + piece.length + 2 > TARGET_CHARS && buffer.trim()) {
        flush();
      }
      buffer += (buffer ? "\n\n" : "") + piece;
    }
  }
  if (buffer.trim() && !(chunks.length && buffer.length <= OVERLAP_CHARS)) {
    flush();
  }

  return chunks;
}
