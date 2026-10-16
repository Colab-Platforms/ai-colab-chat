"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyModelUsageRow } from "./model-usage-line-chart";

/** Same palette as the line chart so a model keeps its colour across charts. */
const COLORS = [
  "oklch(0.55 0.2 264)",
  "oklch(0.55 0.18 145)",
  "oklch(0.7 0.16 75)",
  "oklch(0.55 0.2 25)",
  "oklch(0.55 0.14 310)",
  "oklch(0.5 0.12 220)",
  "oklch(0.6 0.15 350)",
  "oklch(0.55 0.1 200)",
];

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
};

function modelTotals(rows: DailyModelUsageRow[]) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.modelName, (totals.get(r.modelName) ?? 0) + r.tokens);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/** Tokens per day, stacked by model. */
export function DailyTokensBarChart({ rows, days }: { rows: DailyModelUsageRow[]; days: number }) {
  const { data, models } = useMemo(() => {
    const models = modelTotals(rows).map(([name]) => name);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const keys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(d.toISOString().slice(0, 10));
    }
    const byDay = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const k = r.day.slice(0, 10);
      const o = byDay.get(k) ?? {};
      o[r.modelName] = (o[r.modelName] ?? 0) + r.tokens;
      byDay.set(k, o);
    }
    const data = keys.map((k) => ({
      label: new Date(`${k}T12:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      ...(byDay.get(k) ?? {}),
    }));
    return { data, models };
  }, [rows, days]);

  if (!models.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No usage in this window yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={40} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "oklch(0.5 0.02 280 / 0.08)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = payload.filter((p) => Number(p.value) > 0);
              if (!items.length) return null;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
                  <p className="mb-1.5 font-semibold">{label}</p>
                  {items.map((p) => (
                    <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="tabular-nums">{Number(p.value).toLocaleString()}</span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {models.map((name, i) => (
            <Bar key={name} dataKey={name} name={name} stackId="t" fill={COLORS[i % COLORS.length]} radius={i === models.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked list of models with their share of total tokens. */
export function ModelShareList({ rows }: { rows: DailyModelUsageRow[] }) {
  const totals = useMemo(() => modelTotals(rows), [rows]);
  const sum = totals.reduce((a, [, n]) => a + n, 0);

  if (!totals.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No usage in this window yet.</p>;
  }

  return (
    <ul className="space-y-4">
      {totals.map(([name, tokens], i) => {
        const pct = sum > 0 ? (tokens / sum) * 100 : 0;
        return (
          <li key={name}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="truncate font-medium">{name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="tabular-nums">{tokens.toLocaleString()}</span>
                <span className="w-12 text-right text-xs tabular-nums text-faint">{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: COLORS[i % COLORS.length] }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
