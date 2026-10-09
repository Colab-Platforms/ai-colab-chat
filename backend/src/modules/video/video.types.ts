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
}

export interface ListVideosQuery {
  page?: number;
  limit?: number;
  status?: string;
  chatId?: number;
}
