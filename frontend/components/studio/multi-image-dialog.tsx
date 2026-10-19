"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Collects up to `maxImages` images, lets the user drag them into frame order
 * (a wrapping grid, read left → right then top → bottom = frame 1…n) and
 * remove any. Edits happen on a draft: nothing
 * reaches the caller until "Add images", and Cancel throws the draft away.
 */
export function MultiImageDialog({
  open,
  onOpenChange,
  images,
  onConfirm,
  maxImages = MAX_STUDIO_IMAGES,
  limitNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The images currently attached to the composer. */
  images: StudioImage[];
  onConfirm: (images: StudioImage[]) => void;
  maxImages?: number;
  /** Shown when the selected model takes fewer images than the global cap. */
  limitNote?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [draft, setDraft] = useState<StudioImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // The upload callbacks run long after the render that started them, so they
  // read the live draft through a ref instead of a stale closure.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (open) setDraft(images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isCommitted = useCallback((id: string) => images.some((i) => i.id === id), [images]);

  const addFiles = useCallback(
    async (incoming: File[]) => {
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

      const room = maxImages - draftRef.current.length;
      if (room <= 0) {
        toast.error(`You can add at most ${maxImages} images.`);
        return;
      }
      if (valid.length > room) toast.error(`Only ${room} more image${room === 1 ? "" : "s"} fit — extra files were skipped.`);
      const files = valid.slice(0, room);
      if (files.length === 0) return;

      const pending = files.map((file) => ({
        file,
        item: { id: newId(), name: file.name, fileUrl: "", previewUrl: URL.createObjectURL(file), uploading: true } as StudioImage,
      }));
      setDraft((prev) => [...prev, ...pending.map((p) => p.item)]);

      await Promise.all(
        pending.map(async ({ file, item }) => {
          try {
            let upload = file;
            if (file.size > 2 * 1024 * 1024) {
              upload = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true });
            }
            const res = await attachmentService.presend(upload);
            const fileUrl: string = res.data.data.fileUrl;
            setDraft((prev) => prev.map((i) => (i.id === item.id ? { ...i, fileUrl, uploading: false } : i)));
          } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } }; message?: string };
            toast.error(`Failed to upload ${file.name}: ${e.response?.data?.message || e.message}`);
            URL.revokeObjectURL(item.previewUrl);
            setDraft((prev) => prev.filter((i) => i.id !== item.id));
          }
        }),
      );
    },
    [maxImages],
  );

  const removeImage = (img: StudioImage) => {
    // A blob that was never committed has no other owner, so free it now.
    if (!isCommitted(img.id)) URL.revokeObjectURL(img.previewUrl);
    setDraft((prev) => prev.filter((i) => i.id !== img.id));
  };

  /** Moves the image `id` to slot `to`, shifting the ones in between. */
  const moveTo = useCallback((id: string, to: number) => {
    setDraft((prev) => {
      const from = prev.findIndex((i) => i.id === id);
      if (from < 0 || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
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
    moveTo(id, Math.min(row * cols + col, draftRef.current.length - 1));
  };

  const handleTileKey = (index: number, key: string) => {
    const grid = gridRef.current;
    const cols = grid ? gridMetrics(grid).cols : 1;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key];
    if (delta === undefined) return false;
    const target = Math.min(Math.max(index + delta, 0), draftRef.current.length - 1);
    moveTo(draftRef.current[index].id, target);
    return true;
  };

  /** Cancel / Esc / overlay click: drop the draft and free blobs only it owned. */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      draftRef.current.forEach((i) => {
        if (!isCommitted(i.id)) URL.revokeObjectURL(i.previewUrl);
      });
    }
    onOpenChange(next);
  };

  const confirm = () => {
    images.forEach((i) => {
      if (!draft.some((d) => d.id === i.id)) URL.revokeObjectURL(i.previewUrl);
    });
    onConfirm(draft);
    onOpenChange(false);
  };

  const uploading = draft.some((i) => i.uploading);
  const full = draft.length >= maxImages;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto sm:max-w-170">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-[17px] font-semibold">Add images</DialogTitle>
          <DialogDescription className="text-[13px]">
            Drag the images into the order you want — the numbers are the frame order (1, 2, 3…).
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addFiles(files);
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
            void addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-line-strong bg-sunken"
          } ${full ? "opacity-60" : ""}`}
        >
          <Upload className="h-5 w-5 text-primary" />
          <p className="text-[14px] text-foreground">
            Drag images here, or{" "}
            <button
              type="button"
              disabled={full}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline"
            >
              browse your device
            </button>
          </p>
          <p className="text-[12px] text-faint">
            {full ? `Maximum of ${maxImages} images reached` : `Select several at once · PNG, JPG, WEBP · min ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE} px · up to ${maxImages}`}
          </p>
        </div>

        {limitNote && <p className="-mt-1 text-xs text-warn">{limitNote}</p>}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-foreground">Your selected images</span>
            <span className="text-xs text-faint">
              {draft.length} / {maxImages}
            </span>
          </div>

          {draft.length === 0 ? (
            <p className="rounded-xl bg-sunken py-6 text-center text-[13px] text-faint">No images yet.</p>
          ) : (
            <div ref={gridRef} className="grid grid-cols-3 gap-3 pb-1 pt-1.5 sm:grid-cols-4">
              {draft.map((img, index) => (
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
        </div>

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
            disabled={uploading || draft.length === 0}
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
      aria-label={`Frame ${index + 1}: ${img.name}. Use the arrow keys to move it.`}
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

/** Frame thumbnails shown above the composer's textarea; click one to reopen the dialog. */
export function ImageSequenceStrip({
  images,
  onEdit,
  onRemove,
}: {
  images: StudioImage[];
  onEdit: () => void;
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5 overflow-x-auto px-1 pb-2.5 pt-1.5">
      {images.map((img, index) => (
        <div key={img.id} className="relative h-14 w-14 shrink-0">
          <button
            type="button"
            title={`Frame ${index + 1} — click to edit`}
            onClick={onEdit}
            className="block h-14 w-14 cursor-pointer overflow-hidden rounded-lg border border-border"
          >
            <img src={img.previewUrl} alt={`Frame ${index + 1}`} draggable={false} className="h-full w-full object-cover" />
          </button>
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/65 px-1 text-[10px] font-medium text-white">
            {index + 1}
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
