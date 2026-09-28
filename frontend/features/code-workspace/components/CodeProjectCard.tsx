"use client";

import { useState } from "react";
import { AlertTriangle, Code2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { downloadProjectZip, downloadProjectZipById } from "../lib/download";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";
import type { CodeTurnInfo } from "../types";

const FRAMEWORK_LABEL: Record<string, string> = {
  react: "React",
  vue: "Vue",
  vanilla: "JavaScript",
  static: "HTML/CSS/JS",
  node: "Node.js",
  python: "Python",
  other: "Project",
};

/** The card under a code turn's answer — reopens the panel, downloads the ZIP. */
export function CodeProjectCard({ turn }: { turn: CodeTurnInfo }) {
  const [zipping, setZipping] = useState(false);
  const panelShowsThis = useCodeWorkspace((s) => s.isOpen && s.project?.id === turn.projectId);
  const generating = turn.status === "generating";
  const writing = turn.steps.find((s) => s.state === "writing")?.path;
  const changed = turn.steps.filter((s) => s.state !== "deleted").length;

  const download = async () => {
    setZipping(true);
    try {
      const s = codeWorkspace.getState();
      if (s.project?.id === turn.projectId && !s.isGenerating) {
        await downloadProjectZip(s.project.title, codeWorkspace.getAllFiles());
      } else {
        await downloadProjectZipById(turn.projectId);
      }
    } catch {
      toast.error("Could not download the project");
    } finally {
      setZipping(false);
    }
  };

  // An edit turn where the model only replied in chat (e.g. asked a question) changed nothing.
  if (!generating && !turn.isNew && turn.steps.length === 0) return null;

  if (turn.status === "failed") {
    return (
      <div className="mt-3 flex max-w-md items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        The model answered in chat instead of writing project files. Try again with the Code pill on.
      </div>
    );
  }

  return (
    <div className="mt-3 flex max-w-md items-center gap-3 rounded-xl border border-border/70 bg-background/70 p-2.5 pr-3 shadow-sm">
      <button
        type="button"
        onClick={() => void codeWorkspace.open(turn.projectId)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 transition-colors hover:bg-violet-200 dark:bg-violet-500/20 dark:text-violet-200"
        title="Open in the code panel"
      >
        {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Code2 className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{turn.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {generating
            ? writing
              ? `Writing ${writing}…`
              : "Planning…"
            : `${FRAMEWORK_LABEL[turn.framework] ?? turn.framework} · ${changed} file${changed === 1 ? "" : "s"} ${
                turn.isNew ? "" : "changed "
              }${turn.version ? `· v${turn.version}` : ""}`}
        </div>
      </div>
      {!panelShowsThis && (
        <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={() => void codeWorkspace.open(turn.projectId)}>
          Open
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 gap-1 px-2 text-xs"
        disabled={generating || zipping}
        onClick={() => void download()}
        title="Download project as .zip"
      >
        {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        ZIP
      </Button>
    </div>
  );
}
