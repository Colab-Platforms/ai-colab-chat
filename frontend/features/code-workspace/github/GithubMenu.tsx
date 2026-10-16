"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  Github,
  GitCommitHorizontal,
  Loader2,
  Lock,
  Globe,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";
import { githubApi } from "./api";
import { GithubCommitDialog } from "./GithubCommitDialog";
import { GithubConnectDialog } from "./GithubConnectDialog";
import { readGithubError, type GithubLinkDto } from "./types";
import { useGithubStatus } from "./useGithubStatus";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

type Health = "synced" | "behind" | "syncing" | "error";

function healthOf(link: GithubLinkDto): Health {
  if (link.syncState === "SYNCING") return "syncing";
  if (link.syncState === "ERROR") return "error";
  return link.lastPushedVersion === link.currentVersion && !link.dirty ? "synced" : "behind";
}

const DOT: Record<Health, string> = {
  synced: "bg-emerald-500",
  behind: "bg-amber-500",
  syncing: "bg-sky-500",
  error: "bg-red-500",
};

const LABEL: Record<Health, string> = {
  synced: "Synced to GitHub",
  behind: "Changes not pushed",
  syncing: "Syncing…",
  error: "Sync failed",
};

/**
 * Header button for the GitHub integration. Renders nothing at all until the
 * server reports GitHub as configured — so a deployment without the App's
 * credentials shows no half-working button, and the rest of the panel is untouched.
 */
export function GithubMenu() {
  const project = useCodeWorkspace((s) => s.project);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const { status, refresh, pollSoon } = useGithubStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [busy, setBusy] = useState<null | "push" | "pull" | "unlink" | "disconnect">(null);

  if (!project || !status?.configured) return null;

  const link = status.link;
  const health = link ? healthOf(link) : null;
  const working = busy !== null || health === "syncing";

  async function run(kind: NonNullable<typeof busy>, task: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      const info = readGithubError(e, failure);
      toast.error(info.message);
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const push = (force = false) =>
    run(
      "push",
      async () => {
        const result = await githubApi.push(project.id, force);
        if (result.pushed) toast.success("Pushed to GitHub", { description: `${result.fileCount} files committed.` });
        else toast.info(result.skippedReason ?? "Nothing to push");
        pollSoon();
      },
      "Could not push to GitHub",
    );

  const pull = () => {
    if (!link) return;
    if (
      !window.confirm(
        `Replace this project's files with ${link.owner}/${link.repo}@${link.branch}? Your current files are kept as a version first, so you can restore them.`,
      )
    ) {
      return;
    }
    void run(
      "pull",
      async () => {
        const result = await githubApi.pull(project.id);
        await codeWorkspace.reloadFromServer();
        const skipped = result.skipped.length;
        toast.success(`Pulled ${result.fileCount} files from GitHub`, {
          description: skipped ? `${skipped} file${skipped === 1 ? "" : "s"} skipped (binary, too large, or not allowed).` : undefined,
        });
      },
      "Could not pull from GitHub",
    );
  };

  const unlink = () => {
    if (!link) return;
    if (
      !window.confirm(
        `Disconnect ${link.owner}/${link.repo}? Your files and version history stay here, and the repository on GitHub is not deleted.`,
      )
    ) {
      return;
    }
    void run(
      "unlink",
      async () => {
        await githubApi.unlinkProject(project.id);
        toast.success("Repository disconnected");
      },
      "Could not disconnect the repository",
    );
  };

  const disconnectAccount = () => {
    if (
      !window.confirm(
        "Disconnect your GitHub account from every project? Your files and versions stay here, and nothing on GitHub is deleted.",
      )
    ) {
      return;
    }
    void run(
      "disconnect",
      async () => {
        await githubApi.disconnect();
        toast.success("GitHub account disconnected");
      },
      "Could not disconnect GitHub",
    );
  };

  const toggleAutoPush = (next: boolean) =>
    run(
      "push",
      async () => {
        await githubApi.setAutoPush(project.id, next);
      },
      "Could not update the setting",
    );

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 shrink-0 p-0"
      title={link ? `${LABEL[health!]} — ${link.owner}/${link.repo}` : "Connect to GitHub"}
      onClick={link ? undefined : () => setDialogOpen(true)}
    >
      {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
      {link && health && !working && (
        <span className={cn("absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-background", DOT[health])} />
      )}
    </Button>
  );

  return (
    <>
      {link && health ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-xs">GitHub status</DropdownMenuLabel>
            <div className="flex items-start gap-2.5 px-2 pb-2 pt-1">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[health])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{LABEL[health]}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {link.isPrivate ? <Lock className="h-3 w-3 shrink-0" /> : <Globe className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{link.owner}/{link.repo}</span>
                  <span className="shrink-0">· {link.branch}</span>
                </p>
                {health !== "syncing" && (
                  <p className="text-[11px] text-muted-foreground">
                    Last synced {timeAgo(link.lastSyncedAt)}
                    {link.lastPushedVersion !== null && ` · v${link.lastPushedVersion}`}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                title="Push now"
                disabled={working || isGenerating}
                onClick={() => void push()}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", working && "animate-spin")} />
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" title="Open on GitHub">
                <a href={link.htmlUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>

            {health === "error" && link.lastError && (
              <div className="mx-2 mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{link.lastError.replace("[remote-ahead]", "").trim()}</span>
                </p>
                {link.needsPull && (
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={working || isGenerating} onClick={pull}>
                      Pull
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" disabled={working || isGenerating} onClick={() => void push(true)}>
                      Overwrite
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={working || isGenerating} onClick={() => setCommitOpen(true)}>
              <GitCommitHorizontal className="h-3.5 w-3.5" /> Commit with a message…
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={working || isGenerating} onClick={() => void push()}>
              <CloudUpload className="h-3.5 w-3.5" /> Push now (automatic message)
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={working || isGenerating} onClick={pull}>
              <CloudDownload className="h-3.5 w-3.5" /> Pull from GitHub
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* A switch rather than a tick: the on/off state is obvious at a glance. */}
            <DropdownMenuItem
              className="cursor-pointer items-start gap-3 text-xs"
              disabled={working}
              onSelect={(e) => {
                e.preventDefault(); // keep the menu open so the change is visible
                void toggleAutoPush(!link.autoPush);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Auto-commit AI changes</span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {link.autoPush
                    ? "On — every AI edit is committed for you. Your own edits use the buttons above."
                    : "Off — nothing is committed until you commit or push."}
                </span>
              </span>
              <Switch checked={link.autoPush} className="pointer-events-none mt-0.5 shrink-0" tabIndex={-1} aria-label="Auto-commit AI changes" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={working} onClick={unlink}>
              <Unlink className="h-3.5 w-3.5" /> Disconnect this repository
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-muted-foreground" disabled={working} onClick={disconnectAccount}>
              Disconnect GitHub account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        trigger
      )}

      {link && (
        <GithubCommitDialog
          open={commitOpen}
          onOpenChange={setCommitOpen}
          projectId={project.id}
          link={link}
          onCommitted={() => {
            pollSoon();
            void refresh();
          }}
        />
      )}

      <GithubConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        status={status}
        projectId={project.id}
        projectTitle={project.title}
        onConnected={() => void refresh()}
        onLinked={() => {
          pollSoon();
          void refresh();
        }}
      />
    </>
  );
}
