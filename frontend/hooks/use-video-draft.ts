"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { creditWalletService, videoService } from "@/lib/services";
import { toast } from "@/lib/toast";
import {
  AUDIO_REFERENCE_MODELS,
  constraintsFor,
  IMAGE_TO_VIDEO_MODELS,
  MAX_REFERENCE_AUDIO_SECONDS,
  maxImagesFor,
  type VideoModelOption,
} from "@/components/chat/video-generate-dialog";
import type { StudioImage } from "@/components/studio/multi-image-dialog";

export const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;

export interface ReferenceAudio {
  fileUrl: string;
  previewUrl: string;
  name: string;
  durationSec: number;
  uploading: boolean;
}

/** Reads a local audio file's length from its metadata, before uploading it. */
const readAudioDuration = (url: string) =>
  new Promise<number>((resolve, reject) => {
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error("Couldn't read this audio file"));
    el.src = url;
  });

export interface VideoDraftSeed {
  prompt?: string;
  modelId?: number | null;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  imageUrls?: string[];
  referenceAudioUrl?: string | null;
}

/**
 * Everything the two video composers have in common: the model list, the
 * settings, the attachments, and the credit maths. The studio page renders it
 * as a chat-style composer and the job page renders it as editable fields in
 * the sidebar, but the rules (what a model allows, what a clip costs, when a
 * switch invalidates the current settings) are identical and live here.
 */
export function useVideoDraft(seed?: VideoDraftSeed) {
  const [models, setModels] = useState<VideoModelOption[]>([]);
  const [modelId, setModelId] = useState<number | null>(seed?.modelId ?? null);
  const [prompt, setPrompt] = useState(seed?.prompt ?? "");
  const [duration, setDuration] = useState(seed?.duration ?? 5);
  const [resolution, setResolution] = useState(seed?.resolution ?? "720p");
  const [aspectRatio, setAspectRatio] = useState(seed?.aspectRatio ?? "16:9");
  const [images, setImages] = useState<StudioImage[]>(() =>
    (seed?.imageUrls ?? []).map((url, i) => ({
      id: `seed-${i}-${url}`,
      name: `Image ${i + 1}`,
      fileUrl: url,
      previewUrl: url,
      uploading: false,
    })),
  );
  const [audio, setAudio] = useState<ReferenceAudio | null>(() =>
    seed?.referenceAudioUrl
      ? {
          fileUrl: seed.referenceAudioUrl,
          previewUrl: seed.referenceAudioUrl,
          name: "Reference audio",
          durationSec: 0,
          uploading: false,
        }
      : null,
  );
  const [credits, setCredits] = useState<number | null>(null);

  // Only the first model list decides the default — a later refetch must not
  // yank the user's chosen model out from under them.
  const pickedDefault = useRef(seed?.modelId != null);

  useEffect(() => {
    videoService
      .listModels()
      .then((res) => {
        const items: VideoModelOption[] = res.data?.data || [];
        setModels(items);
        if (pickedDefault.current) return;
        const first = items.find((m) => m.allowedForPlan) ?? items[0];
        if (first) {
          setModelId(first.id);
          pickedDefault.current = true;
        }
      })
      .catch(() => toast.error("Couldn't load video models"));
    creditWalletService
      .get()
      .then((res) => setCredits(res.data?.data?.creditsRemaining ?? null))
      .catch(() => setCredits(null));
  }, []);

  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const constraints = constraintsFor(model);
  const supportsImageToVideo = model ? IMAGE_TO_VIDEO_MODELS.has(model.externalId) : false;
  const maxImages = maxImagesFor(model);
  const hasImageInput = images.some((i) => i.fileUrl);
  const imagesUploading = images.some((i) => i.uploading);
  const supportsAudioReference = model ? AUDIO_REFERENCE_MODELS.has(model.externalId) : false;

  const clearAudio = useCallback(() => {
    setAudio((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  // A model switch must not leave behind a duration / resolution / ratio or
  // an image count the new model would reject.
  useEffect(() => {
    if (!model) return;
    if (!constraints.durations.includes(duration)) {
      const closest = constraints.durations.reduce((a, b) => (Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
      setDuration(closest);
    }
    if (!constraints.resolutions.includes(resolution)) setResolution(constraints.resolutions[0]);
    if (!constraints.aspectRatios.includes(aspectRatio)) setAspectRatio(constraints.aspectRatios[0]);
    if (images.length > maxImages) {
      images.slice(maxImages).forEach((i) => URL.revokeObjectURL(i.previewUrl));
      setImages(images.slice(0, maxImages));
      if (maxImages > 0) toast.error(`${model.name} uses at most ${maxImages} images — extra ones were removed.`);
    }
    if (!supportsAudioReference) clearAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const costPerSecond = model
    ? (hasImageInput ? model.creditCostPerSecondByResolutionImageInput?.[resolution] : undefined) ??
      model.creditCostPerSecondByResolution?.[resolution] ??
      model.creditCostPerSecond
    : null;
  const estimate = costPerSecond != null ? Math.ceil(duration * costPerSecond) : null;
  const insufficient = estimate !== null && credits !== null && estimate > credits;

  const removeImage = useCallback(
    (id: string) =>
      setImages((prev) => {
        const gone = prev.find((i) => i.id === id);
        if (gone) URL.revokeObjectURL(gone.previewUrl);
        return prev.filter((i) => i.id !== id);
      }),
    [],
  );

  const handleAudio = useCallback(async (file: File) => {
    if (file.size > MAX_REFERENCE_AUDIO_BYTES) {
      toast.error("Reference audio must be 10 MB or smaller.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    let durationSec: number;
    try {
      durationSec = await readAudioDuration(previewUrl);
    } catch (err: any) {
      toast.error(err.message);
      URL.revokeObjectURL(previewUrl);
      return;
    }
    if (durationSec > MAX_REFERENCE_AUDIO_SECONDS) {
      toast.error(
        `Reference audio can be at most ${MAX_REFERENCE_AUDIO_SECONDS} seconds long (this one is ${Math.round(durationSec)}s).`,
      );
      URL.revokeObjectURL(previewUrl);
      return;
    }

    const base = { previewUrl, name: file.name, durationSec };
    setAudio({ ...base, fileUrl: "", uploading: true });
    try {
      const res = await videoService.uploadReferenceAudio(file);
      setAudio({ ...base, fileUrl: res.data.data.url, uploading: false });
    } catch (err: any) {
      toast.error(`Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`);
      URL.revokeObjectURL(previewUrl);
      setAudio(null);
    }
  }, []);

  const ready = Boolean(prompt.trim() && modelId && model?.allowedForPlan && !imagesUploading && !audio?.uploading);

  return {
    models,
    model,
    modelId,
    setModelId,
    prompt,
    setPrompt,
    duration,
    setDuration,
    resolution,
    setResolution,
    aspectRatio,
    setAspectRatio,
    images,
    setImages,
    removeImage,
    audio,
    handleAudio,
    clearAudio,
    credits,
    constraints,
    maxImages,
    supportsImageToVideo,
    supportsAudioReference,
    imagesUploading,
    estimate,
    insufficient,
    /** Prompt, a usable model, and nothing still uploading. Callers add their own plan checks. */
    ready,
  };
}
