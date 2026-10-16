"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { DailyBars } from "@/components/org/daily-bars";

interface Usage {
  member: {
    id: number;
    memberRole: string;
    status: string;
    tokenBonus: number;
    role: { id: number; name: string; monthlyTokens: number; monthlyVideoCredits: number; dailyTokenCap: number | null };
    user: { id: number; firstName: string; lastName: string; email: string };
  };
  wallet: { tokensRemaining: number; tokensUsed: number; refillsAt: string | null; videoCreditsRemaining: number };
  periodDays: number;
  totals: { tokens: number; requests: number };
  daily: { date: string; tokens: number }[];
  byModel: { modelId: number; name: string; tokens: number; requests: number }[];
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
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

export default function MemberUsagePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [tokens, setTokens] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await orgService.memberUsage(Number(id), days)).data?.data);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load usage"));
    } finally {
      setLoading(false);
    }
  }, [id, days]);

  useEffect(() => {
    load();
  }, [load]);

  const addTokens = async () => {
    const n = Number(tokens);
    if (!n || n < 1) return;
    setAdding(true);
    try {
      await orgService.topUpMember(Number(id), n);
      toast.success(`${fmt(n)} tokens added`);
      setTokens("");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to add tokens"));
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return <div className="py-20 text-center text-sm text-muted-foreground">Member not found.</div>;

  const { member, wallet } = data;
  const quota = member.role.monthlyTokens + member.tokenBonus;
  const maxModel = Math.max(1, ...data.byModel.map((m) => m.tokens));

  return (
    <div className="space-y-6">
      <Link href="/org/members" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Members
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {member.user.firstName} {member.user.lastName}
            <Badge className="border-0 bg-sunken text-foreground">{member.role.name}</Badge>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{member.user.email}</p>
        </div>
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tokens left this month" value={fmt(wallet.tokensRemaining)} sub={`of ${fmt(quota)}${member.tokenBonus ? ` (incl. ${fmt(member.tokenBonus)} extra)` : ""}`} />
        <Stat label={`Tokens used (${days}d)`} value={fmt(data.totals.tokens)} sub={`${fmt(data.totals.requests)} requests`} />
        <Stat label="Video credits left" value={fmt(wallet.videoCreditsRemaining)} sub={`${fmt(member.role.monthlyVideoCredits)} / month`} />
        <Stat label="Next refill" value={wallet.refillsAt ? new Date(wallet.refillsAt).toLocaleDateString() : " "} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-border bg-surface p-4">
          <DailyBars data={data.daily} />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 text-xs text-muted-foreground">Top models</div>
          {data.byModel.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No usage yet.</div>
          ) : (
            <ul className="space-y-3">
              {data.byModel.map((m) => (
                <li key={m.modelId}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-muted-foreground">{fmt(m.tokens)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(m.tokens / maxModel) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {member.status === "ACTIVE" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold">Add tokens</div>
          <p className="mt-0.5 text-xs text-muted-foreground">A one-off extra for this month. It doesn&apos;t carry over to the next refill.</p>
          <div className="mt-3 flex max-w-sm gap-2">
            <input
              type="number"
              min={1}
              value={tokens}
              onChange={(e) => setTokens(e.target.value)}
              placeholder="e.g. 100000"
              className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50"
            />
            <Button onClick={addTokens} disabled={adding || !Number(tokens)}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Admins see usage only conversations stay private to {member.user.firstName}.</p>
    </div>
  );
}
