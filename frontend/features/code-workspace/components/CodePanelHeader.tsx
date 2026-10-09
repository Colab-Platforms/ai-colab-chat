"use client";

import { useState } from "react";
import { Check, Code2, Download, ExternalLink, Eye, FileDown, History, Loader2, Package, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { codeWorkspaceApi } from "../api";
import { GithubMenu } from "../github/GithubMenu";
import { VercelMenu } from "../vercel/VercelMenu";
import { downloadFile, downloadProjectZip } from "../lib/download";
import { writePreviewHandoff } from "../lib/previewHandoff";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";
import type { CodeVersionDto } from "../types";

const SOURCE_LABEL: Record<CodeVersionDto["source"], string> = {
  AI: "AI",
  USER: "Your edits",
  RESTORE: "Restored",
  GITHUB: "From GitHub",
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function VersionsMenu() {
  const project = useCodeWorkspace((s) => s.project);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const [versions, setVersions] = useState<CodeVersionDto[] | null>(null);

  if (!project) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        setVersions(null);
        codeWorkspaceApi
          .listVersions(project.id)
          .then(setVersions)
          .catch(() => setVersions([]));
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs"
          disabled={isGenerating || project.currentVersion === 0}
          title="Version history"
        >
          <History className="h-3.5 w-3.5" />v{project.currentVersion}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">Version history</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {versions === null && (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )}
        {versions?.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No versions yet</div>}
        {versions?.map((v) => {
          const current = v.version === project.currentVersion;
          return (
            <DropdownMenuItem
              key={v.version}
              disabled={current}
              className="flex cursor-pointer items-center gap-2 text-xs"
              onClick={() => {
                if (window.confirm(`Restore version ${v.version}? Your current files are kept as a new version first.`)) {
                  void codeWorkspace.restoreVersion(v.version);
                }
              }}
            >
              <span className="w-7 font-mono font-medium">v{v.version}</span>
              <span className="flex-1 truncate">
                {SOURCE_LABEL[v.source]} · {v.fileCount} files
              </span>
              <span className="text-muted-foreground">{current ? <Check className="h-3 w-3" /> : timeAgo(v.createdAt)}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CodePanelHeader({
  onClose,
  onReloadPreview,
  forceVite,
}: {
  onClose: () => void;
  /** Fully recreates the Sandpack bundler — the only recovery from a failed preview handshake. */
  onReloadPreview: () => void;
  /** The panel's "Run with Vite" choice, carried over to the new tab. */
  forceVite: boolean;
}) {
  const project = useCodeWorkspace((s) => s.project);
  const view = useCodeWorkspace((s) => s.view);
  const activePath = useCodeWorkspace((s) => s.activePath);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  if (!project) return null;

  const previewDisabled = !project.previewable && !isGenerating;

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
        <Code2 className="h-4 w-4" />
      </div>
      {titleDraft === null ? (
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-semibold hover:underline"
          title="Rename project"
          onClick={() => setTitleDraft(project.title)}
        >
          {project.title}
        </button>
      ) : (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            void codeWorkspace.renameProject(titleDraft);
            setTitleDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setTitleDraft(null);
          }}
          className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-sm font-semibold outline-none focus:border-violet-400"
        />
      )}

      <div className="flex-1" />

      {/* Code | Preview */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-border/40 bg-muted/60 p-0.5">
        {(
          [
            { value: "code", label: "Code", icon: Code2, disabled: false },
            { value: "preview", label: "Preview", icon: Eye, disabled: previewDisabled },
          ] as const
        ).map(({ value, label, icon: Icon, disabled }) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            title={disabled ? "Preview is available for browser (web) projects" : undefined}
            onClick={() => codeWorkspace.setView(value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all",
              view === value
                ? "bg-white text-foreground shadow dark:bg-background"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {view === "preview" && !previewDisabled && (
        <>
          {isGenerating ? (
            <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" disabled title="Available once the AI finishes writing">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : (
            // Our own full-screen route, not the panel's *.nodebox URL: that dev
            // server lives inside this page's in-browser VM and can't be
            // reached from another tab. A real <a target="_blank"> (not
            // window.open) so popup blockers treat it as a normal link click.
            <Button asChild variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" title="Open in a new tab">
              <a
                href={`/code-preview/${project.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  writePreviewHandoff(project.id, {
                    title: project.title,
                    framework: project.framework,
                    files: codeWorkspace.getAllFiles(),
                    forceVite,
                  })
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            title="Reload preview (use this if the preview shows an error)"
            onClick={onReloadPreview}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </>
      )}

      <VersionsMenu />

      <GithubMenu />

      <VercelMenu />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" title="Download" disabled={isGenerating}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-xs"
            onClick={() => {
              downloadProjectZip(project.title, codeWorkspace.getAllFiles()).catch(() =>
                toast.error("Could not create the ZIP"),
              );
            }}
          >
            <Package className="h-3.5 w-3.5" /> Download project (.zip)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-xs"
            disabled={!activePath}
            onClick={() => activePath && downloadFile(activePath, codeWorkspace.getContent(activePath))}
          >
            <FileDown className="h-3.5 w-3.5" />
            <span className="truncate">Download {activePath?.split("/").pop() ?? "file"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" title="Close" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
