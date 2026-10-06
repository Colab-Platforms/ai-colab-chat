"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export interface RunStep {
  step: string;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
}

/** The content agent's live activity: one row per pipeline step. */
export function ContentRunTimeline({ steps }: { steps: RunStep[] }) {
  if (!steps.length) return null;
  return (
    <ul className="mb-3 space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
      {steps.map((s) => (
        <li key={s.step} className="flex items-start gap-2">
          {s.status === "running" ? (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : s.status === "failed" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          )}
          <span className="min-w-0">
            <span className="font-medium">{s.label}</span>
            {s.detail && (
              <span className="text-muted-foreground"> - {s.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
