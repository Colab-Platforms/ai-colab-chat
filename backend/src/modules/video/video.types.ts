/** Mirrors `GeneratedVideoStatus` in schema.prisma. */
export type VideoStatus =
  | "PENDING"
  | "SUBMITTED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export const MAX_PROMPT_CHARS = 2000;
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
  /** Optional voice/dialogue/music reference, uploaded via POST /videos/reference-audio. */
  referenceAudioUrl?: string;
}

/**
 * Longest reference audio accepted. Seedance's own reference-to-video caps
 * the combined audio input at ~15s on the providers that document it.
 */
export const MAX_REFERENCE_AUDIO_SECONDS = 15;

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

export const MIN_SEQUENCE_IMAGES = 2;
export const MAX_SEQUENCE_IMAGES = 8;
/** Entries in one sequence request — higher than the image cap because an image can be reused. */
export const MAX_SEQUENCE_STEPS = 12;

export interface SequenceImageInput {
  /** Public HTTPS URL from the existing attachment upload flow. */
  imageUrl: string;
  /** What should happen to this image — the motion/scene prompt for its clip. */
  prompt: string;
}

export interface CreateVideoSequenceInput {
  chatId?: number;
  modelId?: number;
  /** Per-clip duration, in seconds. */
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  /**
   * false: one clip per image, hard-cut together.
   * true: clip i animates from image i to image i+1 (first + last frame), so N
   * images make N-1 clips and the final image's prompt is unused.
   */
  smoothTransitions?: boolean;
  /** In playback order. */
  images: SequenceImageInput[];
}

export interface ListVideosQuery {
  page?: number;
  limit?: number;
  status?: string;
  chatId?: number;
}
