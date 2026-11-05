"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import imageCompression from "browser-image-compression";
import { Loader2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachmentService } from "@/lib/services";
import { toast } from "@/lib/toast";

/** One image in the frame sequence; array order is the frame order. */
export interface StudioImage {
  id: string;
  name: string;
  /** Public HTTPS URL from presend — empty while uploading. */
  fileUrl: string;
  /** Local blob URL for instant thumbnails. */
  previewUrl: string;
  uploading: boolean;
}

export const MAX_STUDIO_IMAGES = 8;

/** The three kinds of image a video can take, kept apart end to end. */
export interface VideoImages {
  first: StudioImage | null;
  last: StudioImage | null;
  references: StudioImage[];
}

export const EMPTY_VIDEO_IMAGES: VideoImages = { first: null, last: null, references: [] };

/** What the selected model accepts: which frames, and how many reference images (0 = none). */
export interface ImageCaps {
  first: boolean;
  last: boolean;
  references: number;
}

export const allImages = (v: VideoImages): StudioImage[] =>
  [v.first, v.last, ...v.references].filter((i): i is StudioImage => Boolean(i));

export const imageCount = (v: VideoImages) => allImages(v).length;

/** Request fields for videoService.create — each kind goes in its own field. */
export const imagePayload = (v: VideoImages) => ({
  firstFrameUrl: v.first?.fileUrl || undefined,
  lastFrameUrl: v.last?.fileUrl || undefined,
  referenceImageUrls: v.references.length > 0 ? v.references.map((i) => i.fileUrl) : undefined,
});

/** Builds the picker state from a saved video's fields (also used to seed edits). */
export const videoImagesFromUrls = (urls: {
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  referenceImageUrls?: string[] | null;
}): VideoImages => {
  const make = (url: string, name: string): StudioImage => ({
    id: `seed-${name}-${url}`,
    name,
    fileUrl: url,
    previewUrl: url,
    uploading: false,
  });
  return {
    first: urls.firstFrameUrl ? make(urls.firstFrameUrl, "First frame") : null,
    last: urls.lastFrameUrl ? make(urls.lastFrameUrl, "Last frame") : null,
    references: (urls.referenceImageUrls ?? []).map((u, i) => make(u, `Reference ${i + 1}`)),
  };
};

/** Trims `v` to what `caps` allows; returns the result and whatever was dropped. */
export const fitImagesToCaps = (v: VideoImages, caps: ImageCaps) => {
  const next: VideoImages = {
    first: caps.first ? v.first : null,
    last: caps.last ? v.last : null,
    references: v.references.slice(0, caps.references),
  };
  const kept = allImages(next);
  const dropped = allImages(v).filter((i) => !kept.some((k) => k.id === i.id));
  return { next, dropped };
};

/** Video models reject very small reference images, so catch them before upload. */
export const MIN_IMAGE_SIDE = 300;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Reads a local image's pixel size from the file itself, before it is uploaded. */
const readImageSize = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this image"));
    };
    img.src = url;
  });

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Column count and cell size of the live CSS grid, so drag math follows the real layout. */
const gridMetrics = (grid: HTMLElement) => {
  const style = getComputedStyle(grid);
  const cols = style.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  const first = grid.firstElementChild as HTMLElement | null;
  return {
    cols,
    cellW: (first?.offsetWidth ?? 1) + (parseFloat(style.columnGap) || 0),
    cellH: (first?.offsetHeight ?? 1) + (parseFloat(style.rowGap) || 0),
  };
};

const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Collects the three kinds of image a video can take, each in its own section:
 * a first frame, a last frame, and up to `caps.references` reference images
 * (drag them into order — a wrapping grid, left → right then top → bottom).
 * Sections the model can't use are hidden. Edits happen on a draft: nothing
 * reaches the caller until "Add images", and Cancel throws the draft away.
 */
export function MultiImageDialog({
  open,
  onOpenChange,
  images,
  onConfirm,
  caps,
  limitNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The images currently attached to the composer. */
  images: VideoImages;
  onConfirm: (images: VideoImages) => void;
  caps: ImageCaps;
  /** Shown when the selected model takes fewer images than the global cap. */
  limitNote?: string | null;
}) {
  const refInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [draft, setDraft] = useState<VideoImages>(EMPTY_VIDEO_IMAGES);
  const [dragActive, setDragActive] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const maxRefs = Math.min(caps.references, MAX_STUDIO_IMAGES);

  // The upload callbacks run long after the render that started them, so they
  // read the live draft through a ref instead of a stale closure.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (open) setDraft(images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const committedIds = useMemo(() => new Set(allImages(images).map((i) => i.id)), [images]);
  const isCommitted = useCallback((id: string) => committedIds.has(id), [committedIds]);

  const patchImage = (id: string, patch: Partial<StudioImage>) =>
    setDraft((prev) => ({
      first: prev.first?.id === id ? { ...prev.first, ...patch } : prev.first,
      last: prev.last?.id === id ? { ...prev.last, ...patch } : prev.last,
      references: prev.references.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

  const dropImage = (id: string) =>
    setDraft((prev) => ({
      first: prev.first?.id === id ? null : prev.first,
      last: prev.last?.id === id ? null : prev.last,
      references: prev.references.filter((i) => i.id !== id),
    }));

  /** Type / size checks that run before a file takes a slot. */
  const filterValid = async (incoming: File[]) => {
    const typed = incoming.filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (typed.length < incoming.length) toast.error("Only PNG, JPG and WEBP images can be added.");

    // Too-small or unreadable files are dropped here, before they take a slot.
    const sizes = await Promise.all(typed.map((f) => readImageSize(f).catch(() => null)));
    const tooSmall: string[] = [];
    const unreadable: string[] = [];
    const valid = typed.filter((f, i) => {
      const size = sizes[i];
      if (!size) {
        unreadable.push(f.name);
        return false;
      }
      if (size.width < MIN_IMAGE_SIDE || size.height < MIN_IMAGE_SIDE) {
        tooSmall.push(`${f.name} (${size.width}×${size.height})`);
        return false;
      }
      return true;
    });
    if (tooSmall.length > 0) {
      toast.error(`Image should be at least ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE} px. Skipped: ${tooSmall.join(", ")}`);
    }
    if (unreadable.length > 0) toast.error(`Couldn't read: ${unreadable.join(", ")}`);
    return valid;
  };

  const makePending = (files: File[]) =>
    files.map((file) => ({
      file,
      item: { id: newId(), name: file.name, fileUrl: "", previewUrl: URL.createObjectURL(file), uploading: true } as StudioImage,
    }));

  /** Uploads each file and patches its draft entry; a failed upload removes the entry. */
  const uploadPending = (pending: { file: File; item: StudioImage }[]) =>
    Promise.all(
      pending.map(async ({ file, item }) => {
        try {
          let upload = file;
          if (file.size > 2 * 1024 * 1024) {
            upload = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true });
          }
          const res = await attachmentService.presend(upload);
          const fileUrl: string = res.data.data.fileUrl;
          patchImage(item.id, { fileUrl, uploading: false });
        } catch (err: unknown) {
          const e = err as { response?: { data?: { message?: string } }; message?: string };
          toast.error(`Failed to upload ${file.name}: ${e.response?.data?.message || e.message}`);
          URL.revokeObjectURL(item.previewUrl);
          dropImage(item.id);
        }
      }),
    );

  const addReferences = async (incoming: File[]) => {
    const valid = await filterValid(incoming);
    const room = maxRefs - draftRef.current.references.length;
    if (room <= 0) {
      toast.error(`You can add at most ${maxRefs} reference images.`);
      return;
    }
    if (valid.length > room) toast.error(`Only ${room} more image${room === 1 ? "" : "s"} fit — extra files were skipped.`);
    const files = valid.slice(0, room);
    if (files.length === 0) return;

    const pending = makePending(files);
    setDraft((prev) => ({ ...prev, references: [...prev.references, ...pending.map((p) => p.item)] }));
    await uploadPending(pending);
  };

  const setFrame = async (slot: "first" | "last", incoming: File[]) => {
    const [file] = await filterValid(incoming.slice(0, 1));
    if (!file) return;
    const [pending] = makePending([file]);
    const old = draftRef.current[slot];
    if (old && !isCommitted(old.id)) URL.revokeObjectURL(old.previewUrl);
    setDraft((prev) => ({ ...prev, [slot]: pending.item }));
    await uploadPending([pending]);
  };

  const removeImage = (img: StudioImage) => {
    // A blob that was never committed has no other owner, so free it now.
    if (!isCommitted(img.id)) URL.revokeObjectURL(img.previewUrl);
    dropImage(img.id);
  };

  /** Moves the reference `id` to slot `to`, shifting the ones in between. */
  const moveTo = useCallback((id: string, to: number) => {
    setDraft((prev) => {
      const from = prev.references.findIndex((i) => i.id === id);
      if (from < 0 || from === to) return prev;
      const next = [...prev.references];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...prev, references: next };
    });
  }, []);

  /** While a tile is dragged, the slot under the pointer is where it belongs. */
  const handleTileDrag = (id: string, clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const { cols, cellW, cellH } = gridMetrics(grid);
    const rect = grid.getBoundingClientRect();
    const col = Math.min(Math.max(Math.floor((clientX - rect.left) / cellW), 0), cols - 1);
    const row = Math.max(Math.floor((clientY - rect.top) / cellH), 0);
    moveTo(id, Math.min(row * cols + col, draftRef.current.references.length - 1));
  };

  const handleTileKey = (index: number, key: string) => {
    const grid = gridRef.current;
    const cols = grid ? gridMetrics(grid).cols : 1;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key];
    if (delta === undefined) return false;
    const refs = draftRef.current.references;
    const target = Math.min(Math.max(index + delta, 0), refs.length - 1);
    moveTo(refs[index].id, target);
    return true;
  };

  /** Cancel / Esc / overlay click: drop the draft and free blobs only it owned. */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      allImages(draftRef.current).forEach((i) => {
        if (!isCommitted(i.id)) URL.revokeObjectURL(i.previewUrl);
      });
    }
    onOpenChange(next);
  };

  const confirm = () => {
    allImages(images).forEach((i) => {
      if (!allImages(draft).some((d) => d.id === i.id)) URL.revokeObjectURL(i.previewUrl);
    });
    onConfirm(draft);
    onOpenChange(false);
  };

  const uploading = allImages(draft).some((i) => i.uploading);
  const full = draft.references.length >= maxRefs;
  const frameSlots = (
    [
      ["first", "First frame", "The clip starts from this image."],
      ["last", "Last frame", "The clip ends on this image."],
    ] as const
  ).filter(([slot]) => caps[slot]);
  const hasFrames = Boolean(draft.first || draft.last);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto sm:max-w-170">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-[17px] font-semibold">Add images</DialogTitle>
          <DialogDescription className="text-[13px]">
            Set the first and last frame separately, and add reference images to guide the look of the clip.
          </DialogDescription>
        </DialogHeader>

        {limitNote && <p className="-mt-1 text-xs text-warn">{limitNote}</p>}

        {frameSlots.length > 0 && (
          <div className={`grid gap-3 ${frameSlots.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {frameSlots.map(([slot, label, hint]) => (
              <FrameSlot
                key={slot}
                label={label}
                hint={hint}
                image={draft[slot]}
                onFiles={(files) => void setFrame(slot, files)}
                onRemove={() => draft[slot] && removeImage(draft[slot]!)}
              />
            ))}
          </div>
        )}

        {maxRefs > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-foreground">Reference images</span>
              <span className="text-xs text-faint">
                {draft.references.length} / {maxRefs}
              </span>
            </div>

            <input
              ref={refInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void addReferences(files);
              }}
            />

            <div
              onDragEnter={(e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                dragDepth.current += 1;
                setDragActive(true);
              }}
              onDragOver={(e) => {
                if (hasFiles(e)) e.preventDefault();
              }}
              onDragLeave={(e) => {
                if (!hasFiles(e)) return;
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragActive(false);
              }}
              onDrop={(e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                dragDepth.current = 0;
                setDragActive(false);
                void addReferences(Array.from(e.dataTransfer.files));
              }}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-4 text-center transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-line-strong bg-sunken"
              } ${full ? "opacity-60" : ""}`}
            >
              <Upload className="h-5 w-5 text-primary" />
              <p className="text-[14px] text-foreground">
                Drag reference images here, or{" "}
                <button
                  type="button"
                  disabled={full}
                  onClick={() => refInputRef.current?.click()}
                  className="cursor-pointer font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline"
                >
                  browse your device
                </button>
              </p>
              <p className="text-[12px] text-faint">
                {full
                  ? `Maximum of ${maxRefs} reference images reached`
                  : `Select several at once · PNG, JPG, WEBP · min ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE} px · up to ${maxRefs}`}
              </p>
            </div>

            {draft.references.length > 0 && (
              <div ref={gridRef} className="grid grid-cols-3 gap-3 pb-1 pt-1.5 sm:grid-cols-4">
                {draft.references.map((img, index) => (
                  <SortableTile
                    key={img.id}
                    img={img}
                    index={index}
                    onDragTo={handleTileDrag}
                    onKey={handleTileKey}
                    onRemove={() => removeImage(img)}
                  />
                ))}
              </div>
            )}
            {draft.references.length > 1 && (
              <p className="text-xs text-faint">Drag to reorder — the numbers are the order the model sees them in.</p>
            )}
            {hasFrames && draft.references.length > 0 && (
              <p className="text-xs text-warn">
                With reference images, the first and last frame guide the clip instead of being used as the exact frames.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={uploading || imageCount(draft) === 0}
            onClick={confirm}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add images
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A single-image slot (first or last frame): click or drop to set, X to clear. */
function FrameSlot({
  label,
  hint,
  image,
  onFiles,
  onRemove,
}: {
  label: string;
  hint: string;
  image: StudioImage | null;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      {image ? (
        <div className="relative">
          <div className="relative h-20 overflow-hidden rounded-xl border border-border bg-sunken">
            <img src={image.previewUrl} alt={label} draggable={false} className="h-full w-full object-cover" />
            {image.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
          </div>
          <button
            type="button"
            title={`Remove ${label.toLowerCase()}`}
            onClick={onRemove}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-surface shadow-sm hover:bg-sidebar-accent"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            setOver(false);
            onFiles(Array.from(e.dataTransfer.files));
          }}
          className={`flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center transition-colors ${
            over ? "border-primary bg-primary/5" : "border-line-strong bg-sunken hover:border-primary"
          }`}
        >
          <Upload className="h-4 w-4 text-primary" />
          <span className="text-[12.5px] text-foreground">Add {label.toLowerCase()}</span>
        </button>
      )}
      <p className="text-xs text-faint">{hint}</p>
    </div>
  );
}

/**
 * One draggable cell of the frame grid. Only the thumbnail starts a drag (via
 * dragControls) so the remove button stays a plain click, and `layout` makes
 * the neighbouring tiles glide into their new slots while one is moved.
 */
function SortableTile({
  img,
  index,
  onDragTo,
  onKey,
  onRemove,
}: {
  img: StudioImage;
  index: number;
  onDragTo: (id: string, clientX: number, clientY: number) => void;
  onKey: (index: number, key: string) => boolean;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
      layout
      drag
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.05 }}
      style={{ zIndex: dragging ? 20 : 0 }}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      onDrag={(_, info) => onDragTo(img.id, info.point.x - window.scrollX, info.point.y - window.scrollY)}
      tabIndex={0}
      aria-label={`Reference ${index + 1}: ${img.name}. Use the arrow keys to move it.`}
      onKeyDown={(e) => {
        if (onKey(index, e.key)) e.preventDefault();
      }}
      className="relative min-w-0 select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className={`relative aspect-square touch-none overflow-hidden rounded-xl border border-border bg-sunken ${
          dragging ? "cursor-grabbing shadow-lg" : "cursor-grab"
        }`}
      >
        <img src={img.previewUrl} alt={img.name} draggable={false} className="h-full w-full object-cover" />
        {img.uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/65 px-1 text-[11px] font-medium text-white">
          {index + 1}
        </span>
      </div>
      <button
        type="button"
        title="Remove image"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-surface shadow-sm hover:bg-sidebar-accent"
      >
        <X className="h-3 w-3" />
      </button>
      <p className="mt-1.5 truncate text-[12px] text-muted-foreground" title={img.name}>
        {img.name}
      </p>
    </motion.div>
  );
}

/** Thumbnails shown above the composer's textarea, labelled by kind; click one to reopen the dialog. */
export function ImageSequenceStrip({
  images,
  onEdit,
  onRemove,
}: {
  images: VideoImages;
  onEdit: () => void;
  onRemove: (id: string) => void;
}) {
  const tiles = [
    ...(images.first ? [{ img: images.first, badge: "First" }] : []),
    ...(images.last ? [{ img: images.last, badge: "Last" }] : []),
    ...images.references.map((img, i) => ({ img, badge: `Ref ${i + 1}` })),
  ];
  if (tiles.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5 overflow-x-auto px-1 pb-2.5 pt-1.5">
      {tiles.map(({ img, badge }) => (
        <div key={img.id} className="relative h-14 w-14 shrink-0">
          <button
            type="button"
            title={`${badge} — click to edit`}
            onClick={onEdit}
            className="block h-14 w-14 cursor-pointer overflow-hidden rounded-lg border border-border"
          >
            <img src={img.previewUrl} alt={badge} draggable={false} className="h-full w-full object-cover" />
          </button>
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 flex h-4 items-center justify-center rounded-full bg-black/65 px-1.5 text-[9.5px] font-medium text-white">
            {badge}
          </span>
          <button
            type="button"
            title="Remove image"
            onClick={() => onRemove(img.id)}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-border bg-surface"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
