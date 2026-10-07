"use client";

import { Fragment, useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Loader2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { attachmentService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export const MIN_SEQUENCE_IMAGES = 2;
export const MAX_SEQUENCE_IMAGES = 8;
/** Scenes in one sequence — an image can be tagged more than once, so this is above the image cap. */
export const MAX_SEQUENCE_STEPS = 12;
const MAX_PROMPT_CHARS = 2000;

export interface SequenceItem {
  key: string;
  previewUrl: string;
  fileUrl: string;
  uploading: boolean;
  prompt: string;
}

/** "each": a prompt box under every image. "single": one prompt that tags images as @image1, @image2… */
export type PromptMode = "each" | "single";

/** Number of clips a sequence will actually render — N images, or N-1 transitions between them. */
export const sequenceClipCount = (imageCount: number, smoothTransitions: boolean) =>
  smoothTransitions ? Math.max(imageCount - 1, 0) : imageCount;

/**
 * Whether the item at `index` needs a prompt. With smooth transitions the
 * last image is only the end frame of the final clip, so it has none.
 */
const needsPrompt = (index: number, total: number, smoothTransitions: boolean) =>
  !(smoothTransitions && index === total - 1);

/* ------------------------------------------------------------------ */
/* Single-prompt parsing                                              */
/* ------------------------------------------------------------------ */

interface PromptTag {
  /** 0-based image index (`@image3` → 2). */
  index: number;
  start: number;
  end: number;
  /** false for a tag that points at no image. */
  valid: boolean;
}

export interface ParsedTaggedPrompt {
  tags: PromptTag[];
  /** Text before the first tag — shared direction applied to every clip. */
  preface: string;
  /** One entry per valid tag, in the order the tags appear (= playback order). */
  scenes: { index: number; scene: string }[];
  errors: string[];
}

/**
 * Splits `@image1 scene… @image2 scene…` into one scene per tag. The order of
 * the tags in the text is the playback order, so images can be tagged in any
 * order and reused — every image just has to be tagged at least once.
 */
export function parseTaggedPrompt(text: string, imageCount: number, smoothTransitions: boolean): ParsedTaggedPrompt {
  const tags: PromptTag[] = [];
  const seen = new Set<number>();
  const errors: string[] = [];

  for (const match of text.matchAll(/@image(\d+)/gi)) {
    const n = Number(match[1]);
    const index = n - 1;
    const start = match.index ?? 0;
    let valid = true;

    if (index < 0 || index >= imageCount) {
      valid = false;
      errors.push(`@image${n} doesn't exist — you have ${imageCount} image${imageCount === 1 ? "" : "s"}.`);
    } else {
      seen.add(index);
    }
    tags.push({ index, start, end: start + match[0].length, valid });
  }

  const missing = Array.from({ length: imageCount }, (_, i) => i).filter((i) => !seen.has(i));
  if (missing.length > 0) {
    errors.push(`Add ${missing.map((i) => `@image${i + 1}`).join(", ")} to the prompt.`);
  }

  const scenes: ParsedTaggedPrompt["scenes"] = [];
  tags.forEach((tag, i) => {
    if (!tag.valid) return;
    const scene = text.slice(tag.end, tags[i + 1]?.start ?? text.length).trim();
    scenes.push({ index: tag.index, scene });
  });

  if (scenes.length > MAX_SEQUENCE_STEPS) {
    errors.push(`Use at most ${MAX_SEQUENCE_STEPS} scenes — you have ${scenes.length}.`);
  }

  scenes.forEach((entry, i) => {
    const isFinalFrame = smoothTransitions && i === scenes.length - 1;
    if (!entry.scene && !isFinalFrame) errors.push(`Describe what happens at @image${entry.index + 1}.`);
  });

  return {
    tags,
    preface: tags.length > 0 ? text.slice(0, tags[0].start).trim() : text.trim(),
    scenes,
    errors: Array.from(new Set(errors)),
  };
}

/**
 * Turns the editor state into the ordered `{ imageUrl, prompt }` list the API
 * takes, or the reasons it can't yet. Shared by the Generate button's
 * enabled state and the submit itself so they can never disagree.
 */
export function buildSequenceImages(
  items: SequenceItem[],
  smoothTransitions: boolean,
  promptMode: PromptMode,
  singlePrompt: string,
): { images: { imageUrl: string; prompt: string }[] | null; errors: string[] } {
  if (items.length < MIN_SEQUENCE_IMAGES) return { images: null, errors: [] };
  if (items.some((item) => item.uploading || !item.fileUrl)) return { images: null, errors: [] };

  if (promptMode === "single") {
    const parsed = parseTaggedPrompt(singlePrompt, items.length, smoothTransitions);
    if (parsed.errors.length > 0) return { images: null, errors: parsed.errors };

    return {
      images: parsed.scenes.map(({ index, scene }) => {
        // The preface is shared direction ("cinematic, warm light") for every
        // clip. If both can't fit, the scene wins — it's the part that differs.
        const prefaceRoom = Math.max(MAX_PROMPT_CHARS - scene.length - 1, 0);
        const preface = parsed.preface.slice(0, prefaceRoom).trim();
        return {
          imageUrl: items[index].fileUrl,
          prompt: [preface, scene].filter(Boolean).join(" ").slice(0, MAX_PROMPT_CHARS) || "Final frame",
        };
      }),
      errors: [],
    };
  }

  const complete = items.every((item, i) => !needsPrompt(i, items.length, smoothTransitions) || item.prompt.trim());
  if (!complete) return { images: null, errors: [] };

  return {
    images: items.map((item, i) => ({
      imageUrl: item.fileUrl,
      // In smooth mode the last image has no prompt of its own — the API still
      // wants a string per image and ignores this one.
      prompt: item.prompt.trim() || (i === items.length - 1 ? "Final frame" : ""),
    })),
    errors: [],
  };
}

/** Clips a sequence will render: one per image, or per tag in single-prompt mode — minus one with smooth transitions. */
export const sequenceStepCount = (
  items: SequenceItem[],
  smoothTransitions: boolean,
  promptMode: PromptMode,
  singlePrompt: string,
) =>
  sequenceClipCount(
    promptMode === "single" ? parseTaggedPrompt(singlePrompt, items.length, smoothTransitions).scenes.length : items.length,
    smoothTransitions,
  );

export const isSequenceReady = (
  items: SequenceItem[],
  smoothTransitions: boolean,
  promptMode: PromptMode,
  singlePrompt: string,
) => buildSequenceImages(items, smoothTransitions, promptMode, singlePrompt).images !== null;

/* ------------------------------------------------------------------ */
/* Single-prompt field                                                */
/* ------------------------------------------------------------------ */

// The textarea sits on top of a same-sized, transparent-text copy of its own
// contents; the copy is where the @imageN highlights are painted. Both must
// share every metric that affects wrapping, hence one shared class string.
const FIELD_METRICS = "px-3 py-2 text-xs leading-5 whitespace-pre-wrap break-words font-sans";

function TaggedPromptField({
  items,
  value,
  onChange,
  smoothTransitions,
}: {
  items: SequenceItem[];
  value: string;
  onChange: (value: string) => void;
  smoothTransitions: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const parsed = parseTaggedPrompt(value, items.length, smoothTransitions);
  const used = new Set(parsed.tags.filter((t) => t.valid).map((t) => t.index));

  const insertTag = (n: number) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const before = value.slice(0, start);
    const insert = `${before && !/\s$/.test(before) ? " " : ""}@image${n} `;
    onChange(before + insert + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = before.length + insert.length;
      el.setSelectionRange(caret, caret);
    });
  };

  // Highlighted copy of the text: plain runs between tags, tags in a <mark>.
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  parsed.tags.forEach((tag, i) => {
    pieces.push(<Fragment key={`t-${i}`}>{value.slice(cursor, tag.start)}</Fragment>);
    pieces.push(
      <mark
        key={`m-${i}`}
        className={cn(
          "rounded-sm text-transparent",
          tag.valid ? "bg-primary/25 ring-1 ring-primary/30" : "bg-destructive/25 ring-1 ring-destructive/40",
        )}
      >
        {value.slice(tag.start, tag.end)}
      </mark>,
    );
    cursor = tag.end;
  });
  pieces.push(<Fragment key="rest">{value.slice(cursor)}</Fragment>);

  const playback = parsed.scenes.map((s) => s.index + 1);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Tap to insert:</span>
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onClick={() => insertTag(i + 1)}
            className={cn(
              "flex items-center gap-1 rounded-full border border-border/60 py-0.5 pl-0.5 pr-2 text-[11px] hover:bg-muted/60",
              used.has(i) && "opacity-50",
            )}
          >
            <img src={item.previewUrl} alt="" className="h-4 w-4 rounded-full object-cover" />@image{i + 1}
          </button>
        ))}
      </div>

      <div className="relative">
        <div
          ref={backdropRef}
          aria-hidden
          style={{ scrollbarGutter: "stable" }}
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent text-transparent",
            FIELD_METRICS,
          )}
        >
          {pieces}
          {"\n"}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          maxLength={MAX_PROMPT_CHARS * 4}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={{ scrollbarGutter: "stable" }}
          placeholder={"Slow cinematic mood, warm light. @image1 a woman walks into the room @image2 camera pushes in on the window @image3 she turns and smiles"}
          className={cn(
            "relative block h-32 w-full resize-none overflow-y-auto rounded-md border border-border/60 bg-transparent outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            FIELD_METRICS,
          )}
        />
      </div>

      {parsed.errors.length > 0 && value.trim() ? (
        <ul className="space-y-0.5 text-[11px] text-amber-600 dark:text-amber-400">
          {parsed.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {playback.length > 0
            ? `Plays in this order: ${playback.map((n) => `@image${n}`).join(" → ")}`
            : "Tag an image, then describe what happens to it — tag the same image again to reuse it. Text before the first tag applies to every clip."}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                             */
/* ------------------------------------------------------------------ */

export function VideoSequenceEditor({
  items,
  setItems,
  smoothTransitions,
  onSmoothTransitionsChange,
  promptMode,
  onPromptModeChange,
  singlePrompt,
  onSinglePromptChange,
}: {
  items: SequenceItem[];
  setItems: Dispatch<SetStateAction<SequenceItem[]>>;
  smoothTransitions: boolean;
  onSmoothTransitionsChange: (value: boolean) => void;
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  singlePrompt: string;
  onSinglePromptChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const single = promptMode === "single";

  const addFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_SEQUENCE_IMAGES - items.length;
      if (files.length > room) {
        toast.error(`You can use up to ${MAX_SEQUENCE_IMAGES} images — extra files were skipped.`);
      }

      for (const file of files.slice(0, Math.max(room, 0))) {
        const key = `seq-${Date.now()}-${counter.current++}`;
        const previewUrl = URL.createObjectURL(file);
        setItems((prev) => [...prev, { key, previewUrl, fileUrl: "", uploading: true, prompt: "" }]);

        // Fire-and-forget per file so every image uploads in parallel.
        attachmentService
          .presend(file)
          .then((res) => {
            const fileUrl = res.data.data.fileUrl;
            setItems((prev) => prev.map((it) => (it.key === key ? { ...it, fileUrl, uploading: false } : it)));
          })
          .catch((err: any) => {
            toast.error(`Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`);
            URL.revokeObjectURL(previewUrl);
            setItems((prev) => prev.filter((it) => it.key !== key));
          });
      }
    },
    [items.length, setItems],
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= items.length || from === to) return;
      setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },
    [items.length, setItems],
  );

  const remove = useCallback(
    (key: string) => {
      setItems((prev) => {
        const target = prev.find((it) => it.key === key);
        if (target) URL.revokeObjectURL(target.previewUrl);
        return prev.filter((it) => it.key !== key);
      });
    },
    [setItems],
  );

  const setPrompt = useCallback(
    (key: string, prompt: string) => {
      setItems((prev) => prev.map((it) => (it.key === key ? { ...it, prompt } : it)));
    },
    [setItems],
  );

  const clipCount = sequenceStepCount(items, smoothTransitions, promptMode, singlePrompt);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void addFiles(files);
        }}
      />

      <p className="text-xs text-muted-foreground">
        Add {MIN_SEQUENCE_IMAGES}–{MAX_SEQUENCE_IMAGES} images and describe what should happen to each. Each image
        becomes its own clip and they&apos;re joined in order.
      </p>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
        {(
          [
            ["each", "Prompt per image"],
            ["single", "One prompt for all"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onPromptModeChange(value)}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              promptMode === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.key}
            // In single-prompt mode the tags set the playback order, so dragging is off —
            // reordering would silently renumber @imageN under the user's prompt.
            draggable={!single}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => {
              if (single) return;
              e.preventDefault();
              if (overIndex !== index) setOverIndex(index);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={cn(
              "flex gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 transition-colors",
              dragIndex === index && "opacity-50",
              overIndex === index && dragIndex !== null && dragIndex !== index && "border-primary",
            )}
          >
            <div className="flex flex-col items-center justify-between py-0.5 text-muted-foreground">
              {single ? <span className="h-4" /> : <GripVertical className="h-4 w-4 cursor-grab" aria-hidden />}
              <span className="text-[11px] font-medium tabular-nums">{index + 1}</span>
              <span className="h-4" />
            </div>

            <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-black/5", single ? "h-14 w-20" : "h-20 w-28")}>
              <img src={item.previewUrl} alt={`Image ${index + 1}`} className="h-full w-full object-cover" />
              {item.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {single ? (
                <div className="flex h-14 items-center">
                  <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    @image{index + 1}
                  </span>
                </div>
              ) : needsPrompt(index, items.length, smoothTransitions) ? (
                <Textarea
                  value={item.prompt}
                  onChange={(e) => setPrompt(item.key, e.target.value)}
                  placeholder={
                    smoothTransitions
                      ? "How this image should move into the next one…"
                      : "What should happen to this image… e.g. slow zoom in, camera pans right"
                  }
                  maxLength={MAX_PROMPT_CHARS}
                  className="min-h-20 resize-none text-xs"
                />
              ) : (
                <div className="flex h-20 items-center rounded-md border border-dashed border-border/60 px-3 text-xs text-muted-foreground">
                  Final frame — the video ends on this image.
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-between">
              <button
                type="button"
                title="Remove"
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                onClick={() => remove(item.key)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {!single && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    title="Move up"
                    disabled={index === 0}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    disabled={index === items.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {items.length < MAX_SEQUENCE_IMAGES && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground hover:bg-muted/40"
        >
          <ImagePlus className="h-4 w-4" />
          {items.length === 0 ? "Add images" : `Add more (${items.length}/${MAX_SEQUENCE_IMAGES})`}
        </button>
      )}

      {single && items.length > 0 && (
        <TaggedPromptField
          items={items}
          value={singlePrompt}
          onChange={onSinglePromptChange}
          smoothTransitions={smoothTransitions}
        />
      )}

      <label className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Smooth transitions</p>
          <p className="text-[11px] text-muted-foreground">
            Each clip animates from one image into the next instead of hard-cutting between separate clips.
            {smoothTransitions && clipCount > 0 ? ` This will make ${clipCount} clip${clipCount === 1 ? "" : "s"}.` : ""}
          </p>
        </div>
        <Switch checked={smoothTransitions} onCheckedChange={onSmoothTransitionsChange} />
      </label>
    </div>
  );
}
