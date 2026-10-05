"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  Github,
  Globe,
  Loader2,
  Lock,
  Plus,
  Search,
  Trash2,
  Triangle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { codeWorkspace } from "../store/codeWorkspaceStore";
import { githubApi } from "../github/api";
import type { GithubLinkDto, GithubRepoDto } from "../github/types";
import { vercelApi } from "./api";
import { attachLogs, streamDeploy, streamRedeploy } from "./deployStream";
import { subscribePopupResult } from "./popupChannel";
import {
  FRAMEWORK_LABELS,
  NODE_VERSIONS,
  readVercelError,
  TERMINAL_STATES,
  type DeployBody,
  type DeployStreamEvent,
  type VercelDetectDto,
  type VercelStatusDto,
} from "./types";

/** What the dialog was opened for. */
export type PublishIntent =
  | { kind: "publish" }
  /** "Deployment settings…" — straight to the config step with the saved settings. */
  | { kind: "settings" }
  /** "Redeploy" — same settings, straight to the log console. */
  | { kind: "redeploy" }
  /** A refresh mid-build, a second tab, or "View logs". */
  | { kind: "attach"; deploymentId: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: PublishIntent;
  status: VercelStatusDto;
  projectId: number;
  /** Refreshes the header's status (and starts its polling). */
  onChanged: () => void;
}

type Step = "connect" | "choose" | "repo" | "configure" | "git-setup" | "deploying" | "done";
type Source = "files" | "git";

interface Draft {
  name: string;
  /** "" = no framework preset ("Other"). */
  framework: string;
  buildCommand: string;
  installCommand: string;
  outputDirectory: string;
  rootDirectory: string;
  /** "" = Vercel's default. */
  nodeVersion: string;
}

interface EnvRow {
  id: number;
  key: string;
  value: string;
  reveal: boolean;
}

interface GitTarget {
  repoId: string;
  owner: string;
  repo: string;
  branch: string;
}

interface LogEntry {
  id: number;
  text: string;
  level: "info" | "error";
}

interface Run {
  deploymentId: string | null;
  state: string;
  url: string | null;
  dashboardUrl: string | null;
  error: string | null;
  canceled: boolean;
  startedAt: number;
  finishedMs: number | null;
  envWarnings: { key: string; message: string }[];
}

const POPUP_FEATURES = "width=640,height=760,menubar=no,toolbar=no,location=yes,status=no";
/** Radix Select can't use "" as an item value. */
const NONE = "__none__";

const EMPTY_DRAFT: Draft = { name: "", framework: "", buildCommand: "", installCommand: "", outputDirectory: "", rootDirectory: "", nodeVersion: "" };

const STATE_LABEL: Record<string, string> = {
  QUEUED: "Queued",
  INITIALIZING: "Initializing",
  BUILDING: "Building",
  READY: "Ready",
  ERROR: "Failed",
  CANCELED: "Canceled",
};

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

function newRun(): Run {
  return { deploymentId: null, state: "QUEUED", url: null, dashboardUrl: null, error: null, canceled: false, startedAt: Date.now(), finishedMs: null, envWarnings: [] };
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function nullable(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

let envRowSeq = 0;
const envRow = (key = "", value = ""): EnvRow => ({ id: ++envRowSeq, key, value, reveal: false });

export function VercelPublishDialog({ open, onOpenChange, intent, status, projectId, onChanged }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [source, setSource] = useState<Source>("files");
  const [error, setError] = useState<string | null>(null);

  /* ---------------- connect ---------------- */
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  /** True from the moment the Vercel window opens until its result arrives (see GithubConnectDialog). */
  const awaitingRef = useRef(false);

  /* ---------------- detection + config ---------------- */
  const [detected, setDetected] = useState<VercelDetectDto | null>(null);
  const [detectedFor, setDetectedFor] = useState<Source | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [nameError, setNameError] = useState<{ message: string; suggestion: string | null } | null>(null);
  /** Which source the draft was last filled for — switching source re-fills it. */
  const prefilledFor = useRef<Source | null>(null);

  /* ---------------- repo ---------------- */
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GithubRepoDto[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [git, setGit] = useState<GitTarget | null>(null);
  const [githubLink, setGithubLink] = useState<GithubLinkDto | null>(null);
  const [pushing, setPushing] = useState(false);

  /* ---------------- git-setup ---------------- */
  const [gitSetup, setGitSetup] = useState<{ vercelAuthUrl: string | null; githubAppUrl: string | null } | null>(null);
  const [setupPopupOpen, setSetupPopupOpen] = useState(false);
  const setupPopupRef = useRef<Window | null>(null);
  const lastBody = useRef<DeployBody | null>(null);

  /* ---------------- deploy run ---------------- */
  const [run, setRun] = useState<Run>(newRun);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const pendingLogs = useRef<LogEntry[]>([]);
  const logFrame = useRef<number | null>(null);
  const logSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [canceling, setCanceling] = useState(false);

  const deploying = step === "deploying" && !TERMINAL_STATES.includes(run.state) && !run.error;

  /* ================================================================ *
   * Log buffering — a build can print hundreds of lines a second;
   * batch them into one render per frame.
   * ================================================================ */

  const pushLog = useCallback((text: string, level: "info" | "error") => {
    pendingLogs.current.push({ id: ++logSeq.current, text, level });
    if (logFrame.current !== null) return;
    logFrame.current = requestAnimationFrame(() => {
      logFrame.current = null;
      const batch = pendingLogs.current;
      pendingLogs.current = [];
      // Keep the console bounded; the full log lives on Vercel.
      setLogs((prev) => [...prev, ...batch].slice(-3000));
    });
  }, []);

  useEffect(() => {
    if (!follow || !consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs, follow]);

  useEffect(() => {
    if (!deploying) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deploying]);

  /* ================================================================ *
   * Streaming
   * ================================================================ */

  const onEvent = useCallback(
    (event: DeployStreamEvent) => {
      switch (event.type) {
        case "deploy_created":
          setRun((r) => ({ ...r, deploymentId: event.deploymentId, url: event.url, dashboardUrl: event.dashboardUrl ?? r.dashboardUrl }));
          onChanged();
          // A workspace publish snapshots unsaved edits as a version — catch the v-chip up.
          if (!event.attached) void codeWorkspace.refreshProjectInfo();
          break;
        case "state":
          setRun((r) => ({ ...r, state: event.readyState }));
          break;
        case "log":
          pushLog(event.text, event.level);
          break;
        case "env_warning":
          setRun((r) => ({ ...r, envWarnings: [...r.envWarnings, { key: event.key, message: event.message }] }));
          break;
        case "ready":
          setRun((r) => ({ ...r, state: "READY", url: event.url ?? r.url, finishedMs: event.durationMs }));
          setStep("done");
          onChanged();
          break;
        case "canceled":
          setRun((r) => ({ ...r, state: "CANCELED", canceled: true }));
          onChanged();
          break;
        case "error":
          setRun((r) => ({ ...r, state: r.state === "READY" ? r.state : "ERROR", error: event.message }));
          onChanged();
          break;
      }
    },
    [onChanged, pushLog],
  );

  const runStream = useCallback(
    async (start: (signal: AbortSignal) => Promise<void>, body: DeployBody | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      pendingLogs.current = [];
      setLogs([]);
      setRun(newRun());
      setFollow(true);
      setError(null);
      setStep("deploying");
      lastBody.current = body;

      try {
        await start(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) return;
        const info = readVercelError(e, "Could not start the deployment");
        switch (info.code) {
          case "VERCEL_GIT_NOT_CONNECTED":
            setGitSetup({ vercelAuthUrl: info.details.vercelAuthUrl, githubAppUrl: info.details.githubAppUrl });
            setStep("git-setup");
            return;
          case "PROJECT_NAME_TAKEN":
            setNameError({ message: info.message, suggestion: info.details.suggestion });
            setStep("configure");
            return;
          case "DEPLOY_IN_PROGRESS":
            if (info.details.deploymentId) {
              toast.info("A deployment is already running — showing it");
              const id = info.details.deploymentId;
              void runStream((signal) => attachLogs(projectId, id, onEvent, signal), null);
              return;
            }
            break;
          case "VERCEL_REAUTH":
          case "VERCEL_INTEGRATION_DISABLED":
          case "VERCEL_NOT_CONNECTED":
            setError(info.message);
            setStep("connect");
            onChanged();
            return;
          case "NOT_DEPLOYABLE":
            setError(info.details.reason ?? info.message);
            setStep("choose");
            return;
        }
        if (body) {
          setError(info.message);
          setStep("configure");
        } else {
          setRun((r) => ({ ...r, error: info.message, state: "ERROR" }));
        }
        return;
      }
      if (controller.signal.aborted) return;
      // The stream ended without a terminal event (network blip, server restart).
      setRun((r) =>
        TERMINAL_STATES.includes(r.state) || r.error
          ? r
          : { ...r, error: "Lost the connection to the build. It keeps going on Vercel — the header shows when it finishes." },
      );
      onChanged();
    },
    [onChanged, onEvent, projectId],
  );

  /* ================================================================ *
   * Opening
   * ================================================================ */

  function prefillFromLink() {
    const link = status.link;
    if (!link) return;
    setDraft({
      name: link.vercelProjectName,
      framework: link.framework ?? "",
      buildCommand: link.buildCommand ?? "",
      installCommand: link.installCommand ?? "",
      outputDirectory: link.outputDirectory ?? "",
      rootDirectory: link.rootDirectory ?? "",
      nodeVersion: link.nodeVersion ?? "",
    });
    setEnvRows([]);
    if (link.source === "GIT" && link.gitRepoId && link.gitOwner && link.gitRepo) {
      setGit({ repoId: link.gitRepoId, owner: link.gitOwner, repo: link.gitRepo, branch: link.gitBranch ?? "main" });
    }
  }

  // Reset whenever the dialog opens. Status changes while it is open must NOT reset it.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setNameError(null);
    setGitSetup(null);
    setDetected(null);
    setDetectedFor(null);
    prefilledFor.current = null;
    setQuery("");

    if (intent.kind === "attach") {
      const id = intent.deploymentId;
      void runStream((signal) => attachLogs(projectId, id, onEvent, signal), null);
      return;
    }
    if (!status.connected) {
      setStep("connect");
      return;
    }
    if (intent.kind === "redeploy") {
      void runStream((signal) => streamRedeploy(projectId, [], onEvent, signal), null);
      return;
    }
    if (intent.kind === "settings" && status.link) {
      const linkSource: Source = status.link.source === "GIT" ? "git" : "files";
      setSource(linkSource);
      prefillFromLink();
      prefilledFor.current = linkSource;
      setStep("configure");
      return;
    }
    setGit(null);
    setEnvRows([]);
    setDraft(EMPTY_DRAFT);
    setStep("choose");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing the dialog stops reading the stream; the build itself carries on.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ================================================================ *
   * Step: connect
   * ================================================================ */

  useEffect(() => {
    return subscribePopupResult((result) => {
      if (!awaitingRef.current) return; // not waiting on a Vercel window — stale or foreign
      awaitingRef.current = false;
      setConnecting(false);
      try {
        popupRef.current?.close(); // best effort; the page also closes itself
      } catch {
        /* handle no longer ours */
      }
      popupRef.current = null;

      if (result.type === "vercel:connected") {
        toast.success("Vercel connected successfully", { description: result.account ? `Signed in as ${result.account}.` : undefined });
        setError(null);
        setStep("choose");
        onChanged();
      } else {
        setError(result.message);
      }
    });
  }, [onChanged]);

  useEffect(() => {
    if (!connecting) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setConnecting(false);
      }
    }, 600);
    return () => clearInterval(timer);
  }, [connecting]);

  async function connect() {
    setError(null);
    // Must open inside the click handler: a window opened after an await is
    // treated as an unsolicited popup and blocked. Navigate it once the URL is known.
    const popup = window.open("", "vercel-connect", POPUP_FEATURES);
    if (!popup) {
      setError("Your browser blocked the Vercel window — allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    awaitingRef.current = true;
    setConnecting(true);
    try {
      popup.document.title = "Connecting to Vercel…";
      popup.location.href = await vercelApi.getInstallUrl(projectId);
    } catch (e) {
      popup.close();
      popupRef.current = null;
      awaitingRef.current = false;
      setConnecting(false);
      setError(readVercelError(e, "Could not start the Vercel connection").message);
    }
  }

  /* ================================================================ *
   * Detection
   * ================================================================ */

  const loadDetect = useCallback(
    async (forSource: Source) => {
      setDetecting(true);
      try {
        const result = await vercelApi.detect(projectId, forSource);
        setDetected(result);
        setDetectedFor(forSource);
        return result;
      } catch (e) {
        setError(readVercelError(e, "Could not read this project's settings").message);
        return null;
      } finally {
        setDetecting(false);
      }
    },
    [projectId],
  );

  // The choose step needs to know whether the workspace files can be published at all.
  useEffect(() => {
    if (!open || step !== "choose" || !status.connected || detectedFor === "files") return;
    void loadDetect("files");
  }, [open, step, status.connected, detectedFor, loadDetect]);

  function fillFrom(result: VercelDetectDto) {
    setDraft({
      name: result.nameAvailable || !result.nameSuggestion ? result.suggestedName : result.nameSuggestion,
      framework: result.framework ?? "",
      buildCommand: result.buildCommand ?? "",
      installCommand: result.installCommand ?? "",
      outputDirectory: result.outputDirectory ?? "",
      rootDirectory: result.rootDirectory ?? "",
      nodeVersion: result.nodeVersion ?? "",
    });
    setEnvRows(result.suggestedEnvKeys.map((key) => envRow(key, "")));
    setNameError(
      result.nameAvailable || !result.nameSuggestion
        ? null
        : { message: `"${result.suggestedName}" is already taken on Vercel, so we picked "${result.nameSuggestion}".`, suggestion: null },
    );
  }

  async function goConfigure(forSource: Source) {
    setError(null);
    setStep("configure");
    // Detection for the settings step itself (re-run for "git": it doesn't block on the editor's files).
    const result = detectedFor === forSource && detected ? detected : await loadDetect(forSource);
    if (result && prefilledFor.current !== forSource) {
      fillFrom(result);
      prefilledFor.current = forSource;
    }
  }

  function resetToDetected() {
    if (!detected) return;
    const name = draft.name;
    fillFrom(detected);
    setDraft((d) => ({ ...d, name })); // the name is the user's choice, not a setting
    setNameError(null);
  }

  /* ================================================================ *
   * Step: repo
   * ================================================================ */

  const loadRepos = useCallback(async (q: string) => {
    setReposLoading(true);
    try {
      const { repos: list } = await githubApi.listRepos(q);
      setRepos(list);
    } catch (e) {
      setRepos([]);
      setError(readVercelError(e, "Could not load your repositories").message);
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step !== "repo") return;
    const timer = setTimeout(() => void loadRepos(query), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, step, query, loadRepos]);

  const refreshGithubLink = useCallback(async () => {
    try {
      const gh = await githubApi.getStatus(projectId);
      setGithubLink(gh.link);
      return gh.link;
    } catch {
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || step !== "repo") return;
    void refreshGithubLink();
  }, [open, step, refreshGithubLink]);

  // Pre-select the repo this project already mirrors to.
  useEffect(() => {
    if (step !== "repo" || git || !githubLink || !repos) return;
    const match = repos.find((r) => r.owner.toLowerCase() === githubLink.owner.toLowerCase() && r.name.toLowerCase() === githubLink.repo.toLowerCase());
    if (match) setGit({ repoId: match.id, owner: match.owner, repo: match.name, branch: githubLink.branch });
  }, [step, git, githubLink, repos]);

  const selectedIsMirror =
    !!git && !!githubLink && git.owner.toLowerCase() === githubLink.owner.toLowerCase() && git.repo.toLowerCase() === githubLink.repo.toLowerCase();
  const versionsBehind = selectedIsMirror && githubLink ? githubLink.currentVersion - (githubLink.lastPushedVersion ?? 0) : 0;
  const repoBehind = selectedIsMirror && !!githubLink && (versionsBehind > 0 || githubLink.dirty);

  async function pushNow() {
    setPushing(true);
    try {
      const result = await githubApi.push(projectId);
      if (result.pushed) toast.success("Pushed to GitHub", { description: `${result.fileCount} files committed.` });
      else toast.info(result.skippedReason ?? "Nothing to push");
      await refreshGithubLink();
      void codeWorkspace.refreshProjectInfo();
    } catch (e) {
      toast.error(readVercelError(e, "Could not push to GitHub").message);
    } finally {
      setPushing(false);
    }
  }

  /* ================================================================ *
   * Deploy
   * ================================================================ */

  function buildBody(): DeployBody | null {
    const name = draft.name.trim().toLowerCase();
    if (!NAME_PATTERN.test(name) || name.includes("---")) {
      setNameError({ message: "Use lowercase letters, numbers, dots, dashes and underscores, starting with a letter or number.", suggestion: null });
      return null;
    }
    if (source === "git" && !git) {
      setError("Choose a repository first.");
      return null;
    }
    const seen = new Set<string>();
    const envVars = envRows
      .map((r) => ({ key: r.key.trim(), value: r.value }))
      .filter((r) => r.key && r.value !== "" && !seen.has(r.key) && seen.add(r.key));
    return {
      source,
      name,
      framework: nullable(draft.framework),
      buildCommand: nullable(draft.buildCommand),
      installCommand: nullable(draft.installCommand),
      outputDirectory: nullable(draft.outputDirectory),
      rootDirectory: nullable(draft.rootDirectory),
      nodeVersion: nullable(draft.nodeVersion),
      envVars,
      ...(source === "git" && git ? { git: { ...git, branch: git.branch.trim() || "main" } } : {}),
    };
  }

  function deploy(body: DeployBody | null = buildBody()) {
    if (!body) return;
    setNameError(null);
    void runStream((signal) => streamDeploy(projectId, body, onEvent, signal), body);
  }

  async function cancelDeploy() {
    if (!run.deploymentId) return;
    setCanceling(true);
    try {
      await vercelApi.cancel(projectId, run.deploymentId);
      toast.info("Canceling the deployment…");
    } catch (e) {
      toast.error(readVercelError(e, "Could not cancel the deployment").message);
    } finally {
      setCanceling(false);
    }
  }

  function runInBackground() {
    abortRef.current?.abort();
    onOpenChange(false);
    onChanged();
    toast.info("Deployment continues in the background", { description: "The Publish button shows when it's live." });
  }

  /* ================================================================ *
   * Step: git-setup — Vercel's and GitHub's pages have no callback, so
   * closing the window re-enables the retry; the retry stays manual.
   * ================================================================ */

  function openSetup(url: string | null) {
    if (!url) return;
    const popup = window.open(url, "vercel-git-setup", POPUP_FEATURES);
    if (!popup) {
      setError("Your browser blocked the window — allow pop-ups for this site and try again.");
      return;
    }
    setupPopupRef.current = popup;
    setSetupPopupOpen(true);
  }

  useEffect(() => {
    if (!setupPopupOpen) return;
    const timer = setInterval(() => {
      if (setupPopupRef.current?.closed) {
        setupPopupRef.current = null;
        setSetupPopupOpen(false);
      }
    }, 600);
    return () => clearInterval(timer);
  }, [setupPopupOpen]);

  /* ================================================================ *
   * Render
   * ================================================================ */

  const filesBlocked = detectedFor === "files" && detected && !detected.deployable ? detected.blockedReason : null;
  const resultUrl = run.url;
  const title =
    step === "connect"
      ? "Publish to Vercel"
      : step === "done"
        ? "Your site is live"
        : step === "deploying"
          ? "Deploying to Vercel"
          : step === "git-setup"
            ? "One more step"
            : "Publish to Vercel";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Same grid fix as GithubConnectDialog: `minmax(0,1fr)` stops a long URL or
        log line stretching the dialog past its box; `sm:max-w-lg` must carry the
        `sm:` prefix to beat the base component's own `sm:max-w-lg`.
      */}
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto sm:max-w-lg"
        onInteractOutside={(e) => {
          if (deploying) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (deploying) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Triangle className="h-4 w-4 fill-current" /> {title}
          </DialogTitle>
          <DialogDescription>
            {step === "connect" && "Put this project on a real URL. It deploys to your own Vercel account — you keep full control."}
            {step === "choose" &&
              (status.connection?.accountName ? `Deploying to ${status.connection.accountName}${status.connection.isTeam ? " (team)" : ""}.` : "How should Vercel get this project?")}
            {step === "repo" && "Vercel builds from this repository and redeploys on every push."}
            {step === "configure" && "We detected these settings. Change anything you need."}
            {step === "git-setup" && "Vercel needs access to your GitHub account before it can build from a repository."}
            {step === "deploying" && "Vercel is building your project. You can close this — it keeps going."}
            {step === "done" && "Deployed to production on Vercel."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ---------------- connect ---------------- */}
        {step === "connect" && (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />Deploy straight from this workspace, or from a GitHub repo</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />Build settings are detected for you</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />Watch the build live and get a shareable URL</li>
            </ul>
            <Button className="w-full gap-2" onClick={() => void connect()} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Triangle className="h-3.5 w-3.5 fill-current" />}
              {connecting ? "Waiting for Vercel…" : "Connect Vercel"}
            </Button>
            {connecting && (
              <p className="text-center text-[11px] text-muted-foreground">Approve access in the Vercel window — this dialog continues on its own.</p>
            )}
          </div>
        )}

        {/* ---------------- choose source ---------------- */}
        {step === "choose" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!status.githubConnected}
              onClick={() => {
                setSource("git");
                setStep("repo");
              }}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition hover:border-foreground/30 hover:bg-muted/50",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-transparent",
              )}
            >
              <Github className="h-4 w-4" />
              <span className="text-sm font-medium">Deploy with GitHub</span>
              <span className="text-[11px] leading-snug text-muted-foreground">Vercel builds from your repo and redeploys on every push.</span>
              {!status.githubConnected && (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Connect GitHub first (the GitHub button in the header).</span>
              )}
            </button>
            <button
              type="button"
              disabled={!!filesBlocked || (detecting && detectedFor !== "files")}
              onClick={() => {
                setSource("files");
                void goConfigure("files");
              }}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition hover:border-foreground/30 hover:bg-muted/50",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-transparent",
              )}
            >
              <FileCode2 className="h-4 w-4" />
              <span className="text-sm font-medium">Deploy from this workspace</span>
              <span className="text-[11px] leading-snug text-muted-foreground">Upload the current files straight to Vercel. No repo needed.</span>
              {filesBlocked && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">{filesBlocked}</span>}
            </button>
          </div>
        )}

        {/* ---------------- repo ---------------- */}
        {step === "repo" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories" className="h-9 pl-8 text-sm" />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
              {reposLoading && repos === null && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading repositories…</div>
              )}
              {repos?.length === 0 && !reposLoading && (
                <p className="p-3 text-xs text-muted-foreground">
                  {query ? "No repositories match." : "No repositories are shared with the GitHub app yet — connect one from the GitHub button in the header."}
                </p>
              )}
              {repos?.map((r) => {
                const active = git?.repoId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setGit({
                        repoId: r.id,
                        owner: r.owner,
                        repo: r.name,
                        branch:
                          githubLink && githubLink.owner.toLowerCase() === r.owner.toLowerCase() && githubLink.repo.toLowerCase() === r.name.toLowerCase()
                            ? githubLink.branch
                            : r.defaultBranch,
                      })
                    }
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

            {git && (
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="vercel-branch">Branch</label>
                <Input
                  id="vercel-branch"
                  value={git.branch}
                  onChange={(e) => setGit({ ...git, branch: e.target.value })}
                  className="h-9 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Production deploys build this branch. Pushes to it redeploy automatically.</p>
              </div>
            )}

            {repoBehind && githubLink && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p>
                    <span className="font-medium">{githubLink.owner}/{githubLink.repo}</span> is behind this project
                    {versionsBehind > 0 ? ` by ${versionsBehind} version${versionsBehind === 1 ? "" : "s"}` : " (unsaved edits)"} — Vercel builds the repo, not the editor.
                  </p>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={pushing} onClick={() => void pushNow()}>
                    {pushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />} Push now
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" className="gap-1.5" onClick={() => setStep("choose")}><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
              <Button disabled={!git || !git.branch.trim()} onClick={() => void goConfigure("git")}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {/* ---------------- configure ---------------- */}
        {step === "configure" && (
          <div className="space-y-3">
            {detecting && !detected && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Detecting build settings…</div>
            )}

            {source === "git" && git && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-xs">
                <Github className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{git.owner}/{git.repo}</span>
                <span className="shrink-0 font-mono text-muted-foreground">{git.branch}</span>
              </div>
            )}

            <Field label="Project name" htmlFor="vercel-name" hint="Becomes your URL: name.vercel.app">
              <Input
                id="vercel-name"
                value={draft.name}
                onChange={(e) => {
                  setDraft({ ...draft, name: e.target.value.toLowerCase() });
                  setNameError(null);
                }}
                className="h-9 font-mono text-sm"
              />
              {nameError && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
                  <span>{nameError.message}</span>
                  {nameError.suggestion && (
                    <button
                      type="button"
                      className="font-medium underline hover:no-underline"
                      onClick={() => {
                        setDraft({ ...draft, name: nameError.suggestion! });
                        setNameError(null);
                      }}
                    >
                      Use {nameError.suggestion}
                    </button>
                  )}
                </div>
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Framework" auto={!!detected && draft.framework === (detected.framework ?? "")}>
                <Select value={draft.framework || NONE} onValueChange={(v) => setDraft({ ...draft, framework: v === NONE ? "" : v })}>
                  <SelectTrigger size="sm" className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Other (no preset)</SelectItem>
                    {Object.entries(FRAMEWORK_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Node.js version" auto={!!detected && draft.nodeVersion === (detected.nodeVersion ?? "")}>
                <Select value={draft.nodeVersion || NONE} onValueChange={(v) => setDraft({ ...draft, nodeVersion: v === NONE ? "" : v })}>
                  <SelectTrigger size="sm" className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Vercel default</SelectItem>
                    {NODE_VERSIONS.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CommandField label="Build command" placeholder="npm run build" value={draft.buildCommand} detected={detected?.buildCommand} onChange={(v) => setDraft({ ...draft, buildCommand: v })} />
              <CommandField label="Install command" placeholder="npm install" value={draft.installCommand} detected={detected?.installCommand} onChange={(v) => setDraft({ ...draft, installCommand: v })} />
              <CommandField label="Output directory" placeholder="Framework default" value={draft.outputDirectory} detected={detected?.outputDirectory} onChange={(v) => setDraft({ ...draft, outputDirectory: v })} />
              <CommandField label="Root directory" placeholder="./" value={draft.rootDirectory} detected={detected?.rootDirectory} onChange={(v) => setDraft({ ...draft, rootDirectory: v })} />
            </div>
            {draft.installCommand === "" && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
                onClick={() => setDraft({ ...draft, installCommand: "npm install --legacy-peer-deps" })}
              >
                Install fails on peer dependencies? Use npm install --legacy-peer-deps
              </button>
            )}

            {detected && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <span className="min-w-0 flex-1">{detected.reason}</span>
                <button type="button" className="shrink-0 underline hover:text-foreground" onClick={resetToDetected}>Reset to detected</button>
              </p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Environment variables</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-300"
                  onClick={() => setEnvRows([...envRows, envRow()])}
                >
                  <Plus className="h-3 w-3" /> Add variable
                </button>
              </div>
              {envRows.length === 0 && <p className="text-[11px] text-muted-foreground">None. Values are saved encrypted on Vercel, never here.</p>}
              {envRows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <Input
                    value={row.key}
                    placeholder="KEY"
                    onChange={(e) => setEnvRows(envRows.map((r) => (r.id === row.id ? { ...r, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") } : r)))}
                    className="h-8 min-w-0 flex-1 font-mono text-xs"
                  />
                  <div className="relative min-w-0 flex-1">
                    <Input
                      type={row.reveal ? "text" : "password"}
                      value={row.value}
                      placeholder="value"
                      autoComplete="off"
                      onChange={(e) => setEnvRows(envRows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))}
                      className="h-8 pr-7 font-mono text-xs"
                    />
                    <button
                      type="button"
                      title={row.reveal ? "Hide" : "Show"}
                      className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setEnvRows(envRows.map((r) => (r.id === row.id ? { ...r, reveal: !r.reveal } : r)))}
                    >
                      {row.reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" title="Remove" onClick={() => setEnvRows(envRows.filter((r) => r.id !== row.id))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {envRows.some((r) => r.key.trim() && r.value === "") && (
                <p className="text-[11px] text-muted-foreground">Rows without a value are skipped.</p>
              )}
              {status.link && envRows.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Variables you set before stay on Vercel — add a row only to add or change one.</p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              {intent.kind !== "settings" && (
                <Button variant="ghost" className="gap-1.5" onClick={() => setStep(source === "git" ? "repo" : "choose")}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              <Button className="gap-1.5" disabled={!draft.name.trim() || (detecting && !detected)} onClick={() => deploy()}>
                <Triangle className="h-3 w-3 fill-current" /> Deploy
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ---------------- git-setup ---------------- */}
        {step === "git-setup" && gitSetup && (
          <div className="space-y-3">
            <ol className="space-y-2.5 text-xs">
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium">1</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p>Link GitHub to your Vercel account.</p>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openSetup(gitSetup.vercelAuthUrl)} disabled={!gitSetup.vercelAuthUrl}>
                    <Triangle className="h-3 w-3 fill-current" /> Open Vercel settings
                  </Button>
                </div>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium">2</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p>
                    Install the Vercel GitHub App{git ? <> for <span className="font-medium">{git.owner}</span></> : null} and give it access to the repository.
                  </p>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openSetup(gitSetup.githubAppUrl)} disabled={!gitSetup.githubAppUrl}>
                    <Github className="h-3 w-3" /> Open GitHub
                  </Button>
                </div>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium">3</span>
                <p className="min-w-0 flex-1 pt-0.5">Come back here and deploy again.</p>
              </li>
            </ol>
            {setupPopupOpen && <p className="text-[11px] text-muted-foreground">Finish in the other window, then close it.</p>}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" className="gap-1.5" onClick={() => setStep("configure")}><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
              <Button className="gap-1.5" disabled={setupPopupOpen || !lastBody.current} onClick={() => deploy(lastBody.current)}>
                <Check className="h-3.5 w-3.5" /> I&apos;ve done this — Deploy again
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ---------------- deploying ---------------- */}
        {(step === "deploying" || step === "done") && (
          <div className="space-y-3">
            {step === "done" && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> Published{run.finishedMs ? ` in ${elapsed(run.finishedMs)}` : ""}
                </div>
                {resultUrl && (
                  <div className="flex items-center gap-1.5">
                    <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-900 underline hover:no-underline dark:text-emerald-100">
                      {resultUrl.replace(/^https:\/\//, "")}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      title="Copy URL"
                      onClick={() => void navigator.clipboard?.writeText(resultUrl).then(() => toast.success("URL copied"))}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {resultUrl && (
                    // A real <a target="_blank"> (not window.open) so popup blockers treat it as a link click.
                    <Button asChild size="sm" className="gap-1.5">
                      <a href={resultUrl} target="_blank" rel="noopener noreferrer"><Globe className="h-3.5 w-3.5" /> Open website</a>
                    </Button>
                  )}
                  {run.dashboardUrl && (
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <a href={run.dashboardUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open in Vercel</a>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {step === "deploying" && (
              <div className="flex items-center gap-2 text-xs">
                <StatePill state={run.error && !TERMINAL_STATES.includes(run.state) ? "ERROR" : run.state} />
                {deploying && <span className="tabular-nums text-muted-foreground">{elapsed(now - run.startedAt)}</span>}
                <span className="flex-1" />
                {run.dashboardUrl && (
                  <a href={run.dashboardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground">
                    <ExternalLink className="h-3 w-3" /> Vercel
                  </a>
                )}
              </div>
            )}

            {run.envWarnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                {run.envWarnings.map((w) => (
                  <p key={w.key}><span className="font-mono font-medium">{w.key}</span>: {w.message}</p>
                ))}
              </div>
            )}

            {run.error && step === "deploying" && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{run.error}</span>
              </div>
            )}
            {run.canceled && step === "deploying" && <p className="text-xs text-muted-foreground">The deployment was canceled.</p>}

            <div className="relative">
              <div
                ref={consoleRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
                }}
                className={cn(
                  "overflow-y-auto rounded-md border border-border/60 bg-zinc-950 p-2.5 font-mono text-[11px] leading-relaxed text-zinc-200",
                  step === "done" ? "max-h-40" : "h-64",
                )}
              >
                {logs.length === 0 ? (
                  <p className="flex items-center gap-2 text-zinc-400">
                    {deploying && <Loader2 className="h-3 w-3 animate-spin" />}
                    {deploying ? "Waiting for build output…" : "No build output."}
                  </p>
                ) : (
                  logs.map((l) => (
                    <div key={l.id} className={cn("whitespace-pre-wrap break-words", l.level === "error" && "text-red-300")}>{l.text}</div>
                  ))
                )}
              </div>
              {!follow && logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFollow(true)}
                  className="absolute bottom-2 right-3 inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-100 shadow hover:bg-zinc-700"
                >
                  <ArrowDownToLine className="h-3 w-3" /> Jump to latest
                </button>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              {step === "deploying" && deploying && (
                <>
                  <Button variant="ghost" disabled={!run.deploymentId || canceling} onClick={() => void cancelDeploy()}>
                    {canceling && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Cancel deployment
                  </Button>
                  <Button variant="outline" onClick={runInBackground}>Run in background</Button>
                </>
              )}
              {step === "deploying" && !deploying && (
                <>
                  {lastBody.current && (
                    <Button variant="ghost" className="gap-1.5" onClick={() => setStep("configure")}><ArrowLeft className="h-3.5 w-3.5" /> Settings</Button>
                  )}
                  {lastBody.current && <Button onClick={() => deploy(lastBody.current)}>Try again</Button>}
                  {!lastBody.current && <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}
                </>
              )}
              {step === "done" && <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

function AutoBadge() {
  return (
    <span className="rounded bg-violet-100 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
      Auto-detected
    </span>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  auto,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  auto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium" htmlFor={htmlFor}>{label}</label>
        {auto && <AutoBadge />}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CommandField({
  label,
  placeholder,
  value,
  detected,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  detected: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const id = `vercel-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Field label={label} htmlFor={id} auto={detected !== undefined && value === (detected ?? "")}>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-xs" />
    </Field>
  );
}

function StatePill({ state }: { state: string }) {
  const tone =
    state === "READY"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
      : state === "ERROR"
        ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200"
        : state === "CANCELED"
          ? "bg-muted text-muted-foreground"
          : "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200";
  const active = !TERMINAL_STATES.includes(state);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>
      {active && <Loader2 className="h-3 w-3 animate-spin" />}
      {STATE_LABEL[state] ?? state}
    </span>
  );
}
