"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Check, CircleDot, Loader2 } from "lucide-react";
import { getRouteUiSnapshot, subscribeRouteUi } from "@/lib/route-ui-store";
import { useDocumentPanel } from "@/context/document-panel-context";
import { cn } from "@/lib/utils";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";
import { CodePanelHeader } from "./CodePanelHeader";
import { FileTree } from "./FileTree";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";

// Monaco and Sandpack are browser-only and heavy — load them with the panel.
const CodeEditor = dynamic(() => import("./CodeEditor").then((m) => m.CodeEditor), { ssr: false });
const PreviewPane = dynamic(() => import("./PreviewPane").then((m) => m.PreviewPane), { ssr: false });

const WIDTH_KEY = "code-workspace:width";
const MIN_WIDTH = 420;
/** Leave at least this much room for the chat column. */
const MIN_CHAT_WIDTH = 380;

function clampWidth(width: number) {
  if (typeof window === "undefined") return width;
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), window.innerWidth - MIN_CHAT_WIDTH - 64));
}

function initialWidth() {
  if (typeof window === "undefined") return 720;
  const stored = Number(localStorage.getItem(WIDTH_KEY));
  return clampWidth(stored > 0 ? stored : window.innerWidth * 0.52);
}

function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true,
  );
}

function StatusBar() {
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const streamingPath = useCodeWorkspace((s) => s.streamingPath);
  const followStream = useCodeWorkspace((s) => s.followStream);
  const fileCount = useCodeWorkspace((s) => Object.keys(s.files).length);
  const saveState = useCodeWorkspace((s) => s.saveState);
  const status = useCodeWorkspace((s) => s.project?.status);
  const truncated = useCodeWorkspace((s) => Object.values(s.files).some((f) => f.truncated));

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border/50 px-3 text-[11px] text-muted-foreground">
      {isGenerating ? (
        <>
          <span className="flex min-w-0 items-center gap-1.5">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-500" />
            <span className="truncate">
              {streamingPath ? (
                <>
                  Writing <span className="font-mono text-foreground/80">{streamingPath}</span>
                </>
              ) : (
                "Planning…"
              )}
            </span>
          </span>
          <span className="shrink-0">{fileCount} files</span>
          <span className="flex-1" />
          {!followStream && (
            <button type="button" className="shrink-0 text-violet-600 hover:underline dark:text-violet-300" onClick={() => codeWorkspace.followStream()}>
              Follow live
            </button>
          )}
          <span className="shrink-0">read-only</span>
        </>
      ) : (
        <>
          {status === "FAILED" ? (
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3 w-3" /> No files were generated
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-emerald-500" /> Ready · {fileCount} files
            </span>
          )}
          {truncated && (
            <span className="flex items-center gap-1 text-amber-600" title="Ask the AI to finish the marked files">
              <AlertTriangle className="h-3 w-3" /> some files were cut off
            </span>
          )}
          <span className="flex-1" />
          <span className="flex shrink-0 items-center gap-1">
            {saveState === "saving" && (
              <>
                <CircleDot className="h-3 w-3" /> Saving…
              </>
            )}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && <span className="text-destructive">Not saved</span>}
          </span>
        </>
      )}
    </div>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const view = useCodeWorkspace((s) => s.view);
  const loading = useCodeWorkspace((s) => s.loading);
  const projectId = useCodeWorkspace((s) => s.project?.id ?? null);
  const hasProject = projectId !== null;
  // Sandpack spins up a whole bundler — only start it once the user actually
  // opens Preview, then keep it alive so toggling back is instant.
  //
  // Deferred one tick on purpose: mounting SandpackProvider synchronously on
  // the same render that opens the panel lands inside React's Strict Mode
  // (dev-only) double-invoke window, which is the single most common trigger
  // for the bundler's "Failed to get shell by ID" handshake failure
  // (codesandbox/sandpack#1108, still open upstream). A one-tick delay is
  // enough for that churn to settle before the bundler's iframe is created.
  const [previewProjectId, setPreviewProjectId] = useState<number | null>(null);
  useEffect(() => {
    if (view !== "preview" || projectId === null || previewProjectId === projectId) return;
    const id = setTimeout(() => setPreviewProjectId(projectId), 0);
    return () => clearTimeout(id);
  }, [view, projectId, previewProjectId]);
  // Sandpack's bundler occasionally fails its first handshake (a known,
  // unresolved upstream issue — codesandbox/sandpack#1108 — more likely on
  // the very first mount in dev, where React Strict Mode double-invokes
  // effects). There's no in-place recovery from that, so "Reload preview"
  // bumps this key to fully unmount and recreate the bundler from scratch.
  const [previewRetryKey, setPreviewRetryKey] = useState(0);
  const reloadPreview = useCallback(() => setPreviewRetryKey((k) => k + 1), []);
  // "Run with Vite" override, per project: a different project starts on the
  // fast engine again.
  const [forceViteFor, setForceViteFor] = useState<number | null>(null);
  const forceVite = projectId !== null && forceViteFor === projectId;
  const setForceVite = useCallback((on: boolean) => setForceViteFor(on ? projectId : null), [projectId]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {hasProject ? (
        <CodePanelHeader onClose={onClose} onReloadPreview={reloadPreview} forceVite={forceVite} />
      ) : (
        <div className="h-12 shrink-0 border-b border-border/50" />
      )}
      <div className="relative flex min-h-0 flex-1">
        {loading && !hasProject ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening project…
          </div>
        ) : (
          <>
            {/* Both views stay mounted so switching is instant and the preview keeps its state. */}
            <div className={cn("min-h-0 min-w-0 flex-1", view === "code" ? "flex" : "hidden")}>
              <div className="w-52 shrink-0 border-r border-border/50 bg-muted/20 max-sm:w-40">
                <FileTree />
              </div>
              <div className="min-w-0 flex-1">
                <CodeEditor />
              </div>
            </div>
            <div className={cn("min-h-0 min-w-0 flex-1", view === "preview" ? "block" : "hidden")}>
              {previewProjectId !== null && previewProjectId === projectId ? (
                // Keyed on retryKey: "Reload preview" must clear a caught
                // crash too, not just remount Sandpack underneath it.
                <PreviewErrorBoundary key={previewRetryKey} onReload={reloadPreview}>
                  <PreviewPane retryKey={previewRetryKey} forceVite={forceVite} onForceViteChange={setForceVite} />
                </PreviewErrorBoundary>
              ) : null}
            </div>
          </>
        )}
      </div>
      <StatusBar />
    </div>
  );
}

/**
 * The right-hand code workspace. Rendered once by ChatLayoutView next to the
 * document panel; opened by the store (a code turn's first SSE event, or the
 * project card in a chat bubble).
 */
export function CodePanel() {
  const isOpen = useCodeWorkspace((s) => s.isOpen);
  const projectChatId = useCodeWorkspace((s) => s.project?.chatId ?? null);
  const activeChatId = useSyncExternalStore(subscribeRouteUi, () => getRouteUiSnapshot().activeChatId, () => null);
  const isDesktop = useIsDesktop();
  const { isOpen: documentOpen, closeDocumentPanel } = useDocumentPanel();

  const [width, setWidth] = useState(initialWidth);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  // The panel belongs to one chat: leaving it closes the panel (and tears
  // down its preview bundler — keeping that alive in the background across
  // unrelated chats is expensive and made the whole app feel sluggish).
  // Coming back after a reload reopens it (see restoreForChat).
  useEffect(() => {
    const { isOpen: open, project } = codeWorkspace.getState();
    if (open && project && project.chatId !== activeChatId) codeWorkspace.close();
    else if (!open) codeWorkspace.restoreForChat(activeChatId);
  }, [activeChatId]);

  // Only one right-hand panel at a time: whichever opened last wins.
  useEffect(() => {
    if (isOpen && documentOpen) closeDocumentPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  useEffect(() => {
    if (documentOpen && codeWorkspace.getState().isOpen) codeWorkspace.close();
  }, [documentOpen]);

  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX));
    const onUp = () => {
      setDragging(false);
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const close = () => codeWorkspace.close();
  const visible = isOpen && projectChatId !== null && projectChatId === activeChatId;

  if (!isDesktop) {
    return (
      <AnimatePresence>
        {visible && (
          <motion.div
            key="code-panel-mobile"
            className="fixed inset-0 z-50 flex flex-col bg-background"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <button
              type="button"
              onClick={close}
              className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/50 px-3 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to chat
            </button>
            <div className="min-h-0 flex-1">
              <PanelBody onClose={close} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <>
      <AnimatePresence initial={false}>
        {visible && (
          <motion.aside
            key="code-panel"
            aria-label="Code workspace"
            className="relative flex shrink-0 overflow-hidden border-l border-border/50 bg-background shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]"
            initial={{ width: 0, opacity: 0.6 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0.6 }}
            transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
          >
            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              onPointerDown={startResize}
              className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-violet-400/40"
            />
            {/* Fixed-width content: the aside's width animates, the content slides in instead of reflowing. */}
            <div className="h-full shrink-0" style={{ width }}>
              <PanelBody onClose={close} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      {/* While dragging, stop the preview iframe from swallowing pointer events. */}
      {dragging && <div className="fixed inset-0 z-[100] cursor-col-resize" />}
    </>
  );
}
