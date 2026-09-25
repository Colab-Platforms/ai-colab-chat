"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, Loader2, Lock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { attachmentService, videoService, creditWalletService } from "@/lib/services";
import { toast } from "@/lib/toast";

export interface VideoModelOption {
  id: number;
  name: string;
  description?: string | null;
  externalId: string;
  creditCostPerSecond: number;
  /** Per-resolution credit rate, when the model's real price varies by
   * resolution (e.g. Seedance 2.0 is ~11x pricier at 4K than 480p) — takes
   * priority over the flat creditCostPerSecond above when present. */
  creditCostPerSecondByResolution?: Record<string, number> | null;
  /** Same shape, but for image-to-video — some models (Seedance) charge
   * LESS when a frame image is supplied. Falls back to the map above when
   * absent (true for Veo, which has no distinct image-input rate). */
  creditCostPerSecondByResolutionImageInput?: Record<string, number> | null;
  /** Whether the current user's plan is allowed to use this model — locked
   * models are still shown (not hidden) with an upgrade badge. */
  allowedForPlan: boolean;
  unlockPlanName?: string | null;
}

/**
 * Duration/resolution/aspect-ratio limits per model, taken from OpenRouter's
 * own live GET /api/v1/videos/models catalogue (not the marketing page,
 * which rounds these down to a range) — the backend cross-checks the same
 * live data too, but offering only valid options here means a request never
 * round-trips just to fail. Falls back to a conservative default for any
 * model not listed here yet.
 */
const MODEL_CONSTRAINTS: Record<
  string,
  { durations: number[]; resolutions: string[]; aspectRatios: string[] }
> = {
  "bytedance/seedance-2.0": {
    durations: [4, 6, 8, 10, 12, 15],
    resolutions: ["480p", "720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16", "1:1"],
  },
  "bytedance/seedance-2.0-mini": {
    durations: [4, 6, 8, 10, 12, 15],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
  },
  // OpenRouter's actual supported_durations for this model is exactly
  // [4, 6, 8] — not every integer in that range. The dialog used to offer
  // 5s/7s, which the provider would have rejected.
  "google/veo-3.1-lite": {
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
  },
};

const DEFAULT_CONSTRAINTS = {
  durations: [4, 6, 8],
  resolutions: ["720p"],
  aspectRatios: ["16:9"],
};

const constraintsFor = (model: VideoModelOption | undefined) =>
  (model && MODEL_CONSTRAINTS[model.externalId]) || DEFAULT_CONSTRAINTS;

// All 3 current models support image-to-video via first/last frame — this
// stays a per-model flag (rather than assumed universal) since it comes
// from each model's own supported_frame_images in OpenRouter's catalogue.
const IMAGE_TO_VIDEO_MODELS = new Set([
  "bytedance/seedance-2.0",
  "bytedance/seedance-2.0-mini",
  "google/veo-3.1-lite",
]);

export interface VideoGenerateParams {
  prompt: string;
  modelId: number;
  duration: number;
  resolution: string;
  aspectRatio: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
}

interface FrameUpload {
  fileUrl: string;
  previewUrl: string;
  uploading: boolean;
}

function FrameImagePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: FrameUpload | null;
  onChange: (next: FrameUpload | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      onChange({ fileUrl: "", previewUrl, uploading: true });
      try {
        const res = await attachmentService.presend(file);
        onChange({ fileUrl: res.data.data.fileUrl, previewUrl, uploading: false });
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`);
        URL.revokeObjectURL(previewUrl);
        onChange(null);
      }
    },
    [onChange],
  );

  return (
    <div className="flex-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />
      {value ? (
        <div className="relative">
          <img src={value.previewUrl} alt={label} className="h-20 w-full rounded-md object-cover" />
          {value.uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            </div>
          )}
          <button
            type="button"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-background border border-border/60 p-0.5 shadow"
            onClick={() => {
              URL.revokeObjectURL(value.previewUrl);
              onChange(null);
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-[11px]">{label}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Pure form UI — no chatId/chatService knowledge. The caller decides what a
 * submission actually does: create a video in an existing chat, or (from the
 * landing page, where no chat exists yet) create the chat first. This is
 * what lets the same "Video Gen" pill work from both places without video
 * generation becoming a real ChatType/ChatInput capability.
 */
export function VideoGenerateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: VideoGenerateParams) => Promise<void>;
}) {
  const [models, setModels] = useState<VideoModelOption[]>([]);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState<number | null>(null);
  const [duration, setDuration] = useState(4);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [firstFrame, setFirstFrame] = useState<FrameUpload | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameUpload | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);

  // Fetch once per time the dialog opens rather than once on mount — pricing
  // can change, and this dialog can stay mounted in the background for a
  // whole chat session.
  useEffect(() => {
    if (!open) return;
    videoService
      .listModels()
      .then((res) => {
        const items: VideoModelOption[] = res.data?.data || [];
        setModels(items);
        if (items.length > 0) {
          // Default to the first ALLOWED model rather than just items[0] —
          // otherwise a locked (pricier) model could be pre-selected for a
          // user whose plan can't actually use it.
          const firstAllowed = items.find((m) => m.allowedForPlan) ?? items[0];
          setModelId((prev) => prev ?? firstAllowed.id);
        }
      })
      .catch(() => {
        toast.error("Couldn't load video models");
      });
    creditWalletService
      .get()
      .then((res) => setCreditsRemaining(res.data?.data?.creditsRemaining ?? null))
      .catch(() => setCreditsRemaining(null));
  }, [open]);

  const selectedModel = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const constraints = constraintsFor(selectedModel);
  const supportsImageToVideo = selectedModel ? IMAGE_TO_VIDEO_MODELS.has(selectedModel.externalId) : false;
  const hasImageInput = Boolean(firstFrame?.fileUrl || lastFrame?.fileUrl);

  // Keep duration/resolution/aspectRatio valid whenever the model changes —
  // e.g. switching from Seedance (max 15s) to Veo (max 8s) with 12s selected
  // would otherwise silently submit a value Veo rejects. Also clear any
  // frame images the new model doesn't support.
  useEffect(() => {
    if (!constraints.durations.includes(duration)) setDuration(constraints.durations[0]);
    if (!constraints.resolutions.includes(resolution)) setResolution(constraints.resolutions[0]);
    if (!constraints.aspectRatios.includes(aspectRatio)) setAspectRatio(constraints.aspectRatios[0]);
    if (!supportsImageToVideo) {
      setFirstFrame(null);
      setLastFrame(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel?.id]);

  const costPerSecond = selectedModel
    ? (hasImageInput
        ? selectedModel.creditCostPerSecondByResolutionImageInput?.[resolution]
        : undefined) ??
      selectedModel.creditCostPerSecondByResolution?.[resolution] ??
      selectedModel.creditCostPerSecond
    : null;
  const estimatedCredits = costPerSecond != null ? Math.ceil(duration * costPerSecond) : null;
  const insufficientCredits =
    estimatedCredits !== null && creditsRemaining !== null && estimatedCredits > creditsRemaining;

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || !modelId) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        prompt: prompt.trim(),
        modelId,
        duration,
        resolution,
        aspectRatio,
        firstFrameUrl: firstFrame?.fileUrl || undefined,
        lastFrameUrl: lastFrame?.fileUrl || undefined,
      });
      setPrompt("");
      setFirstFrame(null);
      setLastFrame(null);
      onOpenChange(false);
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string; code?: string } } })?.response;
      const message =
        response?.data?.message ?? (err as { message?: string })?.message ?? "Failed to start video generation";
      if (response?.data?.code === "PLAN_RESTRICTED") {
        toast.error(`${message} — upgrade your plan to unlock this.`);
      } else if (message.toLowerCase().includes("insufficient")) {
        toast.error(`${message} — top up your video credits.`);
      } else {
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, modelId, duration, resolution, aspectRatio, firstFrame, lastFrame, onSubmit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a video</DialogTitle>
          <DialogDescription>
            Describe the video you want — this spends your video credits and can take a couple of minutes.
          </DialogDescription>
        </DialogHeader>

        {creditsRemaining !== null && (
          <p className="-mb-1 text-xs text-muted-foreground">
            You have <span className="font-medium text-foreground">{creditsRemaining} credits</span> remaining.
          </p>
        )}

        <Select value={modelId ? String(modelId) : undefined} onValueChange={(v) => setModelId(Number(v))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={String(m.id)} disabled={!m.allowedForPlan}>
                <div className="flex items-center gap-1.5">
                  {!m.allowedForPlan && <Lock className="h-3 w-3 text-muted-foreground" />}
                  <span>{m.name}</span>
                  {!m.allowedForPlan && m.unlockPlanName && (
                    <span className="text-[10px] text-muted-foreground">Requires {m.unlockPlanName}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedModel?.description && (
          <p className="-mt-2 text-xs text-muted-foreground">{selectedModel.description}</p>
        )}

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A slow cinematic push-in on a neon sign in the rain..."
          maxLength={2000}
          className="min-h-24"
        />

        {supportsImageToVideo && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Image-to-video (optional) — {selectedModel?.creditCostPerSecondByResolutionImageInput
                ? "cheaper than text-to-video"
                : "same price as text-to-video"}
            </p>
            <div className="flex gap-2">
              <FrameImagePicker label="First frame" value={firstFrame} onChange={setFirstFrame} />
              <FrameImagePicker label="Last frame" value={lastFrame} onChange={setLastFrame} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              {constraints.durations.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Resolution" />
            </SelectTrigger>
            <SelectContent>
              {constraints.resolutions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              {constraints.aspectRatios.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {insufficientCredits && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Not enough credits for this — you need {estimatedCredits}, you have {creditsRemaining}.{" "}
            <Link href="/profile/wallet" className="underline underline-offset-2">
              Top up credits
            </Link>
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          {estimatedCredits !== null && (
            <p className="text-xs text-muted-foreground">
              Estimated cost: <span className="font-medium text-foreground">{estimatedCredits} credits</span>
              {hasImageInput && " (image-to-video rate)"}
            </p>
          )}
          <Button
            type="button"
            disabled={
              !prompt.trim() ||
              !modelId ||
              isSubmitting ||
              firstFrame?.uploading ||
              lastFrame?.uploading ||
              !selectedModel?.allowedForPlan ||
              insufficientCredits
            }
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
