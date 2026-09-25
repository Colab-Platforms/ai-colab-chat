import Joi from "joi";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";

/**
 * Two-stage detection for "the user wants an image generated from this
 * message", so a normal STANDARD chat can route itself to image generation
 * without the user manually switching mode/model — mirrors the document
 * generation intent detector (document.intent.ts) one-for-one.
 *
 *   Stage 1 — a free regex gate with high recall and deliberately poor
 *             precision. It has NO authority to trigger generation; it only
 *             decides whether stage 2 is worth paying for.
 *
 *   Stage 2 — a cheap model call that judges actual intent. This is what
 *             separates "draw me a cat" from "how does DALL-E work?" or
 *             "describe this photo" — a distinction no keyword list can draw.
 *
 * Everything here fails open: any error, timeout or malformed reply resolves
 * to "not an image request" and the chat proceeds as a normal turn. An
 * optional feature must never be able to break the conversation.
 */

const getIntentModel = () =>
  process.env.IMAGE_INTENT_MODEL ?? "google/gemini-2.5-flash";
// Shorter than the document classifier's timeout: that one runs AFTER the
// answer has already streamed, so the user isn't waiting on it. This one
// runs BEFORE anything streams, so it sits directly in perceived latency —
// fail-open makes an 8s cap safe, worst case is just a normal chat turn.
const INTENT_TIMEOUT_MS = Number(process.env.IMAGE_INTENT_TIMEOUT_MS ?? 8000);

export interface ImageIntent {
  isImageRequest: boolean;
  confidence: number;
}

const NONE: ImageIntent = { isImageRequest: false, confidence: 0 };

/* ------------------------------------------------------------------ *
 * Stage 1 — regex gate
 * ------------------------------------------------------------------ */

const IMAGE_NOUN =
  /\b(images?|pictures?|pics?|photos?|photographs?|drawings?|illustrations?|artworks?|art|icons?|logos?|avatars?|wallpapers?|posters?|graphics?|sketches?|paintings?|portraits?|memes?|thumbnails?|banners?|covers?)\b/i;

// Near-exclusively about producing visual art regardless of what follows —
// unlike "generate"/"create"/"make", which are just as likely to precede a
// document, plan, or piece of code. Passes the gate on its own, without
// needing an explicit noun like "image"/"picture" ("draw me a cat").
const STRONG_IMAGE_VERB = /\b(draw|sketch|paint|illustrate|doodle)\b/i;

const PRODUCTION_VERB =
  /\b(generate|create|make|design|produce|render|show me|give me|banao|bana do)\b/i;

/** "as an image", "into a poster" — verb-free but unambiguous. */
const REFERENTIAL_FORM =
  /\b(?:as|in|into|to)\s+(?:an?\s+)?(?:image|picture|photo|drawing|illustration|graphic|sketch|painting|logo|icon)\b/i;

const GATE_SCAN_CHARS = 500;

export const passesImageGate = (message: string): boolean => {
  if (!message) return false;
  const window =
    message.length > GATE_SCAN_CHARS
      ? message.slice(0, GATE_SCAN_CHARS)
      : message;
  if (STRONG_IMAGE_VERB.test(window)) return true;
  if (!IMAGE_NOUN.test(window)) return false;
  return PRODUCTION_VERB.test(window) || REFERENTIAL_FORM.test(window);
};

/* ------------------------------------------------------------------ *
 * Stage 2 — intent classifier
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You decide whether a chat message is asking the assistant to GENERATE a new image.

Reply with ONLY this JSON object:
{
  "isImageRequest": boolean,
  "confidence": number // 0.0 - 1.0
}

"isImageRequest" is true only when the user wants a brand new image produced:
"draw me a cat", "generate an image of a sunset", "make a logo for my app", "create a pixel art pen".

"isImageRequest" is false for everything else, including:
- Questions ABOUT image generation, AI art, or image models/APIs — "how does DALL-E work?", "how do I generate images with your API?", "what image models do you support?".
- Requests to ANALYZE, DESCRIBE, or READ an image the user already attached — "what's in this photo?", "describe this image", "read the text in this screenshot". That is a different capability (vision), not generation.
- Figurative language that isn't actually asking for a picture — "show me how to do X", "picture this scenario".

Be conservative. When genuinely unsure, answer false with low confidence.`;

const intentSchema = Joi.object({
  isImageRequest: Joi.boolean().required(),
  confidence: Joi.number().min(0).max(1).default(0.5),
});

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("intent classification timed out")), ms),
    ),
  ]);

/**
 * Resolves whether the user wants an image generated from this message.
 * Always resolves — never rejects.
 */
export const detectImageIntent = async (
  message: string,
): Promise<ImageIntent> => {
  if (!passesImageGate(message)) return NONE;

  const messageForClassifier =
    message.length > GATE_SCAN_CHARS
      ? message.slice(0, GATE_SCAN_CHARS)
      : message;

  const model = getIntentModel();

  try {
    const completion = await withTimeout(
      createOpenRouterJsonCompletion({
        model,
        systemPrompt: SYSTEM_PROMPT,
        userContent: `Message: ${messageForClassifier}`,
        max_tokens: 60,
        temperature: 0,
      }),
      INTENT_TIMEOUT_MS,
    );

    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) return NONE;

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return NONE;

    const { error, value } = intentSchema.validate(
      JSON.parse(raw.slice(start, end + 1)),
      { stripUnknown: true },
    );
    if (error) return NONE;

    return value as ImageIntent;
  } catch (error: any) {
    // Message only — the outcome is always the same: fall through to a
    // normal chat turn.
    console.error(
      `[image-intent] classification failed, treating as not an image request: ${error?.message ?? error}`,
    );
    return NONE;
  }
};
