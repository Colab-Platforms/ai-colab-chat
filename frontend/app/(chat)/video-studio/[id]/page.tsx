"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  AudioLines,
  Captions,
  Crop,
  Download,
  ImagePlus,
  Loader2,
  Maximize,
  Pencil,
  Plus,
  RotateCw,
  Timer,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { videoService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useVideoJob } from "@/hooks/use-video-job";
import { useVideoDraft } from "@/hooks/use-video-draft";
import type { GeneratedVideo } from "@/components/chat/video-card";
import type { VideoModelOption } from "@/components/chat/video-generate-dialog";
import { ChipSelect } from "@/components/studio/studio-parts";
import { MultiImageDialog, MAX_STUDIO_IMAGES } from "@/components/studio/multi-image-dialog";
import {
  JobChecklist,
  JobMessageStage,
  JobProgressStage,
  MetaCell,
  MetaGrid,
  SessionStrip,
  StatusPill,
} from "@/components/studio/video-job-parts";
import {
  etaSecondsFor,
  formatSecondsLeft,
  isVideoFailure,
  isVideoWorking,
  percentFor,
  stageIndexFor,
} from "@/components/studio/video-job-progress";

const FAILURE_TITLE: Record<string, string> = {
  FAILED: "Couldn't generate the video",
  CANCELLED: "Generation cancelled",
  EXPIRED: "Generation expired",
};

/** Provider errors carry a request id that means nothing to the user. */
const cleanErrorMessage = (message?: string | null): string =>
  (message ?? "").replace(/\s*request\s*id\s*:.*$/i, "").trim();

const relativeStart = (iso?: string | null): string => {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export default function VideoJobPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const videoId = Number(params?.id);

  const { video, loading, error, working, timedOut, apply, refresh } = useVideoJob(
    Number.isFinite(videoId) ? videoId : null,
  );

  const [models, setModels] = useState<VideoModelOption[]>([]);
  const [session, setSession] = useState<GeneratedVideo[]>([]);
  const [percent, setPercent] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "cancel" | "retry" | "regenerate" | "delete" | "download">(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoService
      .listModels()
      .then((res) => setModels(res.data?.data || []))
      .catch(() => {
        /* names fall back to the model id */
      });
  }, []);

  const model = useMemo(() => models.find((m) => m.id === video?.modelId), [models, video?.modelId]);

  /* ---------------- session history ---------------- */

  const loadSession = useCallback(async () => {
    if (!video?.chatId) {
      setSession([]);
      return;
    }
    try {
      // No status filter: a job that's still rendering has to show up here too.
      const res = await videoService.list({ chatId: String(video.chatId), limit: "50" });
      const items: GeneratedVideo[] = res.data?.data?.items || [];
      // The API orders newest first; the strip reads as a timeline.
      setSession([...items].reverse());
    } catch {
      /* the strip is additive — leaving it empty is fine */
    }
  }, [video?.chatId]);

  // `loadSession` is keyed on the chat, but regenerating stays in the same
  // chat while the id changes — without `videoId` here the new row would
  // never appear in the strip.
  useEffect(() => {
    void loadSession();
  }, [loadSession, videoId]);

  // Keep the strip's badges honest as the active job moves through states.
  useEffect(() => {
    if (!video) return;
    setSession((prev) => {
      const current = prev.find((item) => item.id === video.id);
      if (!current || current === video) return prev;
      return prev.map((item) => (item.id === video.id ? video : item));
    });
  }, [video]);

  /* ---------------- progress ---------------- */

  const etaSeconds = useMemo(
    () =>
      video
        ? etaSecondsFor({
            externalId: model?.externalId,
            resolution: video.resolution,
            duration: video.duration,
          })
        : 60,
    [video, model?.externalId],
  );

  /**
   * Where the progress bar counts from. Seeded with `createdAt` so reloading
   * mid-render resumes at the right place rather than starting over, and
   * reset by hand on a retry, whose row keeps its original `createdAt`.
   *
   * Keyed off `video.id` rather than the route's `videoId` — when navigating
   * from one job straight to another (e.g. clicking the session strip), the
   * `video` object for the *previous* job is still what's in state for a
   * render or two before the new one loads. Resetting on `videoId` alone
   * read that stale `createdAt`, so returning to a still-generating job
   * reseeded its clock from whatever was last on screen and made the bar
   * appear to restart.
   */
  const clockBase = useRef(Date.now());
  const clockBaseForId = useRef<number | null>(null);

  useEffect(() => {
    if (!video || video.id !== videoId || clockBaseForId.current === videoId) return;
    clockBaseForId.current = videoId;
    clockBase.current = video.createdAt ? new Date(video.createdAt).getTime() : Date.now();
    setPercent(0);
  }, [video, videoId]);

  useEffect(() => {
    if (!video) return;
    if (video.status === "COMPLETED") {
      setPercent(100);
      return;
    }
    if (!isVideoWorking(video.status)) return;

    const tick = () =>
      setPercent((previous) =>
        percentFor({
          status: video.status,
          elapsedSeconds: (Date.now() - clockBase.current) / 1000,
          etaSeconds,
          previous,
        }),
      );
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [video, etaSeconds]);

  /* ---------------- actions ---------------- */

  const paramsOf = (source: GeneratedVideo) => ({
    prompt: source.prompt,
    modelId: source.modelId,
    duration: source.duration,
    resolution: source.resolution,
    aspectRatio: source.aspectRatio,
    chatId: source.chatId ?? undefined,
    imageUrls: source.referenceImageUrls?.length ? source.referenceImageUrls : undefined,
    firstFrameUrl: source.firstFrameUrl ?? undefined,
    referenceAudioUrl: source.referenceAudioUrl ?? undefined,
  });

  const startNewVideo = useCallback(
    async (payload: Parameters<typeof videoService.create>[0], label: typeof busy) => {
      setBusy(label);
      try {
        const res = await videoService.create(payload);
        const newId = res.data?.data?.id;
        if (!newId) throw new Error("The server didn't return the new video");
        setEditing(false);
        router.push(`/video-studio/${newId}`);
      } catch (err: any) {
        const response = err?.response?.data;
        const message: string = response?.message ?? err?.message ?? "Couldn't start the video";
        if (response?.code === "PLAN_RESTRICTED") toast.error(`${message} — upgrade your plan to unlock this.`);
        else if (message.toLowerCase().includes("insufficient")) toast.error(`${message} — top up your video credits.`);
        else toast.error(message);
        setBusy(null);
      }
    },
    [router],
  );

  const handleCancel = async () => {
    if (!video) return;
    setBusy("cancel");
    try {
      const res = await videoService.cancel(video.id);
      if (res.data?.data) apply(res.data.data);
      else await refresh();
      toast.success("Generation cancelled — your credits are back.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't cancel this video");
    } finally {
      setBusy(null);
    }
  };

  const handleRetry = async () => {
    if (!video) return;
    setBusy("retry");
    try {
      const res = await videoService.retry(video.id);
      if (res.data?.data) apply(res.data.data);
      else await refresh();
      clockBaseForId.current = videoId;
      clockBase.current = Date.now();
      setPercent(0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't restart this video");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!video) return;
    setBusy("delete");
    try {
      await videoService.delete(video.id);
      const remaining = session.filter((item) => item.id !== video.id);
      if (remaining.length > 0) router.push(`/video-studio/${remaining[remaining.length - 1].id}`);
      else router.push("/video-studio");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't delete this video");
      setBusy(null);
    }
  };

  /**
   * A plain `<a download>` on a Cloudinary URL is silently ignored — the
   * attribute only applies to same-origin links — so fetch the bytes and
   * download from a blob: URL instead. Same approach as VideoCard.
   */
  const handleDownload = async () => {
    if (!video?.fileUrl) return;
    setBusy("download");
    try {
      const response = await fetch(video.fileUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = blobUrl;
      link.download = `video-${video.id}.mp4`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Couldn't download the video — try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleFullscreen = () => {
    const el = playerRef.current as (HTMLVideoElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else el.webkitRequestFullscreen?.();
  };

  const handleSessionDelete = async (id: number) => {
    if (id === video?.id) {
      await handleDelete();
      return;
    }
    try {
      await videoService.delete(id);
      setSession((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't delete that version");
    }
  };

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center">
        <div>
          <p className="text-sm font-medium">{error ?? "This video isn't available."}</p>
          <Link href="/video-studio" className="mt-3 inline-block text-sm text-primary hover:underline">
            Back to Video Studio
          </Link>
        </div>
      </div>
    );
  }

  const stageIndex = stageIndexFor(video.status, percent);
  const failed = isVideoFailure(video.status);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col px-4 py-5 sm:px-6">
      <header className="mb-5 flex shrink-0 items-center justify-between gap-3">
        <Link
          href="/video-studio"
          className="inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Video Studio
        </Link>
        <Button variant="outline" size="sm" onClick={() => router.push("/video-studio")}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New video
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 min-w-0 flex-col">
          {working ? (
            timedOut ? (
              <JobMessageStage
                title="This is taking longer than usual"
                body="We've stopped checking for now. Reload the page to pick the job back up — it's still running on our side."
              />
            ) : (
              <JobProgressStage
                percent={percent}
                stageIndex={stageIndex}
                secondsLeft={formatSecondsLeft(etaSeconds, (Date.now() - clockBase.current) / 1000)}
              />
            )
          ) : failed ? (
            <JobMessageStage
              title={FAILURE_TITLE[video.status] ?? "Couldn't generate the video"}
              body={
                video.status === "CANCELLED"
                  ? `${video.reservedTokens ?? 0} credits went back to your balance.`
                  : cleanErrorMessage(video.lastError) || "Something went wrong while generating this video."
              }
            />
          ) : (
            <div className="group relative min-h-0 flex-1">
              <video
                ref={playerRef}
                src={video.fileUrl ?? undefined}
                poster={video.thumbnailUrl ?? undefined}
                controls
                preload="metadata"
                className="h-full w-full rounded-2xl bg-black object-contain"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                title="Fullscreen"
                onClick={handleFullscreen}
                className="absolute right-3 top-3 h-8 w-8 rounded-lg p-0 opacity-0 shadow transition-opacity group-hover:opacity-100"
              >
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <SessionStrip
            items={session}
            activeId={video.id}
            activePercent={percent}
            onSelect={(id) => {
              setEditing(false);
              router.push(`/video-studio/${id}`);
            }}
            onDelete={handleSessionDelete}
          />
        </section>

        {editing ? (
          <EditSidebar
            key={video.id}
            video={video}
            busy={busy === "regenerate"}
            onCancel={() => setEditing(false)}
            onGenerate={(payload) => startNewVideo({ ...payload, chatId: video.chatId ?? undefined }, "regenerate")}
          />
        ) : (
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 lg:h-full">
            <StatusPill
              tone={working ? "working" : failed ? "failed" : "ready"}
              label={
                working
                  ? "Generating"
                  : video.status === "CANCELLED"
                    ? "Cancelled"
                    : failed
                      ? "Failed"
                      : "Ready"
              }
            />

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Prompt</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{video.prompt}</p>
            </div>

            {working && !timedOut && <JobChecklist stageIndex={stageIndex} />}

            <div className="h-px bg-border" />

            <MetaGrid>
              <MetaCell label="Model">{model?.name ?? `Model ${video.modelId ?? "?"}`}</MetaCell>
              <MetaCell label="Duration">{video.duration} s</MetaCell>
              <MetaCell label="Resolution">{video.resolution}</MetaCell>
              <MetaCell label="Aspect ratio">{video.aspectRatio}</MetaCell>
              <MetaCell label="Credits">{video.reservedTokens ?? "—"}</MetaCell>
              <MetaCell label="Started">{relativeStart(video.createdAt)}</MetaCell>
            </MetaGrid>

            <Attachments video={video} />

            {working ? (
              <>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  You can leave this page. The video keeps generating and shows up in Your videos.
                </p>
                <Button variant="outline" className="w-full" disabled={busy === "cancel"} onClick={handleCancel}>
                  {busy === "cancel" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Cancel generation
                </Button>
              </>
            ) : failed ? (
              <div className="flex flex-col gap-2.5">
                {video.status === "FAILED" && (
                  <>
                    <Button className="w-full" disabled={busy === "retry"} onClick={handleRetry}>
                      {busy === "retry" ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="mr-2 h-3.5 w-3.5" />
                      )}
                      Try again
                    </Button>
                    <p className="-mt-1 text-center text-[10.5px] text-faint">
                      Reserves {video.reservedTokens ?? 0} credits again — the failed run was refunded
                    </p>
                  </>
                )}
                <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit prompt
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground hover:text-destructive"
                  disabled={busy === "delete"}
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <Button className="w-full" disabled={busy === "download" || !video.fileUrl} onClick={handleDownload}>
                  {busy === "download" ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-3.5 w-3.5" />
                  )}
                  Download
                </Button>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="outline"
                    disabled={busy === "regenerate"}
                    onClick={() => startNewVideo(paramsOf(video), "regenerate")}
                  >
                    {busy === "regenerate" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Regenerate
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit prompt
                  </Button>
                </div>
                <p className="-mt-1 text-center text-[10.5px] text-faint">
                  Each new run uses another {video.reservedTokens ?? 0} credits
                </p>
                <Button
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground hover:text-destructive"
                  disabled={busy === "delete"}
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete video
                </Button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/* ---------------- attachments (read-only) ---------------- */

function Attachments({ video }: { video: GeneratedVideo }) {
  const images = video.referenceImageUrls?.length
    ? video.referenceImageUrls
    : video.firstFrameUrl
      ? [video.firstFrameUrl]
      : [];
  if (images.length === 0 && !video.referenceAudioUrl) return null;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Attachments</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt={`Reference ${i + 1}`}
            loading="lazy"
            className="h-[46px] w-[46px] rounded-lg border border-border object-cover"
          />
        ))}
        {video.referenceAudioUrl && (
          <span className="inline-flex h-[46px] items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground">
            <AudioLines className="h-3.5 w-3.5" />
            Reference audio
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- editable sidebar ---------------- */

/**
 * Edit happens in place: the same sidebar fields the user was just reading
 * become inputs, with the player still visible beside them. Submitting makes
 * a new video rather than altering this one, so the session keeps both.
 */
function EditSidebar({
  video,
  busy,
  onCancel,
  onGenerate,
}: {
  video: GeneratedVideo;
  busy: boolean;
  onCancel: () => void;
  onGenerate: (payload: {
    prompt: string;
    modelId: number;
    duration: number;
    resolution: string;
    aspectRatio: string;
    imageUrls?: string[];
    referenceAudioUrl?: string;
  }) => void;
}) {
  const draft = useVideoDraft({
    prompt: video.prompt,
    modelId: video.modelId ?? null,
    duration: video.duration,
    resolution: video.resolution,
    aspectRatio: video.aspectRatio,
    imageUrls: video.referenceImageUrls?.length
      ? video.referenceImageUrls
      : video.firstFrameUrl
        ? [video.firstFrameUrl]
        : [],
    referenceAudioUrl: video.referenceAudioUrl,
  });
  const [imagesOpen, setImagesOpen] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const previousCredits = video.reservedTokens ?? null;
  const delta = draft.estimate !== null && previousCredits !== null ? draft.estimate - previousCredits : null;
  const canGenerate = draft.ready && !draft.insufficient && !busy;

  const submit = () => {
    if (!canGenerate || !draft.modelId) return;
    onGenerate({
      prompt: draft.prompt.trim(),
      modelId: draft.modelId,
      duration: draft.duration,
      resolution: draft.resolution,
      aspectRatio: draft.aspectRatio,
      imageUrls: draft.images.length > 0 ? draft.images.map((i) => i.fileUrl) : undefined,
      referenceAudioUrl: draft.audio?.fileUrl || undefined,
    });
  };

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 lg:h-full">
      <StatusPill tone="working" label="Editing" />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Prompt</p>
        <textarea
          value={draft.prompt}
          onChange={(e) => draft.setPrompt(e.target.value)}
          maxLength={60000}
          rows={5}
          className="mt-1.5 w-full resize-y rounded-xl border border-border bg-sunken px-2.5 py-2 text-[13.5px] leading-relaxed outline-none focus:border-primary"
        />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Attachments</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {draft.images.map((image) => (
            <span key={image.id} className="relative">
              <img
                src={image.previewUrl}
                alt={image.name}
                className="h-[46px] w-[46px] rounded-lg border border-border object-cover"
              />
              {image.uploading && (
                <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/45">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                </span>
              )}
            </span>
          ))}
          <button
            type="button"
            title={draft.supportsImageToVideo ? "Change images" : "This model can't start from an image"}
            disabled={!draft.supportsImageToVideo}
            onClick={() => setImagesOpen(true)}
            className="grid h-[46px] w-[46px] place-items-center rounded-lg border border-dashed border-border text-faint hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          {draft.audio ? (
            <span className="inline-flex h-[46px] items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground">
              <AudioLines className="h-3.5 w-3.5" />
              Audio
              <button type="button" title="Remove reference audio" onClick={draft.clearAudio} className="text-faint hover:text-foreground">
                ×
              </button>
            </span>
          ) : (
            <>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) draft.handleAudio(f);
                }}
              />
              <button
                type="button"
                title={
                  draft.supportsAudioReference
                    ? "Add a reference voice / audio"
                    : "This model generates its own audio"
                }
                disabled={!draft.supportsAudioReference}
                onClick={() => audioInputRef.current?.click()}
                className="grid h-[46px] w-[46px] place-items-center rounded-lg border border-dashed border-border text-faint hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AudioLines className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      <MetaGrid>
        <MetaCell label="Model">
          {draft.models.length > 0 && draft.modelId !== null ? (
            <ChipSelect
              icon={VideoIcon}
              title="Video model"
              value={draft.modelId}
              options={draft.models.map((m) => ({
                value: m.id,
                label: m.name,
                disabled: !m.allowedForPlan,
                hint: !m.allowedForPlan && m.unlockPlanName ? m.unlockPlanName : undefined,
              }))}
              onChange={(v) => draft.setModelId(Number(v))}
            />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </MetaCell>
        <MetaCell label="Duration">
          <ChipSelect
            icon={Timer}
            title="Duration"
            value={draft.duration}
            options={draft.constraints.durations.map((d) => ({ value: d, label: `${d}s` }))}
            onChange={draft.setDuration}
          />
        </MetaCell>
        <MetaCell label="Resolution">
          <ChipSelect
            icon={Captions}
            title="Resolution"
            value={draft.resolution}
            options={draft.constraints.resolutions.map((r) => ({ value: r, label: r }))}
            onChange={draft.setResolution}
          />
        </MetaCell>
        <MetaCell label="Aspect ratio">
          <ChipSelect
            icon={Crop}
            title="Aspect ratio"
            value={draft.aspectRatio}
            options={draft.constraints.aspectRatios.map((a) => ({ value: a, label: a }))}
            onChange={draft.setAspectRatio}
          />
        </MetaCell>
        <MetaCell label="Credits" full>
          <span className={cn(draft.insufficient && "text-warn")}>{draft.estimate ?? "—"}</span>
          {delta !== null && delta !== 0 && (
            <span
              className={cn(
                "ml-2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold",
                delta > 0 ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta} vs last run
            </span>
          )}
        </MetaCell>
      </MetaGrid>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-2.5">
        <Button className="w-full" disabled={!canGenerate} onClick={submit}>
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Generate{draft.estimate !== null ? ` · ${draft.estimate} credits` : ""}
        </Button>
        <p className="-mt-1 text-center text-[10.5px] text-faint">
          {draft.insufficient
            ? "Not enough video credits for these settings"
            : "Makes a new video — the current one stays in this session"}
        </p>
        <Button variant="outline" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <MultiImageDialog
        open={imagesOpen}
        onOpenChange={setImagesOpen}
        images={draft.images}
        onConfirm={draft.setImages}
        maxImages={draft.maxImages}
        limitNote={
          draft.maxImages > 0 && draft.maxImages < MAX_STUDIO_IMAGES
            ? `${draft.model?.name} only uses a first and last frame, so up to ${draft.maxImages} images.`
            : null
        }
      />
    </aside>
  );
}
