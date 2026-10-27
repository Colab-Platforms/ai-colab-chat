/** Mirrors `GeneratedVideoStatus` in schema.prisma. */
export type VideoStatus =
  | "PENDING"
  | "SUBMITTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export const MAX_PROMPT_CHARS = 60000;
export const MAX_TITLE_CHARS = 200;

export const SUPPORTED_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
  "9:21",
] as const;

export const SUPPORTED_RESOLUTIONS = [
  "480p",
  "720p",
  "768p",
  "1080p",
  "1K",
  "2K",
  "4K",
] as const;

export interface CreateVideoInput {
  prompt: string;
  chatId?: number;
  messageId?: number;
  /** Which VIDEO_GENERATION model to use. Omit to fall back to the
   * defaultForCapabilities/first-active model (see VideoService.resolveModel). */
  modelId?: number;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  /** Image-to-video: public HTTPS URLs from the existing attachment upload flow. */
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  /**
   * Ordered image sequence (frame 1 … n) from the multi-image picker. Takes
   * precedence over firstFrameUrl/lastFrameUrl when present.
   */
  imageUrls?: string[];
  /** Optional voice/dialogue/music reference, uploaded via POST /videos/reference-audio. */
  referenceAudioUrl?: string;
}

/** Most images one request may carry (matches the picker's cap). */
export const MAX_INPUT_IMAGES = 8;

/**
 * Models that accept 3+ ordered images as reference images. Veo 3.1 Lite only
 * takes first/last frame, so a longer sequence would be silently dropped —
 * create() rejects it instead of charging for a clip that ignored the images.
 */
export const MULTI_IMAGE_MODELS = new Set([
  "bytedance/seedance-2.0",
  "bytedance/seedance-2.0-mini",
]);

/** Models limited to a first/last frame pair. */
export const MAX_FRAME_PAIR_IMAGES = 2;

/**
 * Longest reference audio accepted. Seedance's own reference-to-video caps
 * the combined audio input at ~16s on the providers that document it.
 */
export const MAX_REFERENCE_AUDIO_SECONDS = 16;

/**
 * Models that actually honour an `audio_url` input reference on OpenRouter
 * ("BytePlus Seedance generation 2 and newer" per OpenRouter's spec). Every
 * other model silently ignores audio references, so create() rejects them
 * rather than charging for a clip that drops the user's audio.
 */
export const AUDIO_REFERENCE_MODELS = new Set([
  "bytedance/seedance-2.0",
  "bytedance/seedance-2.0-mini",
]);

export interface ListVideosQuery {
  page?: number;
  limit?: number;
  status?: string;
  chatId?: number;
}
