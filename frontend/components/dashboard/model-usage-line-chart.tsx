"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DailyModelUsageRow = {
  day: string;
  modelName: string;
  tokens: number;
};

const LINE_COLORS = [
  "oklch(0.55 0.2 264)",
  "oklch(0.55 0.18 145)",
  "oklch(0.7 0.16 75)",
  "oklch(0.55 0.2 25)",
  "oklch(0.55 0.14 310)",
  "oklch(0.5 0.12 220)",
  "oklch(0.6 0.15 350)",
  "oklch(0.55 0.1 200)",
];

function buildSeries(rows: DailyModelUsageRow[], days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const dateKeys: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dateKeys.push(d.toISOString().slice(0, 10));
  }

  const totalsByModel = new Map<string, number>();
  for (const r of rows) {
    totalsByModel.set(r.modelName, (totalsByModel.get(r.modelName) ?? 0) + r.tokens);
  }

  const modelNames = [...totalsByModel.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const byDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const day = r.day.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Map());
    const m = byDay.get(day)!;
    m.set(r.modelName, (m.get(r.modelName) ?? 0) + r.tokens);
  }

  const data = dateKeys.map((dateStr) => {
    const row: Record<string, string | number> = {
      label: new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString(
        undefined,
        { month: "short", day: "numeric" },
      ),
    };
    const dayMap = byDay.get(dateStr);
    for (const name of modelNames) {
      row[name] = dayMap?.get(name) ?? 0;
    }
    return row;
  });

  return { data, modelNames };
}

function formatTick(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

type TooltipPayload = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
};

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;

  const filtered = payload.filter(
    (p) => typeof p.value === "number" && p.value > 0,
  );
  if (!filtered.length) return null;

  return (
    <div
      className="pointer-events-none max-w-[min(100vw-2rem,20rem)] rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-card-foreground shadow-xl md:max-w-[18rem]"
      style={{ zIndex: 9999 }}
    >
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto overscroll-contain md:max-h-64">
        {filtered.map((entry) => (
          <li
            key={String(entry.dataKey ?? entry.name)}
            className="flex items-start justify-between gap-3"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="break-words">{entry.name}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {Number(entry.value).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ModelUsageLineChart({
  rows,
  days,
}: {
  rows: DailyModelUsageRow[];
  days: number;
}) {
  const { data, modelNames } = useMemo(
    () => buildSeries(rows, days),
    [rows, days],
  );
  const [activeModels, setActiveModels] = useState<string[]>(modelNames);

  useEffect(() => {
    setActiveModels(modelNames);
  }, [modelNames]);

  const handleLegendClick = (name: string) => {
    setActiveModels((current) => {
      const isActive = current.includes(name);

      // Prevent turning everything off – always keep at least one model visible
      if (isActive && current.length === 1) {
        return current;
      }

      return isActive
        ? current.filter((n) => n !== name)
        : [...current, name];
    });
  };

  if (!modelNames.length) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        No model usage in this window yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Taller plot on mobile - legend is outside so height applies only to the chart */}
      <div className="relative z-0 h-[min(20rem,85svh)] min-h-[17.5rem] w-full sm:min-h-[18rem] md:h-[22rem] md:min-h-[22rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 6, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              tickFormatter={formatTick}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "oklch(0.5 0.02 280 / 0.35)", strokeWidth: 1 }}
              wrapperStyle={{
                zIndex: 9999,
                outline: "none",
              }}
              content={<ChartTooltip />}
            />
            {modelNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                hide={!activeModels.includes(name)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="relative z-10 flex flex-wrap gap-2 border-t border-border/40 pt-3 text-xs">
        {modelNames.map((name, i) => {
          const active = activeModels.includes(name);
          const color = LINE_COLORS[i % LINE_COLORS.length];
          return (
            <button
              key={name}
              type="button"
              onClick={() => handleLegendClick(name)}
              className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-1.5 text-left text-[11px] transition sm:py-1 ${
                active
                  ? "border-border/60 bg-background text-foreground shadow-sm"
                  : "border-transparent bg-muted/70 text-muted-foreground line-through opacity-75"
              }`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="break-words leading-snug">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
