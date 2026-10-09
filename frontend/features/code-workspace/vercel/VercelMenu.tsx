"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FileCode2,
  Github,
  Globe,
  Loader2,
  RefreshCw,
  ScrollText,
  Settings2,
  Triangle,
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
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useCodeWorkspace } from "../store/codeWorkspaceStore";
import { vercelApi } from "./api";
import { VercelPublishDialog, type PublishIntent } from "./VercelPublishDialog";
import { readVercelError, TERMINAL_STATES, type VercelLinkDto } from "./types";
import { useVercelStatus } from "./useVercelStatus";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

type Health = "live" | "stale" | "deploying" | "error";

function healthOf(link: VercelLinkDto, deploying: boolean): Health {
  if (deploying) return "deploying";
  if (link.lastDeployState === "ERROR") return "error";
  if (!TERMINAL_STATES.includes(link.lastDeployState)) return "deploying";
  // A files deploy always records the version it shipped. A git deploy records the
  // repo's pushed version when this project mirrors that repo; without a mirror we
  // can't tell what the repo holds, so don't claim it is behind.
  const behind =
    link.lastDeployedVersion === null ? link.source === "FILES" : link.lastDeployedVersion < link.currentVersion;
  return behind || link.dirty ? "stale" : "live";
}

const DOT: Record<Health, string> = {
  live: "bg-emerald-500",
  stale: "bg-amber-500",
  deploying: "bg-sky-500",
  error: "bg-red-500",
};

const LABEL: Record<Health, string> = {
  live: "Live on Vercel",
  stale: "Changes not published",
  deploying: "Deploying…",
  error: "Last deploy failed",
};

/**
 * Header button for the Vercel integration. Renders nothing at all until the
 * server reports Vercel as configured — so a deployment without the
 * integration's credentials shows no half-working button.
 *
 * Unlike GithubMenu's icon-only trigger this one carries a label while the
 * project is unpublished: an unlabelled triangle next to the GitHub mark reads
 * as decoration, and "Publish" is the one action here a user looks for by name.
 * Once published it collapses to the icon + status dot, like its neighbours.
 */
export function VercelMenu() {
  const project = useCodeWorkspace((s) => s.project);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const { status, refresh, pollSoon } = useVercelStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [intent, setIntent] = useState<PublishIntent>({ kind: "publish" });
  const [busy, setBusy] = useState<null | "unlink" | "disconnect">(null);

  if (!project || !status?.configured) return null;

  const link = status.link;
  const active = status.activeDeployment;
  const deploying = !!active;
  const health = link ? healthOf(link, deploying) : null;

  function openDialog(next: PublishIntent) {
    setIntent(next);
    setDialogOpen(true);
  }

  async function run(kind: NonNullable<typeof busy>, task: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      toast.error(readVercelError(e, failure).message);
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const unlink = () => {
    if (!link) return;
    if (
      !window.confirm(
        `Unpublish this project from "${link.vercelProjectName}"? The live site and the Vercel project are NOT deleted — only the link from this workspace. Delete the project on Vercel to take the site down.`,
      )
    ) {
      return;
    }
    void run(
      "unlink",
      async () => {
        await vercelApi.unlinkProject(project.id);
        toast.success("Project unpublished", { description: "The site is still live on Vercel." });
      },
      "Could not unpublish the project",
    );
  };

  const disconnectAccount = () => {
    if (
      !window.confirm(
        "Disconnect your Vercel account from every project? Your files, versions and every deployed site stay exactly as they are.",
      )
    ) {
      return;
    }
    void run(
      "disconnect",
      async () => {
        await vercelApi.disconnect();
        toast.success("Vercel account disconnected");
      },
      "Could not disconnect Vercel",
    );
  };

  const copyUrl = (url: string) => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success("URL copied"))
      .catch(() => toast.error("Could not copy the URL"));
  };

  const redeploy = () => {
    openDialog({ kind: "redeploy" });
    pollSoon();
  };

  const viewLogs = () => {
    const id = active?.deploymentId ?? link?.lastDeploymentId;
    if (!id) return;
    openDialog({ kind: "attach", deploymentId: id });
  };

  // Unpublished (or not connected yet): a labelled button, no dropdown.
  if (!link || !health) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs"
          title={isGenerating ? "Available once the AI finishes writing" : "Publish this project to Vercel"}
          disabled={isGenerating || busy !== null}
          onClick={() => openDialog({ kind: "publish" })}
        >
          <Triangle className="h-3 w-3 fill-current" /> Publish
        </Button>
        <VercelPublishDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          intent={intent}
          status={status}
          projectId={project.id}
          onChanged={() => void refresh()}
        />
      </>
    );
  }

  const url = link.productionUrl ?? link.lastDeploymentUrl;
  const working = busy !== null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 w-8 shrink-0 p-0"
            title={`${LABEL[health]} — ${link.vercelProjectName}`}
          >
            {deploying || working ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Triangle className="h-3.5 w-3.5 fill-current" />
                <span className={cn("absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-background", DOT[health])} />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-xs">Deployment status</DropdownMenuLabel>
          <div className="flex items-start gap-2.5 px-2 pb-2 pt-1">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[health])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{LABEL[health]}</p>
              <p className="truncate text-xs text-muted-foreground">{link.vercelProjectName}</p>
              {!deploying && (
                <p className="text-[11px] text-muted-foreground">
                  Last deployed {timeAgo(link.lastDeployedAt)}
                  {link.lastDeployedVersion !== null && ` · v${link.lastDeployedVersion}`}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              title="Redeploy"
              disabled={deploying || working || isGenerating}
              onClick={redeploy}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", deploying && "animate-spin")} />
            </Button>
            {url && (
              <Button asChild variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" title="Open website">
                <a href={url} target="_blank" rel="noopener noreferrer"><Globe className="h-3.5 w-3.5" /></a>
              </Button>
            )}
          </div>

          {/* Source: the GitHub repo Vercel builds, or the workspace itself. */}
          <div className="flex items-start gap-2 px-2 pb-2 text-xs">
            {link.source === "GIT" && link.gitOwner ? (
              <>
                <Github className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {link.gitOwner}/{link.gitRepo}
                    {link.gitBranch && <span className="text-muted-foreground"> · {link.gitBranch}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Pushes to {link.gitBranch ?? "this branch"} redeploy automatically.</p>
                </div>
              </>
            ) : (
              <>
                <FileCode2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 text-muted-foreground">No GitHub repo — published from this workspace.</p>
              </>
            )}
          </div>

          {url && (
            <div className="flex items-center gap-1 px-2 pb-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-mono text-[11px] text-violet-600 underline hover:no-underline dark:text-violet-300"
              >
                {url.replace(/^https:\/\//, "")}
              </a>
              <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" title="Copy URL" onClick={() => copyUrl(url)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          {health === "error" && link.lastError && (
            <div className="mx-2 mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1">{link.lastError}</span>
              </p>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={viewLogs} disabled={!link.lastDeploymentId}>
                  View logs
                </Button>
                <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={working || isGenerating} onClick={redeploy}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={deploying || working || isGenerating} onClick={redeploy}>
            <RefreshCw className="h-3.5 w-3.5" /> Redeploy
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={!active && !link.lastDeploymentId} onClick={viewLogs}>
            <ScrollText className="h-3.5 w-3.5" /> {deploying ? "View live logs" : "View last logs"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-xs"
            disabled={deploying || working || isGenerating}
            onClick={() => openDialog({ kind: "settings" })}
          >
            <Settings2 className="h-3.5 w-3.5" /> Deployment settings…
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer gap-2 text-xs">
            <a href={link.dashboardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open Vercel dashboard
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" disabled={working} onClick={unlink}>
            <Unlink className="h-3.5 w-3.5" /> Unpublish this project
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-muted-foreground" disabled={working} onClick={disconnectAccount}>
            Disconnect Vercel account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VercelPublishDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        intent={intent}
        status={status}
        projectId={project.id}
        onChanged={() => void refresh()}
      />
    </>
  );
}
