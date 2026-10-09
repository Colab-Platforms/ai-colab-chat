"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { assistantService, modelService } from "@/lib/services";
import { Loader2, Pencil, Trash2, Save, Plus, Bot } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { toast } from "@/lib/toast";

export default function AssistantsAdminPage() {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultForm = {
    name: "",
    icon: "Bot",
    bgFrom: "#f3e8ff",
    bgVia: "#e9d5ff",
    bgTo: "#fce7f3",
    bgFromDark: "#312e81",
    bgViaDark: "#3b0764",
    bgToDark: "#4c1d95",
    temperature: "0.7",
    description: "",
    systemPrompt: "You are a helpful AI assistant.",
    defaultModelId: "",
    prompt1: "",
    prompt2: "",
    prompt3: "",
  };
  const [form, setForm] = useState(defaultForm);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const handleFilterChange = (key: string, value: string) => setActiveFilters((prev) => ({ ...prev, [key]: value }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: String(page), pageSize: String(pageSize) };
      if (search) params.search = search;
      if (sort) params.sort = sort;
      Object.entries(activeFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      
      const [aRes, mRes] = await Promise.all([
        assistantService.list(params),
        modelService.list({ pageSize: "100" })
      ]);
      
      const result = aRes.data.data;
      setAssistants(result?.data || []);
      setPagination(result || {});
      setModels(mRes.data.data?.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, sort, page, pageSize, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, sort, pageSize, activeFilters]);

  const openEdit = (a: any) => {
    setForm({
      name: a.name,
      icon: a.icon || "Bot",
      bgFrom: a.bgFrom || "#f3e8ff",
      bgVia: a.bgVia || "#e9d5ff",
      bgTo: a.bgTo || "#fce7f3",
      bgFromDark: a.bgFromDark || "#312e81",
      bgViaDark: a.bgViaDark || "#3b0764",
      bgToDark: a.bgToDark || "#4c1d95",
      temperature: a.temperature.toString(),
      description: a.description || "",
      systemPrompt: a.systemPrompt,
      defaultModelId: a.defaultModelId ? a.defaultModelId.toString() : "",
      prompt1: a.suggestedPrompts?.[0] || "",
      prompt2: a.suggestedPrompts?.[1] || "",
      prompt3: a.suggestedPrompts?.[2] || "",
    });
    setEditTarget(a);
  };
  
  const handleOpenCreate = () => { setForm(defaultForm); setEditTarget({ id: "new" }); };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({ ...prev, name }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        icon: form.icon.trim() || "Bot",
        bgFrom: form.bgFrom || null,
        bgVia: form.bgVia || null,
        bgTo: form.bgTo || null,
        bgFromDark: form.bgFromDark || null,
        bgViaDark: form.bgViaDark || null,
        bgToDark: form.bgToDark || null,
        systemPrompt: form.systemPrompt.trim(),
        temperature: parseFloat(form.temperature) || 0.7,
        defaultModelId: form.defaultModelId ? parseInt(form.defaultModelId) : null,
      };

      const prompts = [form.prompt1, form.prompt2, form.prompt3].map(p => p.trim()).filter(Boolean);
      payload.suggestedPrompts = prompts.length > 0 ? prompts : null;

      if (editTarget.id === "new") {
        await assistantService.create(payload);
        toast.success("Assistant created");
      } else {
        await assistantService.update(editTarget.id, payload);
        toast.success("Assistant updated");
      }
      window.dispatchEvent(new Event("refresh-assistants"));
      setEditTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save assistant");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (a: any) => {
    try {
      await assistantService.toggle(a.id);
      toast.success(a.isActive ? "Assistant deactivated" : "Assistant activated");
      window.dispatchEvent(new Event("refresh-assistants"));
      fetchData();
    } catch {
      toast.error("Failed to toggle status");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await assistantService.delete(deleteId);
      toast.success("Assistant deleted");
      window.dispatchEvent(new Event("refresh-assistants"));
      setDeleteId(null);
      fetchData();
    } catch {
      toast.error("Failed to delete assistant");
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column[] = [
    { key: "icon", label: "Icon", render: (r) => {
        const Icon = (LucideIcons as any)[r.icon] as React.ElementType || Bot;
        return <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>;
    }},
    { key: "name", label: "Name", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "temperature", label: "Response Style", render: (r) => <Badge variant="secondary" className="font-mono">{r.temperature}</Badge> },
    { key: "isActive", label: "Status", sortable: true, render: (r) => <Badge variant={r.isActive ? "default" : "secondary"} className="cursor-pointer" onClick={() => handleToggleActive(r)}>{r.isActive ? "Active" : "Inactive"}</Badge> },
    {
      key: "actions", label: "Actions", className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns} data={assistants} title="Assistants" description="Manage specialized AI personas" searchPlaceholder="Search assistants..."
        search={search} onSearchChange={setSearch} sort={sort} onSortChange={setSort}
        page={page} pageSize={pageSize} totalRecords={pagination.totalRecords || 0} totalPages={pagination.totalPages || 1}
        hasNextPage={pagination.hasNextPage} hasPreviousPage={pagination.hasPreviousPage}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        headerActions={<Button onClick={handleOpenCreate} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Assistant</Button>}
        filters={[{ key: "isActive", label: "Active", type: "boolean" }]}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editTarget?.id === "new" ? "Add Assistant" : "Edit Assistant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <Input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Legal Advisor" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default Model</label>
                <Select value={form.defaultModelId || "none"} onValueChange={v => setForm(p => ({ ...p, defaultModelId: v === "none" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Let user choose</SelectItem>
                    {models.map(m => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Lucide Icon Name</label>
                <Input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} placeholder="e.g. Bot, Rocket, Code2" />
                <p className="text-xs text-muted-foreground">Use a valid <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" className="text-primary underline">Lucide icon name</a></p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Response Creativity (0.0 – 2.0)</label>
                <Input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={e => setForm(p => ({ ...p, temperature: e.target.value }))} />
                <p className="text-xs text-muted-foreground">0 = strict and predictable, 1 = balanced, 2 = highly creative and varied responses.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Chat Background Gradient</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">From</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.bgFrom} onChange={e => setForm(p => ({ ...p, bgFrom: e.target.value }))} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input value={form.bgFrom} onChange={e => setForm(p => ({ ...p, bgFrom: e.target.value }))} placeholder="#f3e8ff" className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Via</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.bgVia} onChange={e => setForm(p => ({ ...p, bgVia: e.target.value }))} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input value={form.bgVia} onChange={e => setForm(p => ({ ...p, bgVia: e.target.value }))} placeholder="#e9d5ff" className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">To</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.bgTo} onChange={e => setForm(p => ({ ...p, bgTo: e.target.value }))} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input value={form.bgTo} onChange={e => setForm(p => ({ ...p, bgTo: e.target.value }))} placeholder="#fce7f3" className="font-mono text-sm" />
                  </div>
                </div>
              </div>
              <div className="h-10 rounded-md border" style={{ background: `linear-gradient(135deg, ${form.bgFrom || "#f3e8ff"}, ${form.bgVia || form.bgFrom || "#e9d5ff"}, ${form.bgTo || "#fce7f3"})` }} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Chat Background Gradient (Dark Mode)</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">From</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.bgFromDark} onChange={e => setForm(p => ({ ...p, bgFromDark: e.target.value }))} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input value={form.bgFromDark} onChange={e => setForm(p => ({ ...p, bgFromDark: e.target.value }))} placeholder="#312e81" className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Via</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.bgViaDark} onChange={e => setForm(p => ({ ...p, bgViaDark: e.target.value }))} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input value={form.bgViaDark} onChange={e => setForm(p => ({ ...p, bgViaDark: e.target.value }))} placeholder="#3b0764" className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">To</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.bgToDark} onChange={e => setForm(p => ({ ...p, bgToDark: e.target.value }))} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input value={form.bgToDark} onChange={e => setForm(p => ({ ...p, bgToDark: e.target.value }))} placeholder="#4c1d95" className="font-mono text-sm" />
                  </div>
                </div>
              </div>
              <div className="h-10 rounded-md border" style={{ background: `linear-gradient(135deg, ${form.bgFromDark || "#312e81"}, ${form.bgViaDark || form.bgFromDark || "#3b0764"}, ${form.bgToDark || "#4c1d95"})` }} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description shown in sidebar tooltip" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">System Prompt *</label>
              <Textarea
                value={form.systemPrompt}
                onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
                placeholder="You are an expert in..."
                rows={5}
                className="font-mono text-sm resize-y"
              />
            </div>

            <div className="space-y-1.5 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold">User Experience</h4>
              <p className="text-xs text-muted-foreground">Customize quick-start suggestion prompts.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Suggestion 1</label>
                <Input value={form.prompt1} onChange={e => setForm(p => ({ ...p, prompt1: e.target.value }))} placeholder="e.g. Explain how to..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Suggestion 2</label>
                <Input value={form.prompt2} onChange={e => setForm(p => ({ ...p, prompt2: e.target.value }))} placeholder="e.g. Write a script that..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Suggestion 3</label>
                <Input value={form.prompt3} onChange={e => setForm(p => ({ ...p, prompt3: e.target.value }))} placeholder="e.g. Brainstorm ideas for..." />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 mt-auto">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Assistant" description="This will permanently delete this assistant." onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
