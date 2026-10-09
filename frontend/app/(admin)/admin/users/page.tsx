"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { userService } from "@/lib/services";
import { Loader2, Eye, Pencil, Trash2, Save, BarChart3, Coins, TrendingUp, Hash, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/lib/toast";

interface GroupedLog {
  id: string; // generated id
  user: any;
  messageId: number | null;
  capability: string;
  createdAt: string;
  models: any[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  billablePromptTokens: number;
  billableCompletionTokens: number;
  billableTotalTokens: number;
  subLogs: any[];
}

export default function UsersAdminPage() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("SUPERADMIN");

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  // View modal
  const [viewUser, setViewUser] = useState<any>(null);

  // Edit modal
  const [editUser, setEditUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", isActive: true, roles: [] as string[] });
  const [editSubscription, setEditSubscription] = useState<any>(null);
  const [editSubLoading, setEditSubLoading] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Usage modal
  const [usageUser, setUsageUser] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [usageLogs, setUsageLogs] = useState<GroupedLog[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usagePage, setUsagePage] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<GroupedLog | null>(null);

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: String(page), pageSize: String(pageSize) };
      if (search) params.search = search;
      if (sort) params.sort = sort;
      Object.entries(activeFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await userService.list(params);
      const result = res.data.data;
      setUsers(result?.data || []);
      setPagination(result || {});
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [search, sort, page, pageSize, activeFilters]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [search, sort, pageSize, activeFilters]);

  // ─── Edit handlers ───
  const openEdit = async (u: any) => {
    const currentRoles = u.userRoles?.map((ur: any) => ur.role.name) || [];
    setForm({
      firstName: u.firstName,
      lastName: u.lastName,
      phoneNumber: u.phoneNumber || "",
      isActive: u.isActive,
      roles: currentRoles,
    });
    setEditUser(u);
    setEditSubscription(null);
    setEditSubLoading(true);
    try {
      const res = await userService.getUserSubscription(u.id);
      setEditSubscription(res.data.data);
    } catch {
      setEditSubscription(null);
    } finally {
      setEditSubLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const payload: any = {
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber,
        isActive: form.isActive,
      };
      if (isSuperAdmin) {
        payload.roles = form.roles;
      }
      await userService.update(editUser.id, payload);
      toast.success("User updated");
      setEditUser(null);
      fetchUsers();
    } catch { toast.error("Failed to save"); } finally {
      setSaving(false);
    }
  };

  const toggleRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  };

  // ─── Delete handlers ───
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await userService.delete(deleteId);
      toast.success("User deleted");
      setDeleteId(null);
      fetchUsers();
    } catch { toast.error("Failed to delete"); } finally {
      setDeleting(false);
    }
  };

  // ─── Usage modal ───
  const openUsage = async (u: any, pg = 1) => {
    setUsageUser(u);
    setUsageLoading(true);
    setUsagePage(pg);
    try {
      const res = await userService.getUserUsage(u.id, { page: String(pg), pageSize: "10" });
      const rawData = res.data.data;
      setUsageData(rawData);

      setUsageLogs(rawData.usage?.data || []);
    } catch {
      toast.error("Failed to load usage");
    } finally {
      setUsageLoading(false);
    }
  };

  const columns: Column[] = [
    {
      key: "firstName", label: "Name", sortable: true,
      render: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span>,
    },
    {
      key: "email", label: "Email", sortable: true,
      render: (r) => <span className="text-muted-foreground">{r.email}</span>,
    },
    {
      key: "isActive", label: "Status", sortable: false,
      render: (r) => <Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "subscription", label: "Plan",
      render: (r) => {
        const sub = r.subscriptions?.[0];
        return sub?.plan?.name
          ? <Badge variant="outline" className="text-xs">{sub.plan.name}</Badge>
          : <span className="text-muted-foreground text-xs">None</span>;
      },
    },
    {
      key: "actions", label: "Actions", className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewUser(r)} title="View"><Eye className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openUsage(r)} title="Usage"><BarChart3 className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns}
        data={users}
        title="Users"
        description="Manage user accounts"
        searchPlaceholder="Search users..."
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        page={page}
        pageSize={pageSize}
        totalRecords={pagination.totalRecords || 0}
        totalPages={pagination.totalPages || 1}
        hasNextPage={pagination.hasNextPage || false}
        hasPreviousPage={pagination.hasPreviousPage || false}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        filters={[
          { key: "isActive", label: "Active", type: "boolean" },
          { key: "isVerified", label: "Verified", type: "boolean" },
        ]}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />

      {/* ─── View Modal ─── */}
      <Dialog open={!!viewUser} onOpenChange={() => setViewUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>
          {viewUser && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{viewUser.firstName} {viewUser.lastName}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{viewUser.email}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{viewUser.phoneNumber || "N/A"}</span></div>
                <div><span className="text-muted-foreground">Active:</span> <Badge variant={viewUser.isActive ? "default" : "secondary"}>{viewUser.isActive ? "Yes" : "No"}</Badge></div>
              </div>
              <div><span className="text-muted-foreground">Roles:</span> {viewUser.userRoles?.map((ur: any) => <Badge key={ur.role.id} variant="secondary" className="mr-1">{ur.role.name}</Badge>)}</div>
              <div className="text-muted-foreground text-xs">Created: {new Date(viewUser.createdAt).toLocaleString()}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit Modal ─── */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            {/* Profile section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Profile</h4>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {editUser?.firstName?.[0]}{editUser?.lastName?.[0]}
                </div>
                <div>
                  <p className="font-medium text-sm">{editUser?.email}</p>
                  <p className="text-xs text-muted-foreground">Joined {editUser?.createdAt ? new Date(editUser.createdAt).toLocaleDateString() : ""}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-sm font-medium">First name</label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Last name</label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><label className="text-sm font-medium">Phone</label><Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} id="userActive" className="rounded" />
                <label htmlFor="userActive" className="text-sm">Active</label>
              </div>
            </div>

            {/* Roles section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Roles</h4>
              <div className="flex flex-wrap gap-2">
                {["USER", "ADMIN"].map((role) => (
                  <button
                    key={role}
                    onClick={() => isSuperAdmin && role !== "USER" ? toggleRole(role) : undefined}
                    disabled={role === "USER" || !isSuperAdmin}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors border ${
                      form.roles.includes(role)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                    } ${role === "USER" || !isSuperAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {role}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {isSuperAdmin ? "USER role is always assigned. Click to toggle ADMIN role." : "Only SUPERADMIN can modify roles."}
              </p>
            </div>

            {/* Subscription section (read-only) */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Subscription</h4>
              {editSubLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : editSubscription ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-muted/30 rounded-xl p-4">
                  <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium">{editSubscription.plan?.name || "N/A"}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={editSubscription.status === "ACTIVE" ? "default" : "secondary"}>{editSubscription.status}</Badge></div>
                  <div><span className="text-muted-foreground">Billing:</span> <span className="font-medium">{editSubscription.billingCycle}</span></div>
                  <div><span className="text-muted-foreground">Auto-renew:</span> <span className="font-medium">{editSubscription.autoRenew ? "Yes" : "No"}</span></div>
                  <div><span className="text-muted-foreground">Started:</span> <span className="font-medium">{editSubscription.startedAt ? new Date(editSubscription.startedAt).toLocaleDateString() : "N/A"}</span></div>
                  <div><span className="text-muted-foreground">Expires:</span> <span className="font-medium">{editSubscription.expiresAt ? new Date(editSubscription.expiresAt).toLocaleDateString() : "N/A"}</span></div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No subscription found</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Usage Modal ─── */}
      <Dialog open={!!usageUser} onOpenChange={(open) => { 
        if (!open) {
          setUsageUser(null); 
          setUsageData(null); 
          setUsageLogs([]);
        }
      }}>
        <DialogContent className="max-w-[95vw] lg:max-w-6xl w-full p-4 md:p-6 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Usage — {usageUser?.firstName} {usageUser?.lastName}</DialogTitle></DialogHeader>
          {usageLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : usageData ? (
            <div className="flex flex-col gap-5 overflow-y-auto pr-1">
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: "Total Prompts", value: usageData.summary?.totalPrompts?.toLocaleString() || "0", icon: Hash, color: "text-amber-500 bg-amber-500/10" },
                  { label: "Actual Tokens", value: usageData.summary?.totalTokens?.toLocaleString() || "0", icon: Coins, color: "text-emerald-500 bg-emerald-500/10" },
                  { label: "Billable Tokens", value: usageData.summary?.billableTotalTokens?.toLocaleString() || "0", icon: TrendingUp, color: "text-primary bg-primary/10" },
                  { label: "Billable Prompt", value: usageData.summary?.billablePromptTokens?.toLocaleString() || "0", icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
                  { label: "Billable Completion", value: usageData.summary?.billableCompletionTokens?.toLocaleString() || "0", icon: TrendingUp, color: "text-purple-500 bg-purple-500/10" },
                ].map((card) => (
                  <div key={card.label} className="bg-card border border-border/30 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${card.color}`}><card.icon className="w-3.5 h-3.5" /></div>
                    </div>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className="text-lg font-bold">{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Usage table */}
              <div className="border border-border/30 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/30">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Model(s)</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Capability</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actual</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Billable</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageLogs.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No usage data</td></tr>
                      ) : (
                        usageLogs.map((log) => (
                          <tr key={log.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {log.models.map((m, i) => (
                                  <span key={i} className="text-xs border border-border bg-card px-2 py-0.5 rounded-full whitespace-nowrap">
                                    {m?.name || "Unknown"}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className="text-xs uppercase text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">{log.capability?.replace(/_/g, " ") || "STANDARD"}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono text-[10px] text-muted-foreground">{log.promptTokens?.toLocaleString() || 0} p / {log.completionTokens?.toLocaleString() || 0} c</span>
                                <span className="font-mono text-xs font-medium">{log.totalTokens?.toLocaleString() || 0} tot</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono text-[10px] text-muted-foreground">{log.billablePromptTokens?.toLocaleString() || 0} p / {log.billableCompletionTokens?.toLocaleString() || 0} c</span>
                                <span className="font-mono text-xs font-medium text-primary">{log.billableTotalTokens?.toLocaleString() || 0} tot</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                              {log.subLogs.length > 1 ? (
                                <button 
                                  onClick={() => setSelectedGroup(log)}
                                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
                                  title="View Breakdown"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {usageData.usage?.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/10 text-xs text-muted-foreground">
                    <span>Page {usagePage} of {usageData.usage.totalPages} ({usageData.usage.totalRecords} records)</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={!usageData.usage.hasPreviousPage} onClick={() => openUsage(usageUser, usagePage - 1)}>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={!usageData.usage.hasNextPage} onClick={() => openUsage(usageUser, usagePage + 1)}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* nested dialog for detailed log breakdown */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-[95vw] lg:max-w-3xl w-[90%] p-4 md:p-6">
          <DialogHeader>
            <DialogTitle>Usage Breakdown</DialogTitle>
          </DialogHeader>
          <div className="mt-4 border border-border rounded-lg overflow-hidden bg-card/50">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase">Model</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">Actual Tokens</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">Billable Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {selectedGroup?.subLogs.map((log: any, idx: number) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{log.model?.name || "Unknown"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{log.promptTokens?.toLocaleString() || 0} p / {log.completionTokens?.toLocaleString() || 0} c</span>
                        <span className="font-mono text-xs font-medium">{log.totalTokens?.toLocaleString() || 0} tot</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{log.billablePromptTokens?.toLocaleString() || 0} p / {log.billableCompletionTokens?.toLocaleString() || 0} c</span>
                        <span className="font-mono text-xs font-medium text-primary">{log.billableTotalTokens?.toLocaleString() || 0} tot</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete User" description="This will permanently delete this user account. This action cannot be undone." onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
