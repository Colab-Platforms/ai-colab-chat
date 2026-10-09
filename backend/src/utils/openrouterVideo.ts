const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * A 4xx from OpenRouter means the request itself is rejected (bad params,
 * content-policy block, etc) — retrying the identical request will fail the
 * same way every time. A 5xx/network error is transient and worth retrying.
 */
export class VideoSubmitError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly providerCode: string | null;

  constructor(status: number, body: string) {
    let providerCode: string | null = null;
    let providerMessage: string | null = null;
    try {
      const parsed = JSON.parse(body);
      let inner = parsed?.error;
      // OpenRouter often wraps the upstream provider's own error as a JSON
      // string inside `error.message` (e.g. `"HTTP 400: {\"error\":{...}}"`)
      // — unwrap it so we get the actual code/message instead of that shell.
      if (typeof inner?.message === "string") {
        const nestedJson = inner.message.match(/\{.*\}/s)?.[0];
        if (nestedJson) {
          try {
            const nested = JSON.parse(nestedJson)?.error;
            if (nested) inner = nested;
          } catch {
            // nested text wasn't valid JSON — keep the outer `inner` as-is
          }
        }
      }
      providerCode = inner?.code ?? null;
      providerMessage = inner?.message ?? null;
    } catch {
      // body wasn't JSON — fall through to the raw text
    }

    super(providerMessage || `OpenRouter video submit failed (${status}): ${body.slice(0, 500)}`);
    this.name = "VideoSubmitError";
    this.status = status;
    this.retryable = status >= 500;
    this.providerCode = providerCode;
  }
}

const authHeaders = () => ({
  Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
  "Content-Type": "application/json",
  "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:3000",
  "X-Title": "AI Colab Chat",
});

export interface FrameImage {
  url: string;
  frameType: "first_frame" | "last_frame";
}

export interface SubmitVideoJobParams {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  callbackUrl?: string;
  /** Image-to-video: URLs only, no base64 — see OpenRouter's frame_images. */
  frameImages?: FrameImage[];
}

export interface SubmitVideoJobResult {
  id: string;
  status: string;
  pollingUrl: string;
}

export const submitVideoJob = async (
  params: SubmitVideoJobParams,
): Promise<SubmitVideoJobResult> => {
  const response = await fetch(`${BASE_URL}/videos`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      duration: params.duration,
      resolution: params.resolution,
      aspect_ratio: params.aspectRatio,
      callback_url: params.callbackUrl,
      frame_images: params.frameImages?.map((f) => ({
        type: "image_url",
        image_url: { url: f.url },
        frame_type: f.frameType,
      })),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new VideoSubmitError(response.status, text);
  }

  const data = (await response.json()) as {
    id: string;
    status: string;
    polling_url: string;
  };

  return { id: data.id, status: data.status, pollingUrl: data.polling_url };
};

export type VideoJobStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export interface VideoJobPollResult {
  id: string;
  status: VideoJobStatus;
  unsignedUrls: string[];
  costUsd: number | null;
  error: string | null;
}

export const pollVideoJob = async (jobId: string): Promise<VideoJobPollResult> => {
  const response = await fetch(`${BASE_URL}/videos/${jobId}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter video poll failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    id: string;
    status: VideoJobStatus;
    unsigned_urls?: string[];
    usage?: { cost?: number };
    error?: string;
  };

  return {
    id: data.id,
    status: data.status,
    unsignedUrls: data.unsigned_urls ?? [],
    costUsd: data.usage?.cost ?? null,
    error: data.error ?? null,
  };
};

/**
 * Downloads the finished MP4 bytes for a completed job so they can be
 * re-uploaded to Cloudinary — OpenRouter's own URLs are not meant to be the
 * permanent home for the file (see the ZDR/retention note in their docs).
 */
export const downloadVideoContent = async (
  jobId: string,
  index = 0,
): Promise<Buffer> => {
  const response = await fetch(`${BASE_URL}/videos/${jobId}/content?index=${index}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter video download failed (${response.status}) for job ${jobId}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export interface VideoModelInfo {
  id: string;
  supportedDurations: number[];
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  pricingPerVideoSecond: string | null;
}

/**
 * Lists OpenRouter's available video models with their supported
 * durations/resolutions/aspect ratios and pricing — used to validate a
 * create request against what the chosen model actually supports, rather
 * than trusting the caller.
 */
export const listVideoModels = async (): Promise<VideoModelInfo[]> => {
  const response = await fetch(`${BASE_URL}/videos/models`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter video models fetch failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    data: Array<{
      id: string;
      supported_durations?: number[];
      supported_resolutions?: string[];
      supported_aspect_ratios?: string[];
      pricing_skus?: Record<string, string>;
    }>;
  };

  return data.data.map((m) => ({
    id: m.id,
    supportedDurations: m.supported_durations ?? [],
    supportedResolutions: m.supported_resolutions ?? [],
    supportedAspectRatios: m.supported_aspect_ratios ?? [],
    pricingPerVideoSecond: m.pricing_skus?.["per-video-second"] ?? null,
  }));
};
