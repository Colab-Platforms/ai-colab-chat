"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Film, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { videoService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { GeneratedVideo, VideoStatus } from "./video-card";

export type VideoSequenceStatus = "GENERATING" | "STITCHING" | "COMPLETED" | "FAILED";

export interface VideoSequenceClip {
  id: number;
  sequenceOrder: number | null;
  status: VideoStatus;
  prompt: string;
  duration: number;
  firstFrameUrl?: string | null;
  lastError?: string | null;
}

export interface VideoSequence {
  id: number;
  status: VideoSequenceStatus;
  createdAt: string;
  lastError?: string | null;
  clips: VideoSequenceClip[];
  finalVideo?: GeneratedVideo | null;
}

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_MS = 20 * 60 * 1000;

const cleanErrorMessage = (message?: string | null): string =>
  (message ?? "").replace(/\s*request\s*id\s*:.*$/i, "").trim();

const clipFailed = (status: VideoStatus) => status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";

function ClipTile({ clip, index }: { clip: VideoSequenceClip; index: number }) {
  const failed = clipFailed(clip.status);
  const done = clip.status === "COMPLETED";

  return (
    <div
      className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
      title={failed ? cleanErrorMessage(clip.lastError) || "This clip failed" : clip.prompt}
    >
      {clip.firstFrameUrl && (
        <img
          src={clip.firstFrameUrl}
          alt={`Clip ${index + 1}`}
          className={cn("h-full w-full object-cover", !done && "opacity-60")}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          done && "bg-transparent",
          failed && "bg-destructive/30",
          !done && !failed && "bg-black/20",
        )}
      >
        {done ? (
          <span className="absolute bottom-0.5 right-0.5 rounded-full bg-emerald-500 p-0.5">
            <Check className="h-2.5 w-2.5 text-white" />
          </span>
        ) : failed ? (
          <X className="h-4 w-4 text-white drop-shadow" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-white drop-shadow" />
        )}
      </div>
      <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-medium leading-4 text-white">
        {index + 1}
      </span>
    </div>
  );
}

/**
 * Progress view for an image sequence that hasn't produced its final video
 * yet. Owns its own polling (same pattern as VideoCard) and, once the clips
 * are stitched, hands the finished video up so the parent can swap this card
 * for a regular VideoCard.
 */
export function VideoSequenceCard({
  sequence: initial,
  className,
  onCompleted,
  onDeleted,
}: {
  sequence: VideoSequence;
  className?: string;
  onCompleted?: (sequenceId: number, video: GeneratedVideo) => void;
  onDeleted?: (sequenceId: number) => void;
}) {
  const [sequence, setSequence] = useState<VideoSequence>(initial);
  const startedAt = useRef(Date.now());
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isWorking = sequence.status === "GENERATING" || sequence.status === "STITCHING";

  const applyUpdate = useCallback(
    (next: VideoSequence) => {
      setSequence(next);
      if (next.status === "COMPLETED" && next.finalVideo) onCompleted?.(next.id, next.finalVideo);
    },
    [onCompleted],
  );

  useEffect(() => {
    if (!isWorking) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > MAX_POLL_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await videoService.getSequence(sequence.id);
        if (!cancelled && res.data?.data) applyUpdate(res.data.data);
      } catch {
        // Transient failures are fine — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sequence.id, isWorking, applyUpdate]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      const res = await videoService.retrySequence(sequence.id);
      if (res.data?.data) {
        startedAt.current = Date.now();
        setSequence(res.data.data);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? "Couldn't retry";
      toast.error(message.toLowerCase().includes("insufficient") ? `${message} — top up your video credits.` : message);
    } finally {
      setIsRetrying(false);
    }
  }, [sequence.id]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await videoService.deleteSequence(sequence.id);
      onDeleted?.(sequence.id);
    } catch {
      setIsDeleting(false);
    }
  }, [sequence.id, onDeleted]);

  if (sequence.status === "COMPLETED") return null;

  const total = sequence.clips.length;
  const done = sequence.clips.filter((c) => c.status === "COMPLETED").length;
  const failed = sequence.status === "FAILED";

  return (
    <div
      className={cn(
        "relative mt-2 w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-muted/30 px-4 py-3",
        className,
      )}
    >
      {isWorking && (
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[vidseq-shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />
      )}

      <div className="relative flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            failed ? "bg-destructive/10" : "bg-primary/10",
          )}
        >
          {failed ? <AlertCircle className="h-4 w-4 text-destructive" /> : <Film className="h-4 w-4 text-primary" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isWorking && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
            <p className="truncate text-sm font-medium">
              {failed
                ? "Couldn't finish your video sequence"
                : sequence.status === "STITCHING"
                  ? "Combining your clips…"
                  : `Rendering clips · ${done}/${total}`}
            </p>
          </div>

          {failed ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {cleanErrorMessage(sequence.lastError) || "Something went wrong while generating a clip."}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {sequence.status === "STITCHING"
                ? "Joining them in order — almost there"
                : "Every image is rendered separately, then joined in order"}{" "}
              · you can keep chatting
            </p>
          )}

          {total > 0 && (
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
              {sequence.clips.map((clip, i) => (
                <ClipTile key={clip.id} clip={clip} index={i} />
              ))}
            </div>
          )}

          {failed && (
            <div className="mt-2 flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={isRetrying} onClick={handleRetry}>
                {isRetrying ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1.5 h-3 w-3" />}
                Retry failed
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                title="Discard"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes vidseq-shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
