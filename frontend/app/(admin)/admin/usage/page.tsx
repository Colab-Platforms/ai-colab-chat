"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { Input } from "@/components/ui/input";
import { Search, Eye } from "lucide-react";
import { usageLogService } from "@/lib/services";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

export default function AdminUsagePage() {
  const { hasRole, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  
  const [selectedGroup, setSelectedGroup] = useState<GroupedLog | null>(null);

  // Search handled natively by DataTable with debounce
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !hasRole("ADMIN") && !hasRole("SUPERADMIN")) {
      router.replace("/profile");
    }
  }, [hasRole, authLoading, router]);

  const fetchLogs = useCallback(async () => {
    if (authLoading || (!hasRole("ADMIN") && !hasRole("SUPERADMIN"))) return;
    
    setLoading(true);
    try {
      const params: any = { 
        page: String(page), 
        pageSize: String(pageSize),
      };
      
      if (sort) params.sort = sort;
      
      // If there's a search term, the backend usage-log service needs `userId`.
      // Note: The ideal approach is to have a robust `search` param in the usage log backend
      // that joins on user name/email, OR allowing filtering by a specific user.
      // Since `buildPrismaQuery` in `usageLogService` supports `userId`, we might need 
      // a global search param across all logs. Let's send `search` if it's supported,
      // or we just send it as a search term and hope the backend handles it.
      if (debouncedSearch) {
        params.search = debouncedSearch;
      }
      
      
      const res = await usageLogService.list(params);
      const result = res.data.data;
      
      setLogs(result?.data || []);
      setPagination(result || {});
    } catch { 
      /* ignore */ 
    } finally { 
      setLoading(false); 
    }
  }, [sort, page, pageSize, debouncedSearch, authLoading, hasRole]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [sort, pageSize, debouncedSearch]);

  const columns: Column[] = [
    { key: "user", label: "User", render: (r: GroupedLog) => <span className="font-medium">{r.user?.firstName} {r.user?.lastName}<br/><span className="text-xs text-muted-foreground font-normal">{r.user?.email}</span></span> },
    { key: "models", label: "Model(s)", render: (r: GroupedLog) => (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {r.models.map((m, i) => (
          <span key={i} className="text-xs border border-border bg-card px-2 py-0.5 rounded-full whitespace-nowrap">
            {m?.name || "Unknown"}
          </span>
        ))}
      </div>
    )},
    { key: "capability", label: "Capability", render: (r: GroupedLog) => <span className="text-xs uppercase text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">{r.capability?.replace(/_/g, " ") || "STANDARD"}</span> },
    { key: "actualTokens", label: "Actual", className: "text-right", render: (r: GroupedLog) => (
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-[10px] text-muted-foreground">{r.promptTokens?.toLocaleString() || 0} p / {r.completionTokens?.toLocaleString() || 0} c</span>
        <span className="font-mono text-xs font-medium">{r.totalTokens?.toLocaleString() || 0} tot</span>
      </div>
    )},
    { key: "billableTokens", label: "Billable", className: "text-right", render: (r: GroupedLog) => (
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-[10px] text-muted-foreground">{r.billablePromptTokens?.toLocaleString() || 0} p / {r.billableCompletionTokens?.toLocaleString() || 0} c</span>
        <span className="font-mono text-xs font-medium text-primary">{r.billableTotalTokens?.toLocaleString() || 0} tot</span>
      </div>
    )},
    { key: "createdAt", label: "Date", sortable: true, render: (r: GroupedLog) => <span className="text-muted-foreground text-sm">{new Date(r.createdAt).toLocaleString()}</span> },
    { key: "actions", label: "", className: "w-10", render: (r: GroupedLog) => (
      r.subLogs.length > 1 ? (
        <button 
          onClick={() => setSelectedGroup(r)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
          title="View Breakdown"
        >
          <Eye className="w-4 h-4" />
        </button>
      ) : null
    )},
  ];

  if (authLoading || (!hasRole("ADMIN") && !hasRole("SUPERADMIN"))) {
    return <div className="p-8 flex justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <DataTable
        columns={columns}
        data={logs}
        title="Token Usage"
        description="Token usage across all users"
        search={debouncedSearch}
        onSearchChange={setDebouncedSearch}
        searchPlaceholder="Filter by user (name or email)..."
        sort={sort}
        onSortChange={setSort}
        page={page}
        pageSize={pageSize}
        totalRecords={pagination.totalRecords || 0}
        totalPages={pagination.totalPages || 1}
        hasNextPage={pagination.hasNextPage}
        hasPreviousPage={pagination.hasPreviousPage}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loading={loading}
      />

      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-3xl w-[90%]">
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
    </div>
  );
}
