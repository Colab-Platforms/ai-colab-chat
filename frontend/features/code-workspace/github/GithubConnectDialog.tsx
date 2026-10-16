"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CloudDownload, ExternalLink, Github, Loader2, Lock, Globe, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { codeWorkspace } from "../store/codeWorkspaceStore";
import { githubApi } from "./api";
import { subscribePopupResult } from "./popupChannel";
import { readGithubError, type GithubRepoDto, type GithubStatusDto } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: GithubStatusDto;
  projectId: number;
  projectTitle: string;
  /** Called after a repo is linked, so the header refreshes and starts polling. */
  onLinked: () => void;
  /** Called after the account connected, before a repo is chosen. */
  onConnected: () => void;
}

const POPUP_FEATURES = "width=640,height=760,menubar=no,toolbar=no,location=yes,status=no";

function toRepoName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "my-project";
}

type Tab = "existing" | "new";
/** Set when the chosen repo already has commits — the user must pick what happens to them. */
interface NonEmptyChoice {
  owner: string;
  repo: string;
}

export function GithubConnectDialog({ open, onOpenChange, status, projectId, projectTitle, onLinked, onConnected }: Props) {
  const connected = status.connected;

  const [tab, setTab] = useState<Tab>("existing");
  const [error, setError] = useState<string | null>(null);
  /** Set when GitHub needs the user's approval (e.g. permission to create repositories). */
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);

  // Step 1 — connect
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  // Read by the message / popup-closed handlers, which outlive a single render.
  const authorizingRef = useRef(false);
  /**
   * True from the moment a GitHub window opens until its result arrives. Kept apart
   * from `connecting`: some browsers make a popup that has visited github.com look
   * `closed` to its opener, which stops the spinner early — the result that follows
   * must still be honoured.
   */
  const awaitingRef = useRef(false);
  const retryRef = useRef<() => void | Promise<void>>(() => {});

  // Step 2 — existing repo
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GithubRepoDto[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [selected, setSelected] = useState<GithubRepoDto | null>(null);

  // Step 2 — new repo
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  /** Remembered so a failed link after a successful create retries the link, not the create. */
  const [createdRepo, setCreatedRepo] = useState<GithubRepoDto | null>(null);

  const [working, setWorking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [nonEmpty, setNonEmpty] = useState<NonEmptyChoice | null>(null);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setAuthorizeUrl(null);
    setAuthorizing(false);
    awaitingRef.current = false;
    setNonEmpty(null);
    setSelected(null);
    setCreatedRepo(null);
    setQuery("");
    setName(toRepoName(projectTitle));
    setDescription("");
    setIsPrivate(true);
    setTab("existing");
  }, [open, projectTitle]);

  useEffect(() => {
    authorizingRef.current = authorizing;
  }, [authorizing]);

  const finishAuthorize = useCallback(() => {
    setAuthorizing(false);
    setAuthorizeUrl(null);
    setError(null);
    // Pick the approval up, then retry what the user was doing.
    onConnected();
    setTimeout(() => void retryRef.current(), 400);
  }, [onConnected]);

  /* ---------------- Step 1: connect through a popup ---------------- */

  // The popup's landing page reports back over a BroadcastChannel (no reliance on
  // window.opener, which the browser may have severed) — see popupChannel.ts.
  useEffect(() => {
    return subscribePopupResult((result) => {
      if (!awaitingRef.current) return; // not waiting on a GitHub window — stale or foreign
      awaitingRef.current = false;
      const wasAuthorizing = authorizingRef.current;
      setConnecting(false);
      try {
        popupRef.current?.close(); // best effort; the page also closes itself
      } catch {
        /* handle no longer ours */
      }
      popupRef.current = null;

      if (result.type === "github:connected") {
        onConnected();
        if (wasAuthorizing) finishAuthorize();
      } else {
        setAuthorizing(false);
        setError(result.message);
      }
    });
  }, [onConnected, finishAuthorize]);

  // If the user closes the popup, stop the spinner. When it was the authorize
  // popup, closing means "done" (GitHub's permission page has no callback), so retry.
  useEffect(() => {
    if (!connecting && !authorizing) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setConnecting(false);
        if (authorizingRef.current) finishAuthorize();
      }
    }, 600);
    return () => clearInterval(timer);
  }, [connecting, authorizing, finishAuthorize]);

  /**
   * Opens GitHub's own page for the permission the user must approve (Bolt-style:
   * asked for at the moment it is needed, not up front). Must run inside the click
   * handler so the browser does not treat the window as an unsolicited popup.
   */
  function authorize() {
    if (!authorizeUrl) return;
    const popup = window.open(authorizeUrl, "github-authorize", POPUP_FEATURES);
    if (!popup) {
      setError("Your browser blocked the GitHub window — allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    awaitingRef.current = true;
    setAuthorizing(true);
  }


  async function connect() {
    setError(null);
    // Must open inside the click handler: a window opened after an await is
    // treated as an unsolicited popup and blocked. Navigate it once the URL is known.
    const popup = window.open("", "github-connect", POPUP_FEATURES);
    if (!popup) {
      setError("Your browser blocked the GitHub window — allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    awaitingRef.current = true;
    setConnecting(true);
    try {
      popup.document.title = "Connecting to GitHub…";
      const url = await githubApi.getInstallUrl(projectId);
      popup.location.href = url;
    } catch (e) {
      popup.close();
      popupRef.current = null;
      awaitingRef.current = false;
      setConnecting(false);
      setError(readGithubError(e, "Could not start the GitHub connection").message);
    }
  }

  /* ---------------- Step 2: repositories ---------------- */

  const loadRepos = useCallback(async (q: string) => {
    setReposLoading(true);
    try {
      const { repos: list } = await githubApi.listRepos(q);
      setRepos(list);
      setError(null);
    } catch (e) {
      setRepos([]);
      setError(readGithubError(e, "Could not load your repositories").message);
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !connected || tab !== "existing") return;
    const timer = setTimeout(() => void loadRepos(query), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, connected, tab, query, loadRepos]);

  async function link(owner: string, repo: string, initial: "push" | "pull", overwrite = false) {
    setWorking(true);
    setError(null);
    try {
      const result = await githubApi.linkProject(projectId, { owner, repo, initial, overwrite });
      if (result.pull) {
        await codeWorkspace.reloadFromServer();
        const skipped = result.pull.skipped.length;
        toast.success(`Imported ${result.pull.fileCount} files from ${owner}/${repo}`, {
          description: skipped ? `${skipped} file${skipped === 1 ? "" : "s"} skipped (binary, too large, or not allowed).` : undefined,
        });
      } else {
        toast.success(`Connected to ${owner}/${repo}`, { description: "Your files are on GitHub." });
      }
      setNonEmpty(null);
      onOpenChange(false);
      onLinked();
    } catch (e) {
      const info = readGithubError(e, "Could not connect the repository");
      if (info.code === "REPO_NOT_EMPTY") setNonEmpty({ owner, repo });
      else setError(info.message);
      // The link itself may have been saved before a later step failed.
      onLinked();
    } finally {
      setWorking(false);
    }
  }

  async function submitExisting() {
    if (!selected) return;
    await link(selected.owner, selected.name, "push");
  }

  async function submitNew() {
    setError(null);
    let repo = createdRepo;
    if (!repo) {
      setWorking(true);
      try {
        repo = await githubApi.createRepo({ name: name.trim(), description: description.trim(), isPrivate });
        setCreatedRepo(repo);
      } catch (e) {
        const info = readGithubError(e, "Could not create the repository");
        setError(info.message);
        setAuthorizeUrl(info.code === "REPO_CREATE_FORBIDDEN" ? info.authorizeUrl : null);
        setWorking(false);
        return;
      }
      setWorking(false);
    }
    await link(repo.owner, repo.name, "push");
  }

  // After the user approves on GitHub, repeat what they were doing — creating a repo.
  useEffect(() => {
    retryRef.current = () => {
      if (tab === "new" && open && connected) return submitNew();
    };
  });

  /**
   * Account-level disconnect, reachable even when this project has no repo linked
   * (the header menu with its own disconnect item only exists once a repo is linked).
   * Removes only the stored connection: files, versions and the GitHub repos stay.
   */
  async function disconnectAccount() {
    if (
      !window.confirm(
        "Disconnect your GitHub account from every project? Your files and versions stay here, and nothing on GitHub is deleted.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setError(null);
    try {
      await githubApi.disconnect();
      toast.success("GitHub account disconnected");
      setRepos(null);
      setSelected(null);
      setCreatedRepo(null);
      onConnected(); // refreshes status → this dialog flips back to the "Connect to GitHub" step
    } catch (e) {
      setError(readGithubError(e, "Could not disconnect GitHub").message);
    } finally {
      setDisconnecting(false);
    }
  }

  const nameValid = /^[A-Za-z0-9._-]{1,100}$/.test(name.trim());

  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      {/*
        The dialog is a CSS grid, whose implicit column is `auto`: any child with a
        wide min-content (a long repo name, the description) stretches the column past
        the dialog box, and the overflow paints on top of the page behind it.
        `minmax(0,1fr)` pins the column to the box; `sm:max-w-md` is needed because the
        base component's own `sm:max-w-lg` is not overridden by a plain `max-w-md`.
        The max-height keeps it usable on short screens.
      */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-4 w-4" /> {connected ? "Connect a repository" : "Connect to GitHub"}
          </DialogTitle>
          <DialogDescription>
            {connected
              ? `Signed in as ${status.connection?.login}. Your project's files are pushed here, and AI changes are committed automatically.`
              : "Sync this project to a GitHub repository. You choose exactly which repositories the app can access."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
            {authorizeUrl && (
              <div className="flex flex-wrap items-center gap-2 pl-5">
                <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={authorize} disabled={authorizing}>
                  {authorizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Github className="h-3 w-3" />}
                  {authorizing ? "Waiting for GitHub…" : "Authorize on GitHub"}
                </Button>
                {authorizing && (
                  <span className="text-[11px]">Approve on GitHub, then close that window — we&apos;ll continue automatically.</span>
                )}
              </div>
            )}
          </div>
        )}

        {!connected && (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />Pick existing repositories or create a new one</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />Every AI change becomes a commit</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />Pull changes made on GitHub back into the editor</li>
            </ul>
            <Button className="w-full gap-2" onClick={() => void connect()} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
              {connecting ? "Waiting for GitHub…" : "Continue with GitHub"}
            </Button>
          </div>
        )}

        {connected && nonEmpty && (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-medium">{nonEmpty.owner}/{nonEmpty.repo} already has commits.</p>
            <p>Pushing over it would replace what is there. Choose what to do:</p>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" className="justify-start gap-2" disabled={working} onClick={() => void link(nonEmpty.owner, nonEmpty.repo, "pull")}>
                <CloudDownload className="h-3.5 w-3.5" /> Import the repo into this project
              </Button>
              <Button size="sm" variant="destructive" className="justify-start gap-2" disabled={working} onClick={() => void link(nonEmpty.owner, nonEmpty.repo, "push", true)}>
                <AlertTriangle className="h-3.5 w-3.5" /> Overwrite the repo with this project
              </Button>
              <Button size="sm" variant="ghost" disabled={working} onClick={() => setNonEmpty(null)}>Cancel</Button>
            </div>
            {working && <p className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Working…</p>}
          </div>
        )}

        {connected && !nonEmpty && (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Select existing</TabsTrigger>
                <TabsTrigger value="new">Create new</TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === "existing" ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories" className="h-9 pl-8 text-sm" />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
                  {reposLoading && repos === null && (
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading repositories…</div>
                  )}
                  {repos?.length === 0 && !reposLoading && (
                    <div className="space-y-2 p-3 text-xs text-muted-foreground">
                      {query ? (
                        <p>No repositories match.</p>
                      ) : (
                        <>
                          <p>No repositories are shared with the app yet.</p>
                          <p>
                            Use <button type="button" className="font-medium text-violet-600 underline hover:no-underline" onClick={() => setTab("new")}>Create new</button>{" "}
                            to make one, or pick existing repositories on GitHub.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {repos?.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(r)}
                        className={cn(
                          "flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60",
                          active && "bg-violet-50 dark:bg-violet-500/10",
                        )}
                      >
                        {r.isPrivate ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate">{r.fullName}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-violet-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="gh-repo-name">Repository name</label>
                  <Input id="gh-repo-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!createdRepo} className="h-9 text-sm" />
                  {!nameValid && name.length > 0 && (
                    <p className="text-[11px] text-red-600">Letters, numbers, dots, dashes and underscores only.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="gh-repo-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Input id="gh-repo-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={350} disabled={!!createdRepo} className="h-9 text-sm" />
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium">{isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}{isPrivate ? "Private" : "Public"}</span>
                    <span className="text-[11px] text-muted-foreground">{isPrivate ? "Only you and people you choose" : "Anyone on the internet can see it"}</span>
                  </span>
                  <Switch checked={isPrivate} onCheckedChange={setIsPrivate} disabled={!!createdRepo} />
                </label>
                {createdRepo && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Repository {createdRepo.fullName} was created — finishing the connection.</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {status.connection?.manageUrl && (
                <a
                  href={status.connection.manageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" /> Manage which repositories {status.connection.login} shares with the app
                </a>
              )}
              <button
                type="button"
                onClick={() => void disconnectAccount()}
                disabled={working || disconnecting}
                className="inline-flex items-center gap-1 self-start text-[11px] text-muted-foreground underline hover:text-red-600 disabled:opacity-50"
              >
                {disconnecting && <Loader2 className="h-3 w-3 animate-spin" />}
                Disconnect {status.connection?.login ?? "GitHub account"}
              </button>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>Cancel</Button>
              {tab === "existing" ? (
                <Button onClick={() => void submitExisting()} disabled={!selected || working}>
                  {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {working ? "Connecting…" : "Connect repository"}
                </Button>
              ) : (
                <Button onClick={() => void submitNew()} disabled={(!nameValid && !createdRepo) || working}>
                  {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {working ? (createdRepo ? "Connecting…" : "Creating…") : createdRepo ? "Retry connection" : "Create & connect"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
