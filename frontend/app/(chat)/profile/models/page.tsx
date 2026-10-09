"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { modelService, modelProviderService } from "@/lib/services";
import { Loader2, Eye, Pencil, Trash2, Save, Plus, MessageSquare, Globe, Sparkles, Image as ImageIcon } from "lucide-react";
import { toast } from "@/lib/toast";

const CAPABILITY_OPTIONS = [
  { value: "STANDARD", label: "Standard", icon: MessageSquare, color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800" },
  { value: "DEEP_RESEARCH", label: "Deep Research", icon: Sparkles, color: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800" },
  { value: "IMAGE_GENERATION", label: "Image Gen", icon: ImageIcon, color: "bg-pink-500/10 text-pink-600 border-pink-200 dark:border-pink-800" },
  { value: "WEB_SEARCH", label: "Web Search", icon: Globe, color: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800" },
  { value: "VISION", label: "Vision", icon: Eye, color: "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800" },
];

function CapabilityToggle({
  options,
  selected,
  onChange,
  label,
  sublabel,
}: {
  options: typeof CAPABILITY_OPTIONS;
  selected: string[];
  onChange: (val: string[]) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium">{label}</label>
        {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                const next = active
                  ? selected.filter((v) => v !== opt.value)
                  : [...selected, opt.value];
                onChange(next);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${active
                  ? opt.color + " border-current"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                }`}
            >
              <Icon className="w-3 h-3" />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ModelsAdminPage() {
  const [models, setModels] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  const [viewModel, setViewModel] = useState<any>(null);
  const [editModel, setEditModel] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultForm = { name: "", externalId: "", description: "", modelProviderId: 0, capabilities: ["STANDARD"], isActive: true, defaultForCapabilities: [] as string[], tokenMultiplier: 1.0 };
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
      const [modelRes, provRes] = await Promise.all([modelService.list(params), modelProviderService.list()]);
      const result = modelRes.data.data;
      setModels(result?.data || []);
      setPagination(result || {});
      setProviders(provRes.data.data?.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, sort, page, pageSize, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, sort, pageSize, activeFilters]);

  const openEdit = (m: any) => {
    setForm({
      name: m.name,
      externalId: m.externalId,
      description: m.description || "",
      modelProviderId: m.modelProviderId,
      capabilities: m.capabilities || ["STANDARD"],
      isActive: m.isActive,
      defaultForCapabilities: m.defaultForCapabilities || [],
      tokenMultiplier: m.tokenMultiplier || 1.0,
    });
    setEditModel(m);
  };
  const handleOpenCreate = () => { setForm(defaultForm); setEditModel({ id: "new" }); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editModel.id === "new") {
        await modelService.create(form); toast.success("Model created");
      } else {
        await modelService.update(editModel.id, form); toast.success("Model updated");
      }
      setEditModel(null); fetchData();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const handleToggleActive = async (m: any) => {
    try { await modelService.update(m.id, { isActive: !m.isActive }); toast.success(m.isActive ? "Model disabled" : "Model enabled"); fetchData(); }
    catch { toast.error("Failed"); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await modelService.delete(deleteId); toast.success("Model deleted"); setDeleteId(null); fetchData(); }
    catch { toast.error("Failed to delete"); } finally { setDeleting(false); }
  };

  const columns: Column[] = [
    { key: "name", label: "Name", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "externalId", label: "External ID", render: (r) => <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.externalId}</code> },
    { key: "provider", label: "Provider", render: (r) => r.modelProvider?.name },
    { key: "tokenMultiplier", label: "Multiplier", sortable: true, render: (r) => <Badge variant="secondary" className="font-mono">{r.tokenMultiplier || 1.0}x</Badge> },
    { key: "capabilities", label: "Capabilities", render: (r) => <div className="flex flex-wrap gap-1">{r.capabilities?.map((c: string) => <Badge key={c} variant="outline" className="text-[10px]">{c.replace(/_/g, " ")}</Badge>)}</div> },
    { key: "isActive", label: "Status", sortable: true, render: (r) => <Badge variant={r.isActive ? "default" : "secondary"} className="cursor-pointer" onClick={() => handleToggleActive(r)}>{r.isActive ? "Active" : "Disabled"}</Badge> },
    {
      key: "actions", label: "Actions", className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewModel(r)}><Eye className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns} data={models} title="Models" description="Manage AI models" searchPlaceholder="Search models..."
        search={search} onSearchChange={setSearch} sort={sort} onSortChange={setSort}
        page={page} pageSize={pageSize} totalRecords={pagination.totalRecords || 0} totalPages={pagination.totalPages || 1}
        hasNextPage={pagination.hasNextPage} hasPreviousPage={pagination.hasPreviousPage}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        headerActions={<Button onClick={handleOpenCreate} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Model</Button>}
        filters={[{ key: "isActive", label: "Active", type: "boolean" }]}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />

      {/* View */}
      <Dialog open={!!viewModel} onOpenChange={() => setViewModel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Model Details</DialogTitle></DialogHeader>
          {viewModel && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{viewModel.name}</span></div>
              <div><span className="text-muted-foreground">External ID:</span> <code className="text-xs bg-muted px-1 rounded">{viewModel.externalId}</code></div>
              <div><span className="text-muted-foreground">Description:</span> <span className="text-muted-foreground whitespace-pre-wrap">{viewModel.description || "N/A"}</span></div>
              <div><span className="text-muted-foreground">Provider:</span> {viewModel.modelProvider?.name}</div>
              <div><span className="text-muted-foreground">Token Multiplier:</span> {viewModel.tokenMultiplier || 1.0}x</div>
              <div>
                <span className="text-muted-foreground block mb-1">Capabilities:</span>
                <div className="flex flex-wrap gap-1">{viewModel.capabilities?.map((c: string) => <Badge key={c} variant="outline">{c.replace(/_/g, " ")}</Badge>)}</div>
              </div>
              {viewModel.defaultForCapabilities?.length > 0 && (
                <div>
                  <span className="text-muted-foreground block mb-1">Default for:</span>
                  <div className="flex flex-wrap gap-1">{viewModel.defaultForCapabilities?.map((c: string) => <Badge key={c} variant="outline" className="border-primary text-primary">{c.replace(/_/g, " ")}</Badge>)}</div>
                </div>
              )}
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={viewModel.isActive ? "default" : "secondary"}>{viewModel.isActive ? "Active" : "Disabled"}</Badge></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={!!editModel} onOpenChange={() => setEditModel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editModel?.id === "new" ? "Add Model" : "Edit Model"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. GPT-4.1" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">External ID</label>
                <Input value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} placeholder="e.g. openai/gpt-4.1" className="font-mono text-xs" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Description</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Provider</label>
                <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" value={form.modelProviderId} onChange={(e) => setForm({ ...form, modelProviderId: parseInt(e.target.value) })}>
                  <option value={0} disabled>Select Provider</option>
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Token Multiplier</label>
                <Input type="number" step="0.1" value={form.tokenMultiplier} onChange={(e) => setForm({ ...form, tokenMultiplier: parseFloat(e.target.value) || 1.0 })} placeholder="e.g. 1.0" />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Capabilities (chip toggles) */}
            <CapabilityToggle
              label="Capabilities"
              sublabel="What this model can do"
              options={CAPABILITY_OPTIONS}
              selected={form.capabilities}
              onChange={(val) => {
                // Must have at least 1
                if (val.length === 0) return;
                // Remove defaultForCapabilities that are no longer in capabilities
                const newDefaults = form.defaultForCapabilities.filter((d) => val.includes(d));
                setForm({ ...form, capabilities: val, defaultForCapabilities: newDefaults });
              }}
            />

            {/* Default For (chip toggles — only show capabilities this model supports) */}
            <CapabilityToggle
              label="Default for"
              sublabel="Pre-selected when user switches to this mode"
              options={CAPABILITY_OPTIONS.filter((o) => form.capabilities.includes(o.value))}
              selected={form.defaultForCapabilities}
              onChange={(val) => setForm({ ...form, defaultForCapabilities: val })}
            />

            <div className="h-px bg-border" />

            {/* Active toggle */}
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm font-medium transition-all ${form.isActive
                  ? "bg-primary/5 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40"
                }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 transition-colors ${form.isActive ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
              {form.isActive ? "Active" : "Inactive"} — {form.isActive ? "Visible to users" : "Hidden from users"}
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModel(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Model" description="This will permanently delete this model." onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
