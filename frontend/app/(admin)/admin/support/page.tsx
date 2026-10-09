"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { supportService } from "@/lib/services";
import { Eye, LifeBuoy, Mail } from "lucide-react";
import { toast } from "@/lib/toast";

type SupportTab = "TICKET" | "CONTACT";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  OPEN: "default",
  IN_PROGRESS: "secondary",
  RESOLVED: "outline",
  CLOSED: "destructive",
};

export default function SupportAdminPage() {
  const [tab, setTab] = useState<SupportTab>("TICKET");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [viewRequest, setViewRequest] = useState<any>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: String(page), pageSize: String(pageSize) };
      if (search) params.search = search;
      if (sort) params.sort = sort;
      Object.entries(activeFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res =
        tab === "TICKET"
          ? await supportService.listTickets(params)
          : await supportService.listContactMessages(params);
      const result = res.data.data;
      setRequests(result?.data || []);
      setPagination(result || {});
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [tab, search, sort, page, pageSize, activeFilters]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { setPage(1); }, [tab, search, sort, pageSize, activeFilters]);

  const switchTab = (next: SupportTab) => {
    setTab(next);
    setSearch("");
    setSort("");
    setActiveFilters({});
  };

  const handleStatusChange = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      await supportService.updateStatus(id, status);
      toast.success("Status updated");
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      if (viewRequest?.id === id) setViewRequest((prev: any) => ({ ...prev, status }));
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const baseColumns: Column[] = [
    {
      key: "name", label: "Name", sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.email}</p>
        </div>
      ),
    },
    ...(tab === "TICKET"
      ? [{
          key: "category", label: "Category",
          render: (r: any) => r.category
            ? <Badge variant="outline" className="text-xs">{r.category}</Badge>
            : <span className="text-muted-foreground text-xs">General</span>,
        } as Column]
      : []),
    {
      key: "subject", label: "Subject",
      render: (r) => <span className="line-clamp-1 max-w-[220px]">{r.subject}</span>,
    },
    {
      key: "status", label: "Status", sortable: true,
      render: (r) => (
        <Select
          value={r.status}
          onValueChange={(v) => handleStatusChange(r.id, v)}
          disabled={updatingId === r.id}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue>
              <Badge variant={STATUS_BADGE_VARIANT[r.status] || "default"} className="text-[10px]">
                {r.status.replace("_", " ")}
              </Badge>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "createdAt", label: "Received", sortable: true,
      render: (r) => <span className="text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions", label: "Actions", className: "text-right",
      render: (r) => (
        <div className="flex justify-end">
          <button
            onClick={() => setViewRequest(r)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support & Help</h1>
        <p className="text-muted-foreground text-sm mt-1">Review submitted tickets and contact messages</p>
      </div>

      <div className="flex gap-2 border-b border-border/40">
        {[
          { key: "TICKET" as const, label: "Tickets", icon: LifeBuoy },
          { key: "CONTACT" as const, label: "Contact Us", icon: Mail },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={baseColumns}
        data={requests}
        searchPlaceholder={tab === "TICKET" ? "Search tickets..." : "Search messages..."}
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
          {
            key: "status", label: "Status", type: "select",
            options: STATUS_OPTIONS.map((s) => ({ label: s.replace("_", " "), value: s })),
          },
        ]}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />

      <Dialog open={!!viewRequest} onOpenChange={() => setViewRequest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tab === "TICKET" ? "Ticket Details" : "Contact Message"}</DialogTitle>
          </DialogHeader>
          {viewRequest && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{viewRequest.name}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{viewRequest.email}</span></div>
                {viewRequest.category && (
                  <div><span className="text-muted-foreground">Category:</span> <Badge variant="outline" className="text-xs">{viewRequest.category}</Badge></div>
                )}
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_BADGE_VARIANT[viewRequest.status] || "default"}>{viewRequest.status.replace("_", " ")}</Badge></div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Subject</p>
                <p className="font-medium">{viewRequest.subject}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Message</p>
                <p className="whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{viewRequest.message}</p>
              </div>
              <div className="text-muted-foreground text-xs">Received: {new Date(viewRequest.createdAt).toLocaleString()}</div>
              {viewRequest.user && (
                <div className="text-muted-foreground text-xs">Registered user: {viewRequest.user.firstName} {viewRequest.user.lastName}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
