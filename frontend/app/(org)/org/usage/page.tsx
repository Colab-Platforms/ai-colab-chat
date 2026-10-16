"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DailyBars } from "@/components/org/daily-bars";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface Usage {
  totals: { tokens: number; requests: number };
  daily: { date: string; tokens: number }[];
  byMember: { userId: number; name: string; email: string; role: string; status: string; tokens: number; requests: number }[];
  byRole: { role: string; tokens: number; requests: number; members: number }[];
  byModel: { modelId: number; name: string; tokens: number; requests: number }[];
}

const fmt = (n: number) => n.toLocaleString("en-IN");

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-sunken">
      <div className="h-full rounded-full bg-primary" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

export default function OrgUsagePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await orgService.usage(days)).data?.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await orgService.exportUsage(days);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `usage-last-${days}-days.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export usage");
    } finally {
      setExporting(false);
    }
  };

  const maxMember = Math.max(1, ...(data?.byMember.map((m) => m.tokens) ?? [1]));
  const maxModel = Math.max(1, ...(data?.byModel.map((m) => m.tokens) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Tokens and requests per person, role and model. No conversation content.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-sunken p-0.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`h-8 rounded-md border px-3 text-[13px] font-medium ${
                  days === d ? "border-border bg-surface text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Tokens used</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{fmt(data.totals.tokens)}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Requests</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{fmt(data.totals.requests)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <DailyBars data={data.daily} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-sunken text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Member</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 text-right font-medium">Requests</th>
                    <th className="w-40 px-4 py-2.5 text-right font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMember.map((m) => (
                    <tr key={m.userId} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.role}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{fmt(m.requests)}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-right">{fmt(m.tokens)}</div>
                        <Bar value={m.tokens} max={maxMember} />
                      </td>
                    </tr>
                  ))}
                  {data.byMember.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        No members yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 text-xs text-muted-foreground">By role</div>
                <ul className="space-y-2 text-sm">
                  {data.byRole.map((r) => (
                    <li key={r.role} className="flex justify-between gap-2">
                      <span className="truncate">{r.role}</span>
                      <span className="text-muted-foreground">{fmt(r.tokens)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 text-xs text-muted-foreground">Top models</div>
                {data.byModel.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">No usage in this range.</div>
                ) : (
                  <ul className="space-y-3">
                    {data.byModel.map((m) => (
                      <li key={m.modelId}>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="truncate">{m.name}</span>
                          <span className="shrink-0 text-muted-foreground">{fmt(m.tokens)}</span>
                        </div>
                        <div className="mt-1">
                          <Bar value={m.tokens} max={maxModel} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
