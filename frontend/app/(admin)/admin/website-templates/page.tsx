"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { attachmentService, modelService, websiteTemplateService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface TemplateRow {
  id: number;
  name: string;
  description: string;
  previewUrl: string;
  thumbnailUrl: string;
  techStack: string[];
  prompt: string;
  modelId: number | null;
  model: { id: number; name: string } | null;
  category: string | null;
  sortOrder: number;
  usageCount: number;
  isActive: boolean;
}

interface ModelOption {
  id: number;
  name: string;
}

/** The Select has no empty-string value, so "no model" needs its own sentinel. */
const NO_MODEL = "none";

const emptyForm = {
  name: "",
  description: "",
  previewUrl: "",
  thumbnailUrl: "",
  techStack: "",
  prompt: "",
  modelId: NO_MODEL,
  category: "",
  sortOrder: "0",
  isActive: true,
};

export default function WebsiteTemplatesAdminPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const thumbnailInput = useRef<HTMLInputElement>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await websiteTemplateService.adminList();
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

  useEffect(() => {
    modelService
      .list({ pageSize: "100" })
      .then((res) => {
        const all = res.data.data?.data || [];
        setModels(all.filter((m: any) => m.isActive).map((m: any) => ({ id: m.id, name: m.name })));
      })
      .catch(() => {
        // The model is optional on a template — a failed list just leaves the
        // picker empty rather than blocking the whole screen.
      });
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditing("new");
  };

  const openEdit = (r: TemplateRow) => {
    setForm({
      name: r.name,
      description: r.description,
      previewUrl: r.previewUrl,
      thumbnailUrl: r.thumbnailUrl,
      techStack: r.techStack.join(", "),
      prompt: r.prompt,
      modelId: r.modelId ? String(r.modelId) : NO_MODEL,
      category: r.category ?? "",
      sortOrder: String(r.sortOrder),
      isActive: r.isActive,
    });
    setEditing(r);
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const res = await attachmentService.presend(file);
      setForm((f) => ({ ...f, thumbnailUrl: res.data.data.fileUrl }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to upload thumbnail");
    } finally {
      setUploading(false);
    }
  };

  const canSave =
    form.name.trim() &&
    form.description.trim() &&
    form.previewUrl.trim() &&
    form.thumbnailUrl.trim() &&
    form.prompt.trim() &&
    !saving &&
    !uploading;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim(),
        previewUrl: form.previewUrl.trim(),
        thumbnailUrl: form.thumbnailUrl.trim(),
        techStack: form.techStack
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        prompt: form.prompt.trim(),
        modelId: form.modelId === NO_MODEL ? null : Number(form.modelId),
        category: form.category.trim() || null,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
        isActive: form.isActive,
      };
      if (editing === "new") {
        await websiteTemplateService.create(payload);
        toast.success("Template created");
      } else if (editing) {
        await websiteTemplateService.update(editing.id, payload);
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
      await websiteTemplateService.update(r.id, { isActive: !r.isActive });
      load();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await websiteTemplateService.delete(deleteId);
      toast.success("Template deleted");
      setDeleteId(null);
      load();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Website templates</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Designs shown under the Software Engineer composer. Users attach one, write their own prompt, and the
            stored design brief is sent with every code turn in that chat.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" /> Add template
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong py-16 text-center text-sm text-muted-foreground">
          No templates yet. Add your first website design.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Template</th>
                <th className="px-4 py-2.5 font-medium">Tech stack</th>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium">Used</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={r.thumbnailUrl} alt="" className="h-12 w-16 rounded-lg border border-border object-cover" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.category || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.techStack.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        r.techStack.map((tech) => (
                          <Badge key={tech} variant="secondary">
                            {tech}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.model?.name || "—"}</td>
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
                <label className="text-xs font-semibold">Name</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Voltage" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Category</label>
                <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Agency" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Description (one line, shown in the modal)</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Digital marketing agency — kinetic, confident, electric"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Preview link (loaded in the modal&apos;s iframe)</label>
              <Input
                value={form.previewUrl}
                onChange={(e) => setForm((f) => ({ ...f, previewUrl: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Thumbnail (the gallery card)</label>
              <div className="flex items-center gap-3">
                {form.thumbnailUrl ? (
                  <img src={form.thumbnailUrl} alt="" className="h-16 w-20 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-16 w-20 items-center justify-center rounded-lg border border-dashed border-line-strong text-muted-foreground">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <input
                  ref={thumbnailInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f);
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => thumbnailInput.current?.click()}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                </Button>
                <Input
                  value={form.thumbnailUrl}
                  onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))}
                  placeholder="…or paste an image URL"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Tech stack (comma separated)</label>
                <Input
                  value={form.techStack}
                  onChange={(e) => setForm((f) => ({ ...f, techStack: e.target.value }))}
                  placeholder="React, Tailwind, Framer Motion"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Model (preselected on use)</label>
                <Select value={form.modelId} onValueChange={(v) => setForm((f) => ({ ...f, modelId: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MODEL}>No preference</SelectItem>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Design brief (sent to the model, never shown to the user)</label>
              <Textarea
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                rows={6}
                placeholder="Describe the design language: typography, scale, spacing, colour palette, motion, layout rhythm…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Sort order (lower shows first)</label>
                <Input value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} inputMode="numeric" />
              </div>
              <div className="flex flex-col justify-end pb-1 text-sm">
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
        description="This removes the template from the gallery. Chats already created from it keep their design brief."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
