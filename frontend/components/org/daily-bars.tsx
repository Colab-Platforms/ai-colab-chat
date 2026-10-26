"use client";

import { useState } from "react";

const fmt = (n: number) => n.toLocaleString("en-IN");
const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** One series (tokens per day): single hue, thin rounded bars on a shared baseline, hover for the exact value. */
export function DailyBars({ data, label = "Tokens per day" }: { data: { date: string; tokens: number }[]; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.tokens));
  const h = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 h-5 text-xs text-muted-foreground" aria-live="polite">
        {h ? (
          <>
            <span className="font-medium text-foreground">{shortDate(h.date)}</span> · {fmt(h.tokens)} tokens
          </>
        ) : (
          label
        )}
      </div>
      <div className="flex h-36 items-end gap-[3px] border-b border-border" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.date}
            className="group flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={0}
            role="img"
            aria-label={`${shortDate(d.date)}: ${fmt(d.tokens)} tokens`}
          >
            <div
              className={`w-full rounded-t-[4px] bg-primary transition-opacity ${hover != null && hover !== i ? "opacity-40" : ""}`}
              style={{ height: `${d.tokens ? Math.max(3, (d.tokens / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint">
        <span>{shortDate(data[0].date)}</span>
        <span>{shortDate(data[data.length - 1].date)}</span>
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full max-w-xs">
          <tbody>
            {data
              .filter((d) => d.tokens)
              .map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-1">{shortDate(d.date)}</td>
                  <td className="py-1 text-right">{fmt(d.tokens)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

