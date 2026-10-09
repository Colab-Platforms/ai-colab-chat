"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Download, Film, Loader2, Maximize, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { videoService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type VideoStatus =
  | "PENDING"
  | "SUBMITTED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface GeneratedVideo {
  id: number;
  status: VideoStatus;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  fileUrl?: string | null;
  fileSize?: number | null;
  lastError?: string | null;
  reservedTokens?: number;
  createdAt?: string;
}

/**
 * Generation outlives any request/response cycle — a video can take from
 * ~20 seconds to a few minutes on the provider's side — so this card owns
 * its own polling lifecycle, same pattern as DocumentCard.
 */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 6 * 60 * 1000;

const STAGES_BY_STATUS: Record<string, string> = {
  PENDING: "Queuing your request",
  SUBMITTED: "Rendering your video — this can take a couple of minutes",
};

const formatBytes = (bytes?: number | null): string => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isTerminalFailure = (status: VideoStatus) =>
  status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";

const FAILURE_LABEL: Record<string, string> = {
  FAILED: "Couldn't generate the video",
  CANCELLED: "Video generation was cancelled",
  EXPIRED: "Video generation expired",
};

const cleanErrorMessage = (message?: string | null): string =>
  (message ?? "").replace(/\s*request\s*id\s*:.*$/i, "").trim();

export function VideoCard({
  video: initial,
  className,
  onDeleted,
}: {
  video: GeneratedVideo;
  className?: string;
  onDeleted?: (id: number) => void;
}) {
  const [video, setVideo] = useState<GeneratedVideo>(initial);
  const startedAt = useRef(Date.now());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isWorking = video.status === "PENDING" || video.status === "SUBMITTED";

  useEffect(() => {
    setVideo((prev) => (initial.status !== prev.status ? initial : prev));
  }, [initial]);

  useEffect(() => {
    if (!isWorking) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > MAX_POLL_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await videoService.getById(video.id);
        if (!cancelled && res.data?.data) setVideo(res.data.data);
      } catch {
        // Transient failures are fine — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [video.id, isWorking]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await videoService.delete(video.id);
      onDeleted?.(video.id);
    } catch {
      setIsDeleting(false);
    }
  }, [video.id, onDeleted]);

  /**
   * A plain `<a download>` on a Cloudinary URL is silently ignored by the
   * browser — the `download` attribute only applies to same-origin links,
   * so clicking it just opens the video in a new tab instead of saving it.
   * Fetching the bytes ourselves and downloading from a same-origin
   * blob: URL is what actually makes "Download" download.
   */
  const handleDownload = useCallback(async () => {
    if (!video.fileUrl) return;
    setIsDownloading(true);
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
      setIsDownloading(false);
    }
  }, [video.fileUrl, video.id]);

  const handleFullscreen = useCallback(() => {
    const el = videoRef.current as (HTMLVideoElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else el.webkitRequestFullscreen?.();
  }, []);

  /* ---------------- generating ---------------- */
  if (isWorking) {
    return (
      <div
        className={cn(
          "relative mt-2 w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-muted/30 px-4 py-3",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[vidcard-shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />

        <div className="relative flex items-start gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Film className="h-4 w-4 text-primary" />
            <span className="absolute inset-0 rounded-lg border border-primary/30 animate-ping" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <p className="truncate text-sm font-medium">Generating your video…</p>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.prompt}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {STAGES_BY_STATUS[video.status] ?? "Working"} · you can keep chatting
            </p>
          </div>
        </div>

        <style jsx>{`
          @keyframes vidcard-shimmer {
            100% {
              transform: translateX(100%);
            }
          }
        `}</style>
      </div>
    );
  }

  /* ---------------- failed / cancelled / expired ---------------- */
  if (isTerminalFailure(video.status)) {
    return (
      <div
        className={cn(
          "mt-2 w-full max-w-md rounded-2xl border border-border/60 bg-muted/30 px-4 py-3",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {FAILURE_LABEL[video.status] ?? "Couldn't generate the video"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {cleanErrorMessage(video.lastError) || "Something went wrong while generating the video."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- ready ---------------- */
  return (
    <div
      className={cn(
        "group mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      {video.fileUrl && (
        <div className="relative">
          <video
            ref={videoRef}
            src={video.fileUrl}
            controls
            className="aspect-video w-full rounded-t-2xl bg-black"
            preload="metadata"
          />
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="absolute right-2 top-2 h-7 w-7 rounded-full p-0 opacity-0 shadow transition-opacity group-hover:opacity-100"
            title="Fullscreen"
            onClick={handleFullscreen}
          >
            <Maximize className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{video.prompt}</p>
          <p className="text-xs text-muted-foreground">
            {video.duration}s · {video.resolution}
            {video.fileSize ? ` · ${formatBytes(video.fileSize)}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {video.fileUrl && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="h-8 text-xs"
              disabled={isDownloading}
              onClick={handleDownload}
            >
              {isDownloading ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3 w-3" />
              )}
              Download
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-8 px-2 text-muted-foreground hover:text-destructive"
            title="Delete"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
