"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Mail, Phone, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { demoRequestService } from "@/lib/services";
import { toast } from "@/lib/toast";

type Status = "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";

interface DemoRequest {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  teamSize: string;
  features: string[];
  models: string[];
  message: string | null;
  status: Status;
  adminNotes: string | null;
  consentAt: string;
  createdAt: string;
}

const STATUSES: { id: Status; label: string }[] = [
  { id: "NEW", label: "New" },
  { id: "CONTACTED", label: "Contacted" },
  { id: "QUALIFIED", label: "Qualified" },
  { id: "CLOSED", label: "Closed" },
];

const statusStyle: Record<Status, string> = {
  NEW: "bg-accent-soft text-accent-ink",
  CONTACTED: "bg-sunken text-foreground",
  QUALIFIED: "bg-ok/15 text-ok",
  CLOSED: "bg-sunken text-faint",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function DemoRequestsAdminPage() {
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState<Status | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [active, setActive] = useState<DemoRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: "20" };
      if (status !== "ALL") params.status = status;
      if (debounced) params.search = debounced;
      const res = await demoRequestService.list(params);
      const data = res.data?.data;
      setRows(data?.data || []);
      setTotal(data?.totalRecords ?? 0);
      setTotalPages(data?.totalPages ?? 1);
      setCounts(data?.statusCounts || {});
    } catch {
      toast.error("Failed to load demo requests");
    } finally {
      setLoading(false);
    }
  }, [page, status, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = (r: DemoRequest) => {
    setActive(r);
    setNotes(r.adminNotes ?? "");
  };

  const changeStatus = async (r: DemoRequest, next: Status) => {
    try {
      await demoRequestService.update(r.id, { status: next });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
      setActive((a) => (a && a.id === r.id ? { ...a, status: next } : a));
      load();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const saveNotes = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await demoRequestService.update(active.id, { adminNotes: notes.trim() || null });
      toast.success("Notes saved");
      setRows((prev) => prev.map((x) => (x.id === active.id ? { ...x, adminNotes: notes.trim() || null } : x)));
      setActive(null);
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await demoRequestService.delete(deleteId);
      toast.success("Deleted");
      setDeleteId(null);
      setActive(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Demo requests</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Leads from the Business page form. New ones show first.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-sunken p-0.5">
          {[{ id: "ALL" as const, label: "All", count: allCount }, ...STATUSES.map((s) => ({ ...s, count: counts[s.id] ?? 0 }))].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatus(t.id)}
              className={`h-8 rounded-md border px-3 text-[13px] font-medium cursor-pointer ${
                status === t.id ? "border-border bg-surface text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} <span className="text-faint">· {t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-[300px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or company"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong py-16 text-center text-sm text-muted-foreground">
          {debounced || status !== "ALL" ? "No requests match." : "No demo requests yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Team</th>
                <th className="px-4 py-2.5 font-medium">Interested in</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => openDetail(r)} className="cursor-pointer border-t border-border hover:bg-sidebar-accent">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-4 py-3">{r.company}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.teamSize}</td>
                  <td className="max-w-[260px] px-4 py-3 text-xs text-muted-foreground">
                    <div className="truncate">{r.features.join(", ") || "—"}</div>
                    <div className="truncate text-faint">{r.models.join(", ")}</div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Select value={r.status} onValueChange={(v) => changeStatus(r, v as Status)}>
                      <SelectTrigger size="sm" className={`h-7 w-[118px] border-0 text-xs font-medium ${statusStyle[r.status]}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} requests</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[600px]">
          {active && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2">
                  {active.name}
                  <Badge className={`${statusStyle[active.status]} border-0`}>{STATUSES.find((s) => s.id === active.status)?.label}</Badge>
                </DialogTitle>
                <DialogDescription>Received {formatDate(active.createdAt)}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid gap-2 rounded-xl bg-sunken p-3.5">
                  <a href={`mailto:${active.email}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                    <Mail className="h-4 w-4" /> {active.email}
                  </a>
                  {active.phone && (
                    <a href={`tel:${active.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-foreground hover:underline">
                      <Phone className="h-4 w-4 text-muted-foreground" /> {active.phone}
                    </a>
                  )}
                  <div className="inline-flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" /> {active.company} · {active.teamSize} people
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Features needed</div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.features.length ? (
                      active.features.map((f) => (
                        <span key={f} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent-ink">
                          {f}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">None selected</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground">AI models</div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.models.map((m) => (
                      <span key={m} className="rounded-full border border-border px-2.5 py-1 text-xs">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {active.message && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Message</div>
                    <p className="whitespace-pre-wrap rounded-xl border border-border p-3 leading-relaxed">{active.message}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">Status</div>
                  <Select value={active.status} onValueChange={(v) => changeStatus(active, v as Status)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">Internal notes</div>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Call notes, next steps…" />
                </div>
              </div>

              <DialogFooter className="sm:justify-between">
                <Button variant="ghost" className="gap-1.5 text-destructive" onClick={() => setDeleteId(active.id)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setActive(null)}>
                    Close
                  </Button>
                  <Button onClick={saveNotes} disabled={saving}>
                    {saving ? "Saving…" : "Save notes"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete demo request"
        description="This removes the lead from the list. It can't be undone from here."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
