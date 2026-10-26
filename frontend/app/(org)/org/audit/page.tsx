"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface Entry {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string; email: string | null };
}
interface AuditPage {
  page: number;
  total: number;
  totalPages: number;
  actions: string[];
  data: Entry[];
}

const label = (a: string) => a.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** One short human line from an entry's metadata no raw JSON in the UI. */
function detail(e: Entry): string {
  const m = e.meta ?? {};
  const bits: string[] = [];
  if (typeof m.email === "string") bits.push(m.email);
  if (typeof m.name === "string") bits.push(m.name);
  if (typeof m.tokens === "number") bits.push(`${m.tokens.toLocaleString("en-IN")} tokens`);
  if (typeof m.seats === "number") bits.push(`${m.seats} seats`);
  if (typeof m.to === "number") bits.push(`${m.from ?? "?"} → ${m.to} seats`);
  if (Array.isArray(m.changed)) bits.push(`changed: ${(m.changed as string[]).join(", ")}`);
  if (typeof m.status === "string") bits.push(String(m.status).toLowerCase());
  if (typeof m.reference === "string") bits.push(`ref ${m.reference}`);
  return bits.join(" · ");
}

export default function OrgAuditPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (action) params.action = action;
      setData((await orgService.audit(params)).data?.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load the audit log");
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Changes made by admins: invitations, roles, seats, quotas and billing.</p>
        </div>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary/50"
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {data?.actions.map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Who</th>
                <th className="px-4 py-2.5 font-medium">What</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{e.actor.name}</div>
                    {e.actor.email && <div className="text-xs text-muted-foreground">{e.actor.email}</div>}
                  </td>
                  <td className="px-4 py-2.5">{label(e.action)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{detail(e)}</td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} entries</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {data.totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
