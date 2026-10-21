import type { VideoStatus } from "@/components/chat/video-card";

/**
 * The checklist shown while a video renders. The first three steps map onto
 * real `GeneratedVideo.status` values, so they advance when the provider
 * actually moves the job along rather than on a timer.
 *
 * "Finishing up" is the exception: it covers the window where the provider
 * has finished but the backend is still downloading the file and pushing it
 * to Cloudinary. That happens inside `applyTerminalStatus` and never reaches
 * the database, so the client infers it from progress instead.
 */
export const VIDEO_STAGES = ["In queue", "Planning the shot", "Rendering frames", "Finishing up"] as const;

/** Percentage each stage is worth at minimum, so the bar can't contradict the checklist. */
const STAGE_FLOOR = [0, 15, 40, 90];

/** Point past which we show "Finishing up" instead of "Rendering frames". */
const FINISHING_AT = 90;

export const VIDEO_WORKING_STATUSES: VideoStatus[] = ["PENDING", "SUBMITTED", "PROCESSING"];

export const isVideoWorking = (status: VideoStatus): boolean => VIDEO_WORKING_STATUSES.includes(status);

export const isVideoFailure = (status: VideoStatus): boolean =>
  status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";

/**
 * Index into {@link VIDEO_STAGES}; 4 means every step is done.
 *
 * Some providers (e.g. Veo) never report "in_progress" on poll, so the job
 * can sit in SUBMITTED the whole way through — the timer-driven `percent`
 * keeps climbing regardless (see `percentFor`). Deriving the stage from
 * `percent` for both working statuses keeps the checklist moving with the
 * bar instead of freezing on "Planning the shot" until the status flips.
 */
export const stageIndexFor = (status: VideoStatus, percent: number): number => {
  if (status === "PENDING") return 0;
  if (status === "SUBMITTED" || status === "PROCESSING") {
    if (percent >= FINISHING_AT) return 3;
    if (percent >= STAGE_FLOOR[2]) return 2;
    return 1;
  }
  return VIDEO_STAGES.length;
};

/**
 * Roughly how long a clip of these settings takes to come back. OpenRouter
 * reports no progress and no ETA (see `openrouterVideo.ts` — the poll
 * response is just a status string), so the only honest way to fill a
 * progress bar is to time it against an expected duration. These multipliers
 * are per second of output video; a historical median per model/resolution
 * could replace this later without any change to the UI.
 */
const RESOLUTION_WEIGHT: Record<string, number> = {
  "480p": 1.1,
  "720p": 1.5,
  "768p": 1.6,
  "1080p": 2.2,
  "1K": 2.2,
  "2K": 2.8,
  "4K": 3.4,
};

const MODEL_WEIGHT: Record<string, number> = {
  "seedance-2.0-mini": 0.7,
  "veo-3.1-lite": 0.9,
};

/** Fixed overhead for queueing, our download and the Cloudinary upload. */
const OVERHEAD_SECONDS = 12;

export const etaSecondsFor = (opts: { externalId?: string | null; resolution: string; duration: number }): number => {
  const resolutionWeight = RESOLUTION_WEIGHT[opts.resolution] ?? 1.8;
  const modelWeight = opts.externalId ? (MODEL_WEIGHT[opts.externalId] ?? 1) : 1;
  return Math.round(opts.duration * resolutionWeight * modelWeight * 6 + OVERHEAD_SECONDS);
};

/**
 * Progress for the bar. Held back from 100% until the job is actually done —
 * a bar that sits full while the user waits reads as broken — and never
 * allowed to move backwards, so a status change can't make it jump down.
 */
export const percentFor = (opts: {
  status: VideoStatus;
  elapsedSeconds: number;
  etaSeconds: number;
  previous: number;
}): number => {
  if (opts.status === "COMPLETED") return 100;
  if (!isVideoWorking(opts.status)) return opts.previous;

  const stage = opts.status === "PENDING" ? 0 : opts.status === "SUBMITTED" ? 1 : 2;
  const timed = (opts.elapsedSeconds / Math.max(opts.etaSeconds, 1)) * 100;
  return Math.max(opts.previous, Math.min(95, Math.max(STAGE_FLOOR[stage], timed)));
};

export const formatSecondsLeft = (etaSeconds: number, elapsedSeconds: number): number =>
  Math.max(1, Math.round(etaSeconds - elapsedSeconds));
