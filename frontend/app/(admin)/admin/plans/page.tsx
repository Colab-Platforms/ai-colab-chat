"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { planService, modelService } from "@/lib/services";
import { Loader2, Eye, Pencil, Trash2, Plus, Save } from "lucide-react";
import { toast } from "@/lib/toast";

export default function PlansAdminPage() {
  const defaultFeatures = { maxModels: -1, attachments: true };
  const defaultForm = {
    name: "",
    monthlyPrice: 0,
    quarterlyPrice: 0,
    yearlyPrice: 0,
    tokenLimit: 10000,
    isActive: true,
    features: JSON.stringify(defaultFeatures, null, 2),
    restrictToFreeModels: false,
    documentGenEnabled: true,
    imageGenEnabled: false,
    videoGenEnabled: false,
    monthlyVideoCredits: 0,
    allowedVideoModelIds: [] as number[],
  };
  const [plans, setPlans] = useState<any[]>([]);
  const [videoModels, setVideoModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  const [viewPlan, setViewPlan] = useState<any>(null);
  const [editPlan, setEditPlan] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const handleFilterChange = (key: string, value: string) => setActiveFilters((prev) => ({ ...prev, [key]: value }));

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: String(page), pageSize: String(pageSize) };
      if (search) params.search = search;
      if (sort) params.sort = sort;
      Object.entries(activeFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await planService.list(params);
      const result = res.data.data;
      setPlans(result?.data || []);
      setPagination(result || {});
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [search, sort, page, pageSize, activeFilters]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);
  useEffect(() => { setPage(1); }, [search, sort, pageSize, activeFilters]);
  useEffect(() => {
    modelService
      .list({ capability: "VIDEO_GENERATION", pageSize: "100" })
      .then((res) => setVideoModels(res.data?.data?.data || res.data?.data || []))
      .catch(() => {});
  }, []);

  const openCreate = () => { setForm(defaultForm); setEditPlan({ _isNew: true }); };
  const openEdit = (p: any) => {
    setForm({
      name: p.name,
      monthlyPrice: p.monthlyPrice,
      quarterlyPrice: p.quarterlyPrice,
      yearlyPrice: p.yearlyPrice,
      tokenLimit: p.tokenLimit,
      isActive: p.isActive ?? true,
      features: JSON.stringify(p.features ?? defaultFeatures, null, 2),
      restrictToFreeModels: Boolean(p.restrictToFreeModels),
      documentGenEnabled: p.documentGenEnabled !== false,
      imageGenEnabled: Boolean(p.imageGenEnabled),
      videoGenEnabled: Boolean(p.videoGenEnabled),
      monthlyVideoCredits: p.monthlyVideoCredits ?? 0,
      allowedVideoModelIds: (p.allowedVideoModels || []).map((v: any) => v.modelId ?? v.model?.id ?? v.id),
    });
    setEditPlan(p);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let parsedFeatures: Record<string, unknown> = {};
      try {
        parsedFeatures = JSON.parse(form.features || "{}");
      } catch {
        toast.error("Features must be valid JSON");
        return;
      }

      const payload = {
        name: form.name,
        monthlyPrice: form.monthlyPrice,
        quarterlyPrice: form.quarterlyPrice,
        yearlyPrice: form.yearlyPrice,
        tokenLimit: form.tokenLimit,
        isActive: form.isActive,
        features: parsedFeatures,
        restrictToFreeModels: form.restrictToFreeModels,
        documentGenEnabled: form.documentGenEnabled,
        imageGenEnabled: form.imageGenEnabled,
        videoGenEnabled: form.videoGenEnabled,
        monthlyVideoCredits: form.monthlyVideoCredits,
        allowedVideoModelIds: form.allowedVideoModelIds,
      };

      if (editPlan._isNew) { await planService.create(payload); toast.success("Plan created"); }
      else { await planService.update(editPlan.id, payload); toast.success("Plan updated"); }
      setEditPlan(null); fetchPlans();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await planService.delete(deleteId); toast.success("Plan deleted"); setDeleteId(null); fetchPlans(); }
    catch { toast.error("Failed to delete"); } finally { setDeleting(false); }
  };

  const columns: Column[] = [
    { key: "name", label: "Name", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "monthlyPrice", label: "Monthly", sortable: true, render: (r) => r.monthlyPrice === 0 ? "Free" : `₹${r.monthlyPrice}` },
    {
      key: "isActive", label: "Status", sortable: false,
      render: (r) => <Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Inactive"}</Badge>,
    },
    { key: "tokenLimit", label: "Token Limit", sortable: true, render: (r) => `${(r.tokenLimit / 1000).toFixed(0)}k` },
    { key: "models", label: "Models", render: (r) => r.features?.maxModels === -1 ? "∞" : r.features?.maxModels },
    {
      key: "videoCredits", label: "Video Credits",
      render: (r) => r.videoGenEnabled ? `${r.monthlyVideoCredits ?? 0}/mo` : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "actions", label: "Actions", className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewPlan(r)}><Eye className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns} data={plans} title="Plans" description="Manage subscription plans" searchPlaceholder="Search plans..."
        search={search} onSearchChange={setSearch} sort={sort} onSortChange={setSort}
        page={page} pageSize={pageSize} totalRecords={pagination.totalRecords || 0} totalPages={pagination.totalPages || 1}
        hasNextPage={pagination.hasNextPage} hasPreviousPage={pagination.hasPreviousPage}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        headerActions={<Button className="gap-2" onClick={openCreate}><Plus className="w-4 h-4" /> Add Plan</Button>}
        filters={[{ key: "isActive", label: "Active", type: "boolean" }]}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />

      {/* View */}
      <Dialog open={!!viewPlan} onOpenChange={() => setViewPlan(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Plan Details</DialogTitle></DialogHeader>
          {viewPlan && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{viewPlan.name}</span></div>
              <div><span className="text-muted-foreground">Monthly:</span> ₹{viewPlan.monthlyPrice}</div>
              <div><span className="text-muted-foreground">Quarterly:</span> ₹{viewPlan.quarterlyPrice}</div>
              <div><span className="text-muted-foreground">Yearly:</span> ₹{viewPlan.yearlyPrice}</div>
              <div><span className="text-muted-foreground">Token Limit:</span> {viewPlan.tokenLimit?.toLocaleString()}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={viewPlan.isActive ? "default" : "secondary"}>{viewPlan.isActive ? "Active" : "Inactive"}</Badge></div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant={viewPlan.restrictToFreeModels ? "secondary" : "default"}>
                  {viewPlan.restrictToFreeModels ? "Free models only" : "All models"}
                </Badge>
                <Badge variant={viewPlan.documentGenEnabled ? "default" : "secondary"}>
                  {viewPlan.documentGenEnabled ? "Docs ✓" : "Docs ✗"}
                </Badge>
                <Badge variant={viewPlan.imageGenEnabled ? "default" : "secondary"}>
                  {viewPlan.imageGenEnabled ? "Image ✓" : "Image ✗"}
                </Badge>
                <Badge variant={viewPlan.videoGenEnabled ? "default" : "secondary"}>
                  {viewPlan.videoGenEnabled ? `Video ✓ (${viewPlan.monthlyVideoCredits ?? 0}/mo)` : "Video ✗"}
                </Badge>
              </div>
              {viewPlan.videoGenEnabled && (
                <div>
                  <span className="text-muted-foreground block mb-1">Allowed video models:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(viewPlan.allowedVideoModels || []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">None assigned</span>
                    ) : (
                      viewPlan.allowedVideoModels.map((v: any) => {
                        const model = videoModels.find((m) => m.id === v.modelId);
                        return <Badge key={v.modelId} variant="outline">{model?.name || `#${v.modelId}`}</Badge>;
                      })
                    )}
                  </div>
                </div>
              )}
              <div><span className="text-muted-foreground">Features:</span> <pre className="mt-1 text-xs bg-muted p-2 rounded">{JSON.stringify(viewPlan.features, null, 2)}</pre></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={!!editPlan} onOpenChange={() => setEditPlan(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editPlan?._isNew ? "Create Plan" : "Edit Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><label className="text-xs font-medium">Monthly (INR ₹)</label><Input type="number" step="0.01" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Quarterly (INR ₹)</label><Input type="number" step="0.01" value={form.quarterlyPrice} onChange={(e) => setForm({ ...form, quarterlyPrice: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Yearly (INR ₹)</label><Input type="number" step="0.01" value={form.yearlyPrice} onChange={(e) => setForm({ ...form, yearlyPrice: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium">Token Limit</label><Input type="number" value={form.tokenLimit} onChange={(e) => setForm({ ...form, tokenLimit: parseInt(e.target.value) || 0 })} /></div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                id="planActive"
                className="rounded"
              />
              <label htmlFor="planActive" className="text-sm">Active</label>
            </div>

            <div className="space-y-2 rounded-md border border-border/40 p-3">
              <label className="text-sm font-medium">Capabilities</label>
              {[
                { key: "restrictToFreeModels" as const, label: "Restrict chat to free models only" },
                { key: "documentGenEnabled" as const, label: "Document generation" },
                { key: "imageGenEnabled" as const, label: "Image generation" },
                { key: "videoGenEnabled" as const, label: "Video generation" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    id={key}
                    className="rounded"
                  />
                  <label htmlFor={key} className="text-sm">{label}</label>
                </div>
              ))}
            </div>

            {form.videoGenEnabled && (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Video Credits / Month</label>
                  <Input
                    type="number"
                    value={form.monthlyVideoCredits}
                    onChange={(e) => setForm({ ...form, monthlyVideoCredits: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Allowed Video Models</label>
                  <div className="space-y-1.5 rounded-md border border-border/40 p-3 max-h-40 overflow-y-auto">
                    {videoModels.length === 0 && (
                      <p className="text-xs text-muted-foreground">No video models found</p>
                    )}
                    {videoModels.map((m) => {
                      const checked = form.allowedVideoModelIds.includes(m.id);
                      return (
                        <div key={m.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                allowedVideoModelIds: e.target.checked
                                  ? [...form.allowedVideoModelIds, m.id]
                                  : form.allowedVideoModelIds.filter((id) => id !== m.id),
                              })
                            }
                            id={`video-model-${m.id}`}
                            className="rounded"
                          />
                          <label htmlFor={`video-model-${m.id}`} className="text-sm">{m.name}</label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Features (JSON)</label>
              <Textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                rows={7}
                placeholder={`{\n  "maxModels": -1,\n  "attachments": true\n}`}
              />
            </div>
          </div>
          <DialogFooter><Button onClick={handleSave} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editPlan?._isNew ? "Create" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Plan" description="This will permanently delete this plan." onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
