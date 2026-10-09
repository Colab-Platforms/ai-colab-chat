"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { usageLogService } from "@/lib/services";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { SettingsHeader } from "@/components/settings/settings-ui";

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

export default function UsagePage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>({});
  const [selectedGroup, setSelectedGroup] = useState<GroupedLog | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const params: any = { 
        page: String(page), 
        pageSize: String(pageSize),
        userId: String(user.id) // Always filter by the current logged in user
      };
      if (sort) params.sort = sort;
      const res = await usageLogService.list(params);
      const result = res.data.data;
      
      setLogs(result?.data || []);
      setPagination(result || {});
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [sort, page, pageSize, user?.id]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [sort, pageSize]);

  const columns: Column[] = [
    { key: "models", label: "Model(s)", render: (r: GroupedLog) => (
      <div className="flex flex-wrap gap-1 max-w-[250px]">
        {r.models.map((m, i) => (
          <span key={i} className="text-[13px] font-medium whitespace-nowrap">
            {m?.name || "Unknown"}
          </span>
        ))}
      </div>
    )},
    { key: "capability", label: "Capability", render: (r: GroupedLog) => <span className="text-xs capitalize text-muted-foreground bg-sunken px-2 py-1 rounded-md">{(r.capability?.replace(/_/g, " ") || "standard").toLowerCase()}</span> },
    { key: "promptTokens", label: "Prompt", sortable: true, className: "text-right", render: (r: GroupedLog) => <span className="text-sm text-muted-foreground">{r.billablePromptTokens?.toLocaleString() || 0}</span> },
    { key: "completionTokens", label: "Completion", sortable: true, className: "text-right", render: (r: GroupedLog) => <span className="text-sm text-muted-foreground">{r.billableCompletionTokens?.toLocaleString() || 0}</span> },
    { key: "totalTokens", label: "Total", sortable: true, className: "text-right", render: (r: GroupedLog) => <span className="font-semibold text-sm text-foreground">{r.billableTotalTokens?.toLocaleString() || 0}</span> },
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

  return (
    <div>
      <SettingsHeader title="Usage" description="Every request this billing cycle and the tokens it used." />
      <DataTable
        columns={columns}
        data={logs}
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
        <DialogContent className="max-w-xl w-[90%]">
          <DialogHeader>
            <DialogTitle>Usage Breakdown</DialogTitle>
          </DialogHeader>
          <div className="mt-4 border border-border rounded-lg overflow-hidden bg-card/50">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase">Model</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">Prompt</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">Completion</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {selectedGroup?.subLogs.map((log: any, idx: number) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{log.model?.name || "Unknown"}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">{log.billablePromptTokens?.toLocaleString() || 0}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">{log.billableCompletionTokens?.toLocaleString() || 0}</td>
                    <td className="px-4 py-3 text-right font-semibold text-sm text-foreground">{log.billableTotalTokens?.toLocaleString() || 0}</td>
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
