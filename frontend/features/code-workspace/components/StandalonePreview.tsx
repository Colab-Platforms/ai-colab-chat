"use client";

import { useEffect, useMemo, useState } from "react";
import { SandpackLayout, SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";
import { AlertTriangle, Loader2, MonitorOff } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { codeWorkspaceApi } from "../api";
import { toSandpackSetup } from "../lib/sandpack";
import { takePreviewHandoff, type PreviewHandoff } from "../lib/previewHandoff";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unpreviewable" }
  | { kind: "ready"; project: PreviewHandoff };

/**
 * Full-screen preview for the header's "Open in a new tab"
 * (app/code-preview/[id]). It boots its own Sandpack instance: the panel's
 * preview URL (*.nodebox.codesandbox.io) can't be opened directly, because
 * that dev server lives inside the panel page's in-browser VM — a standalone
 * tab gets "Could not connect".
 */
export function StandalonePreview({ projectId }: { projectId: number }) {
  const { theme } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // The panel's snapshot (includes not-yet-autosaved edits), else the saved files.
    const handoff = takePreviewHandoff(projectId);
    const load: Promise<LoadState> = handoff
      ? Promise.resolve({ kind: "ready", project: handoff })
      : codeWorkspaceApi.getProject(projectId).then((p) =>
          p.previewable
            ? { kind: "ready", project: { title: p.title, framework: p.framework, files: p.files } }
            : { kind: "unpreviewable" },
        );
    load.then(
      (next) => !cancelled && setState(next),
      () => !cancelled && setState({ kind: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const project = state.kind === "ready" ? state.project : null;
  const setup = useMemo(
    () => (project ? toSandpackSetup(project.files, project.framework, { forceVite: project.forceVite }) : null),
    [project],
  );

  useEffect(() => {
    if (project) document.title = `${project.title} · Preview`;
  }, [project]);

  if (state.kind === "loading") {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin" /> Loading preview…
      </Centered>
    );
  }
  if (state.kind === "error") {
    return (
      <Centered>
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        Couldn&apos;t open this project. It may have been deleted, or you may need to log in again.
      </Centered>
    );
  }
  if (state.kind === "unpreviewable" || !setup) {
    return (
      <Centered>
        <MonitorOff className="h-6 w-6" />
        This project can&apos;t run in the browser preview. Download the ZIP and run it locally.
      </Centered>
    );
  }

  return (
    <div className="h-dvh w-screen bg-background">
      <PreviewErrorBoundary key={retryKey} onReload={() => setRetryKey((k) => k + 1)}>
        <SandpackProvider
          key={`${setup.template}-${retryKey}`}
          template={setup.template}
          files={setup.files}
          theme={theme === "dark" ? "dark" : "light"}
          options={{ externalResources: setup.externalResources }}
          style={{ height: "100%" }}
        >
          <SandpackLayout style={{ height: "100%", border: 0, borderRadius: 0 }}>
            {/* Same reasoning as PreviewPane for hiding the native buttons. */}
            <SandpackPreview
              style={{ height: "100%" }}
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
              showRestartButton={false}
            />
          </SandpackLayout>
        </SandpackProvider>
      </PreviewErrorBoundary>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
