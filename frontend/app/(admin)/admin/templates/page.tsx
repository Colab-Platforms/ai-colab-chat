"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { attachmentService, studioTemplateService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface TemplateRow {
  id: number;
  type: "IMAGE" | "VIDEO";
  title: string;
  category: string | null;
  prompt: string;
  previewUrl: string;
  previewVideoUrl: string | null;
  aspectRatio: string;
  duration: number | null;
  requiresPhoto: boolean;
  sortOrder: number;
  usageCount: number;
  isActive: boolean;
}

const ASPECTS = ["1:1", "4:5", "2:3", "3:2", "3:4", "16:9", "9:16"];

const emptyForm = {
  type: "IMAGE" as "IMAGE" | "VIDEO",
  title: "",
  category: "",
  prompt: "",
  previewUrl: "",
  previewVideoUrl: "",
  aspectRatio: "1:1",
  duration: "5",
  requiresPhoto: true,
  sortOrder: "0",
  isActive: true,
};

export default function StudioTemplatesAdminPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");

  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"image" | "video" | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studioTemplateService.adminList();
      setRows(res.data?.data || []);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing("new");
  };

  const openEdit = (r: TemplateRow) => {
    setForm({
      type: r.type,
      title: r.title,
      category: r.category ?? "",
      prompt: r.prompt,
      previewUrl: r.previewUrl,
      previewVideoUrl: r.previewVideoUrl ?? "",
      aspectRatio: r.aspectRatio,
      duration: String(r.duration ?? 5),
      requiresPhoto: r.requiresPhoto,
      sortOrder: String(r.sortOrder),
      isActive: r.isActive,
    });
    setEditing(r);
  };

  const upload = async (file: File, kind: "image" | "video") => {
    setUploading(kind);
    try {
      const res = await attachmentService.presend(file);
      const url: string = res.data.data.fileUrl;
      setForm((f) => (kind === "image" ? { ...f, previewUrl: url } : { ...f, previewVideoUrl: url }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to upload ${kind}`);
    } finally {
      setUploading(null);
    }
  };

  const canSave = form.title.trim() && form.prompt.trim() && form.previewUrl.trim() && !saving && !uploading;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        title: form.title.trim(),
        category: form.category.trim() || null,
        prompt: form.prompt.trim(),
        previewUrl: form.previewUrl.trim(),
        aspectRatio: form.aspectRatio,
        requiresPhoto: form.requiresPhoto,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
        isActive: form.isActive,
        ...(form.type === "VIDEO"
          ? { previewVideoUrl: form.previewVideoUrl.trim() || null, duration: parseInt(form.duration, 10) || 5 }
          : {}),
      };
      if (editing === "new") {
        await studioTemplateService.create(payload);
        toast.success("Template created");
      } else if (editing) {
        await studioTemplateService.update(editing.id, payload);
        toast.success("Template updated");
      }
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: TemplateRow) => {
    try {
      await studioTemplateService.update(r.id, { isActive: !r.isActive });
      load();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await studioTemplateService.delete(deleteId);
      toast.success("Template deleted");
      setDeleteId(null);
      load();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleting(false);
    }
  };

  const shown = rows.filter((r) => filter === "ALL" || r.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Studio templates</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Trending looks shown in Image and Video Studio. Users add their own photo and we send it with the stored prompt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-sunken p-0.5">
            {(["ALL", "IMAGE", "VIDEO"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`h-8 rounded-md border px-3 text-[13px] font-medium cursor-pointer ${
                  filter === f ? "border-border bg-surface text-foreground shadow-sm" : "border-transparent text-muted-foreground"
                }`}
              >
                {f === "ALL" ? "All" : f === "IMAGE" ? "Images" : "Videos"}
              </button>
            ))}
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="w-4 h-4" /> Add template
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong py-16 text-center text-sm text-muted-foreground">
          No templates yet. Add your first trending look.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Template</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Ratio</th>
                <th className="px-4 py-2.5 font-medium">Used</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={r.previewUrl} alt="" className="h-12 w-12 rounded-lg border border-border object-cover" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.category || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="gap-1">
                      {r.type === "IMAGE" ? <ImageIcon className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                      {r.type === "IMAGE" ? "Image" : "Video"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.aspectRatio}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.usageCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.isActive ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleActive(r)}>
                      {r.isActive ? "Live" : "Hidden"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add template" : "Edit template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as "IMAGE" | "VIDEO" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMAGE">Image</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Aspect ratio</label>
                <Select value={form.aspectRatio} onValueChange={(v) => setForm((f) => ({ ...f, aspectRatio: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECTS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Title</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Neon rain portrait" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Category</label>
                <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Portraits" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Prompt (the recipe sent with the user&apos;s photo)</label>
              <Textarea
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                rows={5}
                placeholder="Describe the look in detail: style, lighting, composition, colours, mood…"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Cover image</label>
              <div className="flex items-center gap-3">
                {form.previewUrl ? (
                  <img src={form.previewUrl} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-line-strong text-muted-foreground">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f, "image");
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading === "image"} onClick={() => imageInput.current?.click()}>
                  {uploading === "image" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                </Button>
                <Input
                  value={form.previewUrl}
                  onChange={(e) => setForm((f) => ({ ...f, previewUrl: e.target.value }))}
                  placeholder="…or paste an image URL"
                  className="flex-1"
                />
              </div>
            </div>

            {form.type === "VIDEO" && (
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Preview clip (plays on hover)</label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={videoInput}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) upload(f, "video");
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading === "video"} onClick={() => videoInput.current?.click()}>
                      {uploading === "video" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Upload
                    </Button>
                    <Input
                      value={form.previewVideoUrl}
                      onChange={(e) => setForm((f) => ({ ...f, previewVideoUrl: e.target.value }))}
                      placeholder="…or paste a video URL"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Duration (s)</label>
                  <Input value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} inputMode="numeric" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Sort order (lower shows first)</label>
                <Input value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} inputMode="numeric" />
              </div>
              <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form.requiresPhoto} onChange={(e) => setForm((f) => ({ ...f, requiresPhoto: e.target.checked }))} />
                  User must upload a photo
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  Live (visible to users)
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete template"
        description="This removes the template from the studios. Chats already created from it are not affected."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
