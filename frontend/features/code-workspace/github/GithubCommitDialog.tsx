"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, GitCommitHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { githubApi } from "./api";
import { readGithubError, type GithubLinkDto } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  link: GithubLinkDto;
  /** Called after a commit, so the header refreshes and shows the new sync state. */
  onCommitted: () => void;
}

const MAX_LENGTH = 1000;

/** What is waiting to be committed, in words the user can act on. */
function describePending(link: GithubLinkDto): string {
  const versionsBehind = link.lastPushedVersion === null ? link.currentVersion : link.currentVersion - link.lastPushedVersion;
  const parts: string[] = [];
  if (versionsBehind > 0) parts.push(`${versionsBehind} new version${versionsBehind === 1 ? "" : "s"} (v${link.currentVersion})`);
  if (link.dirty) parts.push("unsaved editor edits");
  return parts.length ? parts.join(" + ") : "";
}

/**
 * Manual commit: the user writes the message and commits when they choose.
 * Independent of auto-commit — that toggle only decides whether AI turns also
 * commit on their own. Everything not yet on GitHub goes into this one commit.
 */
export function GithubCommitDialog({ open, onOpenChange, projectId, link, onCommitted }: Props) {
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** GitHub has commits this project lacks — committing now would overwrite them. */
  const [remoteAhead, setRemoteAhead] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setError(null);
    setRemoteAhead(false);
  }, [open]);

  const pending = describePending(link);

  async function commit(force = false) {
    setWorking(true);
    setError(null);
    try {
      const result = await githubApi.push(projectId, force, message.trim());
      if (result.pushed) {
        toast.success("Committed to GitHub", {
          description: `${result.fileCount} files · ${link.owner}/${link.repo}@${link.branch}`,
        });
      } else {
        toast.info(result.skippedReason ?? "Nothing to commit");
      }
      onOpenChange(false);
      onCommitted();
    } catch (e) {
      const info = readGithubError(e, "Could not commit to GitHub");
      setRemoteAhead(info.code === "REMOTE_AHEAD");
      setError(info.message.replace("[remote-ahead]", "").trim());
      onCommitted(); // the failure is recorded on the link; refresh the header
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommitHorizontal className="h-4 w-4" /> Commit to GitHub
          </DialogTitle>
          <DialogDescription>
            {link.owner}/{link.repo} · {link.branch}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
          {pending ? (
            <>
              <span className="font-medium">Ready to commit:</span> {pending}. They go into a single commit.
            </>
          ) : (
            <span className="text-muted-foreground">
              Nothing new since the last push. Committing again will do nothing unless files changed.
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="gh-commit-message" className="text-xs font-medium">
            Commit message <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="gh-commit-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={4}
            disabled={working}
            placeholder="e.g. Add contact form and fix mobile navbar"
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !working) void commit();
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Leave empty for an automatic message (version, what the AI changed, file list). First line is the title.
          </p>
        </div>

        {error && (
          <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
            {remoteAhead && (
              <div className="space-y-1.5 pl-5">
                <p>To keep those GitHub changes, close this and use &quot;Pull from GitHub&quot; first.</p>
                <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={working} onClick={() => void commit(true)}>
                  Overwrite GitHub with my version
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
            Cancel
          </Button>
          <Button onClick={() => void commit()} disabled={working}>
            {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {working ? "Committing…" : "Commit & push"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
