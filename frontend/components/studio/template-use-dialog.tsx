"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachmentService } from "@/lib/services";
import { toast } from "@/lib/toast";
import type { StudioTemplate } from "./studio-parts";

export interface TemplatePhoto {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  previewUrl: string;
}

/**
 * "Make mine like this": shows the trending template, takes the user's own
 * photo (required for templates that need one) plus optional extra details,
 * and hands both back. The page decides how to run its pipeline with the
 * template's stored prompt.
 */
export function TemplateUseDialog({
  template,
  kind,
  busy,
  photoDisabledReason,
  onOpenChange,
  onSubmit,
}: {
  template: StudioTemplate | null;
  kind: "image" | "video";
  busy?: boolean;
  /** Set when the selected model can't take a photo (e.g. video model without image input). */
  photoDisabledReason?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { photo: TemplatePhoto | null; extra: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<TemplatePhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extra, setExtra] = useState("");

  // Fresh state for every template that gets opened.
  useEffect(() => {
    if (template) {
      setPhoto(null);
      setExtra("");
      setUploading(false);
    }
  }, [template]);

  const handleFile = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setUploading(true);
    try {
      const res = await attachmentService.presend(file);
      const data = res.data.data;
      setPhoto({ id: data.id, fileName: file.name, fileUrl: data.fileUrl, mimeType: file.type, previewUrl });
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      toast.error(`Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const needsPhoto = Boolean(template?.requiresPhoto);
  const photoBlocked = Boolean(photoDisabledReason);
  const canSubmit = Boolean(template) && !uploading && !busy && (!needsPhoto || (photo !== null && !photoBlocked));

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-[760px]">
        {template && (
          <div className="grid md:grid-cols-[1fr_1.05fr]">
            <div className="relative min-h-[260px] bg-sunken md:min-h-[460px]">
              {template.previewVideoUrl ? (
                <video
                  src={template.previewVideoUrl}
                  poster={template.previewUrl ?? undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : template.previewUrl ? (
                <img src={template.previewUrl} alt={template.title} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${template.gradient ?? "from-[#E3D7F8] to-[#C9D6F5]"}`} />
              )}
            </div>

            <div className="flex flex-col gap-4 p-5">
              <DialogHeader className="gap-1 text-left">
                <DialogTitle className="text-[18px] font-semibold">{template.title}</DialogTitle>
                <DialogDescription className="text-[13px]">
                  {needsPhoto
                    ? `Add your photo and we'll create a ${kind} in this style.`
                    : `Start from this ${kind} style. You can add details below.`}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-1.5 text-[11.5px] text-muted-foreground">
                {template.category && <span className="rounded-full bg-sunken px-2.5 py-1">{template.category}</span>}
                {template.aspectRatio && <span className="rounded-full bg-sunken px-2.5 py-1">{template.aspectRatio}</span>}
                {kind === "video" && template.duration ? (
                  <span className="rounded-full bg-sunken px-2.5 py-1">{template.duration}s</span>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="text-[13px] font-medium text-foreground">
                  Your photo {needsPhoto ? <span className="text-danger">*</span> : <span className="font-normal text-faint">· optional</span>}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleFile(f);
                  }}
                />
                {photo ? (
                  <div className="relative h-28 w-28">
                    <img src={photo.previewUrl} alt="Your photo" className="h-28 w-28 rounded-xl border border-border object-cover" />
                    <button
                      type="button"
                      title="Remove photo"
                      onClick={() => {
                        URL.revokeObjectURL(photo.previewUrl);
                        setPhoto(null);
                      }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-surface"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploading || photoBlocked}
                    onClick={() => fileRef.current?.click()}
                    className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-muted-foreground transition-colors hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    <span className="text-[12.5px]">{uploading ? "Uploading…" : "Upload a photo"}</span>
                  </button>
                )}
                {photoBlocked && <p className="text-xs text-warn">{photoDisabledReason}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">
                  Add details <span className="font-normal text-faint">· optional</span>
                </label>
                <textarea
                  value={extra}
                  onChange={(e) => setExtra(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="e.g. wearing a blue jacket, city at night"
                  className="w-full resize-none rounded-lg border border-border bg-sunken px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-primary/50 focus:bg-surface"
                />
              </div>

              <div className="mt-auto flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => onSubmit({ photo, extra: extra.trim() })}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
