"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { DailyBars } from "@/components/org/daily-bars";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface Overview {
  organization: { name: string; status: string };
  subscription: { status: string; seatsPurchased: number; currentPeriodEnd: string | null; billingCycle: string } | null;
  seats: { purchased: number; inUse: number };
  members: { active: number; suspended: number; active7d: number };
  dueBills: number;
  totals: { tokens: number; requests: number };
  daily: { date: string; tokens: number }[];
  topMembers: { userId: number; name: string; email: string; role: string; tokens: number; requests: number }[];
  byRole: { role: string; tokens: number; requests: number; members: number }[];
}

const fmt = (n: number) => n.toLocaleString("en-IN");

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function OrgOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgService
      .overview()
      .then((r) => setData(r.data?.data))
      .catch((e) => toast.error(e?.response?.data?.message || "Failed to load overview"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const maxRole = Math.max(1, ...data.byRole.map((r) => r.tokens));
  const renews = data.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString() : " ";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">The last 30 days across your organization. Usage only conversations stay private.</p>
      </div>

      {data.dueBills > 0 && (
        <div className="rounded-xl border border-border bg-accent-soft p-4 text-sm text-accent-ink">
          You have {data.dueBills} unpaid invoice{data.dueBills === 1 ? "" : "s"}.{" "}
          <Link href="/org/billing" className="font-medium underline">
            View billing
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Seats in use" value={`${data.seats.inUse} / ${data.seats.purchased}`} sub={`${data.members.suspended} suspended`} />
        <Stat label="Active this week" value={fmt(data.members.active7d)} sub={`of ${fmt(data.members.active)} active members`} />
        <Stat label="Tokens used (30d)" value={fmt(data.totals.tokens)} sub={`${fmt(data.totals.requests)} requests`} />
        <Stat label="Plan" value={data.subscription?.status ?? " "} sub={`Period ends ${renews}`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <DailyBars data={data.daily} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Top members</span>
            <Link href="/org/usage" className="hover:text-foreground">
              Full usage
            </Link>
          </div>
          {data.topMembers.filter((m) => m.tokens > 0).length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No usage yet.</div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.topMembers
                .filter((m) => m.tokens > 0)
                .map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.role}</div>
                    </div>
                    <div className="shrink-0 text-muted-foreground">{fmt(m.tokens)}</div>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 text-xs text-muted-foreground">Usage by role</div>
          {data.byRole.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No roles yet.</div>
          ) : (
            <ul className="space-y-3">
              {data.byRole.map((r) => (
                <li key={r.role}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">
                      {r.role} <span className="text-xs text-muted-foreground">· {r.members} member{r.members === 1 ? "" : "s"}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{fmt(r.tokens)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(r.tokens / maxRole) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
