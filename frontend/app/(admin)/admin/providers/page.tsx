"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { modelProviderService } from "@/lib/services";
import { Loader2, Eye, Pencil, Trash2, Save } from "lucide-react";
import { toast } from "@/lib/toast";

export default function ProvidersAdminPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  const [viewProvider, setViewProvider] = useState<any>(null);
  const [editProvider, setEditProvider] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", isActive: true });
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const handleFilterChange = (key: string, value: string) => setActiveFilters((prev) => ({ ...prev, [key]: value }));

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: String(page), pageSize: String(pageSize) };
      if (search) params.search = search;
      if (sort) params.sort = sort;
      Object.entries(activeFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await modelProviderService.list(params);
      const result = res.data.data;
      setProviders(result?.data || []);
      setPagination(result || {});
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, sort, page, pageSize, activeFilters]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);
  useEffect(() => { setPage(1); }, [search, sort, pageSize, activeFilters]);

  const openEdit = (p: any) => { setForm({ name: p.name, description: p.description || "", isActive: p.isActive }); setEditProvider(p); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await modelProviderService.update(editProvider.id, form); toast.success("Provider updated");
      setEditProvider(null); fetchProviders();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await modelProviderService.delete(deleteId); toast.success("Provider deleted"); setDeleteId(null); fetchProviders(); }
    catch { toast.error("Failed to delete"); } finally { setDeleting(false); }
  };

  const columns: Column[] = [
    { key: "name", label: "Name", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "description", label: "Description", render: (r) => <span className="text-muted-foreground text-sm truncate max-w-[200px] block">{r.description || "—"}</span> },
    { key: "isActive", label: "Status", render: (r) => <Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Disabled"}</Badge> },
    {
      key: "actions", label: "Actions", className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewProvider(r)}><Eye className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns} data={providers} title="Providers" description="Manage model providers" searchPlaceholder="Search providers..."
        search={search} onSearchChange={setSearch} sort={sort} onSortChange={setSort}
        page={page} pageSize={pageSize} totalRecords={pagination.totalRecords || 0} totalPages={pagination.totalPages || 1}
        hasNextPage={pagination.hasNextPage} hasPreviousPage={pagination.hasPreviousPage}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        headerActions={<></>}
        filters={[{ key: "isActive", label: "Active", type: "boolean" }]}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />

      {/* View */}
      <Dialog open={!!viewProvider} onOpenChange={() => setViewProvider(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Provider Details</DialogTitle></DialogHeader>
          {viewProvider && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{viewProvider.name}</span></div>
              <div><span className="text-muted-foreground">Description:</span> {viewProvider.description || "N/A"}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={viewProvider.isActive ? "default" : "secondary"}>{viewProvider.isActive ? "Active" : "Disabled"}</Badge></div>
              <div className="text-muted-foreground text-xs">Created: {new Date(viewProvider.createdAt).toLocaleString()}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={!!editProvider} onOpenChange={() => setEditProvider(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Provider</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Description</label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} id="providerActive" className="rounded" />
              <label htmlFor="providerActive" className="text-sm">Active</label>
            </div>
          </div>
          <DialogFooter><Button onClick={handleSave} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Provider" description="This will permanently delete this provider." onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
