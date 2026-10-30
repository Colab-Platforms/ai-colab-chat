"use client";

import { type ReactNode } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedVideo } from "@/components/chat/video-card";
import { GlimmerWrap } from "@/components/studio/glimmer-wrap";
import { VIDEO_STAGES, isVideoFailure, isVideoWorking } from "@/components/studio/video-job-progress";

/* ---------------- status pill ---------------- */

export function StatusPill({ tone, label }: { tone: "working" | "ready" | "failed"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-max items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        tone === "working" && "bg-primary/10 text-primary",
        tone === "ready" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tone === "failed" && "bg-destructive/10 text-destructive",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", tone === "working" && "animate-pulse")} />
      {label}
    </span>
  );
}

/* ---------------- progress stage ---------------- */

/** The big "it's rendering" frame: a drifting field of glints behind the status text. */
export function JobProgressStage() {
  return (
    <GlimmerWrap className="min-h-70 w-full max-w-full flex-1 rounded-2xl text-center">
      <p className="glimmer-shimmer-text text-[15px] font-medium">Video is Generating Please wait …</p>
    </GlimmerWrap>
  );
}

/* ---------------- failure / cancelled stage ---------------- */

export function JobMessageStage({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-70 w-full max-w-full flex-1 place-items-center rounded-2xl border border-border bg-sunken px-6 text-center">
      <div className="flex w-[min(420px,86%)] flex-col items-center gap-2">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/* ---------------- checklist ---------------- */

export function JobChecklist({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="flex flex-col">
      {VIDEO_STAGES.map((stage, i) => {
        const done = i < stageIndex;
        const current = i === stageIndex;
        return (
          <div key={stage} className="relative flex h-[34px] items-center gap-2.5">
            {i < VIDEO_STAGES.length - 1 && (
              <span
                className={cn(
                  "absolute left-[7px] top-[26px] h-3 w-px",
                  done ? "bg-emerald-500" : "bg-border",
                )}
              />
            )}
            <span className="grid h-[15px] w-[15px] shrink-0 place-items-center">
              {done ? (
                <Check className="h-[15px] w-[15px] text-emerald-500" strokeWidth={2.6} />
              ) : current ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <span className="h-[15px] w-[15px] rounded-full border-[1.5px] border-border" />
              )}
            </span>
            <span
              className={cn(
                "text-[13px]",
                done && "text-foreground",
                current && "font-semibold text-foreground",
                !done && !current && "text-muted-foreground/70",
              )}
            >
              {stage}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- meta grid ---------------- */

export function MetaGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-3.5">{children}</dl>;
}

export function MetaCell({
  label,
  children,
  full,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("min-w-0", full && "col-span-2")}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/* ---------------- session strip ---------------- */

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/**
 * Every generation in this chat, oldest first — the studio's version history.
 * Editing the prompt or regenerating always creates a new row rather than
 * replacing one, so each attempt stays here to compare against.
 */
export function SessionStrip({
  items,
  activeId,
  onSelect,
  onDelete,
}: {
  items: GeneratedVideo[];
  activeId: number;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-5">
      <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground">This session</h3>
      <div className="flex gap-2.5 overflow-x-auto p-1 -m-1">
        {items.map((item) => {
          const working = isVideoWorking(item.status);
          const failed = isVideoFailure(item.status);
          return (
            <div key={item.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                title={item.prompt}
                className={cn(
                  "relative block aspect-video w-[124px] overflow-hidden rounded-lg border border-border bg-sunken",
                  item.id === activeId && "border-transparent outline outline-2 outline-offset-1 outline-primary",
                )}
              >
                {working ? (
                  <GlimmerWrap className="h-full w-full" density={16} seed={item.id} />
                ) : item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : item.fileUrl ? (
                  <video src={item.fileUrl} preload="metadata" muted className="h-full w-full object-cover" />
                ) : null}
                {!working && (
                  <span
                    className={cn(
                      "absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white",
                      failed ? "bg-destructive" : "bg-black/60",
                    )}
                  >
                    {failed ? "!" : clock(item.duration)}
                  </span>
                )}
              </button>
              <button
                type="button"
                title="Delete this version"
                onClick={() => onDelete(item.id)}
                className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/55 p-1 text-white hover:bg-destructive group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
