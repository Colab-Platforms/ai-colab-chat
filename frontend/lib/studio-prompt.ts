/**
 * Studio templates send a long, proprietary prompt that users shouldn't see in
 * the chat. The message content is stored as `<label><MARKER><full prompt>`:
 * the model still receives everything, while the UI shows only the label.
 *
 * The marker must not contain `<` or `>`: the backend sanitize middleware
 * HTML-escapes them in request bodies, which would stop it from matching.
 */
export const STUDIO_PROMPT_MARKER = "\n[[studio-template]]\n";

// Messages saved while the marker still used angle brackets came back escaped.
const LEGACY_MARKERS = ["\n&lt;&lt;studio-template&gt;&gt;\n", "\n<<studio-template>>\n"];

export function packStudioPrompt(label: string, prompt: string): string {
  return `${label}${STUDIO_PROMPT_MARKER}${prompt}`;
}

/** Splits stored message content into what the user sees and whether a prompt is hidden. */
export function unpackStudioPrompt(content: string): { visible: string; hasHidden: boolean } {
  for (const marker of [STUDIO_PROMPT_MARKER, ...LEGACY_MARKERS]) {
    const idx = content.indexOf(marker);
    if (idx !== -1) return { visible: content.slice(0, idx), hasHidden: true };
  }
  return { visible: content, hasHidden: false };
}
