"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, FileCode2, Loader2, Minus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { codeWorkspace } from "../store/codeWorkspaceStore";
import type { CodeTurnInfo } from "../types";

/** "Planning → Building project" timeline shown above the answer in the chat bubble. */
export function GenerationSteps({ turn }: { turn: CodeTurnInfo }) {
  const generating = turn.status === "generating";
  const [planOpen, setPlanOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(true);
  const plan = turn.plan.trim();
  const writing = turn.steps.find((s) => s.state === "writing");
  const planning = generating && turn.steps.length === 0;

  const openFile = (path: string, deleted: boolean) => {
    if (deleted) return;
    void codeWorkspace.open(turn.projectId, { focusPath: path });
  };

  return (
    <div className="mb-3 space-y-1.5 text-sm">
      {/* Planning */}
      <div>
        <button
          type="button"
          onClick={() => setPlanOpen((v) => !v)}
          className="flex items-center gap-1.5 font-medium text-foreground/80 hover:text-foreground"
          disabled={!plan}
        >
          {planning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          )}
          {planning ? "Planning…" : "Planned"}
          {plan && <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !planOpen && "-rotate-90")} />}
        </button>
        <AnimatePresence initial={false}>
          {plan && (planOpen || planning) && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-1 ml-5 overflow-hidden whitespace-pre-wrap border-l-2 border-violet-200 pl-3 font-sans text-xs leading-relaxed text-muted-foreground dark:border-violet-500/30"
            >
              {plan}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>

      {/* Files */}
      {turn.steps.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setFilesOpen((v) => !v)}
            className="flex items-center gap-1.5 font-medium text-foreground/80 hover:text-foreground"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            ) : (
              <FileCode2 className="h-3.5 w-3.5 text-violet-500" />
            )}
            {generating
              ? `Building ${turn.isNew ? "project" : "changes"}${writing ? "" : "…"}`
              : `${turn.isNew ? "Built" : "Changed"} ${turn.steps.length} file${turn.steps.length === 1 ? "" : "s"}`}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !filesOpen && "-rotate-90")} />
          </button>
          {filesOpen && (
            <ul className="mt-1 ml-[7px] space-y-0.5 border-l border-border pl-4">
              <AnimatePresence initial={false}>
                {turn.steps.map((step) => (
                  <motion.li
                    key={step.path}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      onClick={() => openFile(step.path, step.state === "deleted")}
                      className={cn(
                        "flex items-center gap-2 font-mono text-xs",
                        step.state === "deleted"
                          ? "cursor-default text-muted-foreground line-through"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {step.state === "writing" && <Loader2 className="h-3 w-3 animate-spin text-violet-500" />}
                      {step.state === "done" && <Check className="h-3 w-3 text-emerald-500" />}
                      {step.state === "deleted" && <Minus className="h-3 w-3" />}
                      {step.path}
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
