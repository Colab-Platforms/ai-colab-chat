"use client";

import { useEffect, useMemo, useState } from "react";
import { SandpackLayout, SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";
import { Loader2, MonitorOff } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";
import { toSandpackSetup } from "../lib/sandpack";

/** Edits are batched: rebuilding the preview on every keystroke is wasted work. */
const PREVIEW_DEBOUNCE_MS = 1200;

/**
 * Runs the project in Sandpack (CodeSandbox's in-browser bundler). The preview
 * lives in a cross-origin iframe, so generated code never touches this app's
 * origin, cookies or token.
 */
export function PreviewPane({ retryKey = 0 }: { retryKey?: number }) {
  const project = useCodeWorkspace((s) => s.project);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const editRevision = useCodeWorkspace((s) => s.editRevision);
  const { theme } = useTheme();
  const [revision, setRevision] = useState(editRevision);

  useEffect(() => {
    const t = setTimeout(() => setRevision(editRevision), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [editRevision]);

  const setup = useMemo(
    () => (project ? toSandpackSetup(codeWorkspace.getAllFiles(), project.framework) : null),
    // `revision` is the trigger: file contents live outside React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project?.id, project?.framework, revision],
  );

  if (!project || !setup) return null;

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        The preview builds as soon as the AI finishes writing.
      </div>
    );
  }

  if (!project.previewable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-muted-foreground">
        <MonitorOff className="h-6 w-6" />
        <p>
          This project can&apos;t run in the browser preview
          {project.framework === "node" || project.framework === "python" ? ` (${project.framework} backend)` : ""}.
        </p>
        <p className="text-xs">Download the ZIP and run it locally.</p>
      </div>
    );
  }

  return (
    <SandpackProvider
      // A template change needs a fresh bundler; file edits update in place.
      // retryKey forces a full remount ("Reload preview") when the bundler's
      // handshake fails and needs recreating from scratch.
      key={`${project.id}-${setup.template}-${retryKey}`}
      template={setup.template}
      files={setup.files}
      theme={theme === "dark" ? "dark" : "light"}
      options={{ recompileMode: "delayed", recompileDelay: 500 }}
      style={{ height: "100%" }}
    >
      <SandpackLayout style={{ height: "100%", border: 0, borderRadius: 0 }}>
        <SandpackPreview
          style={{ height: "100%" }}
          showOpenInCodeSandbox={false}
          // Sandpack's own Restart tries to restart Nodebox's Vite process
          // in place, and can leave the iframe pointed at an ephemeral
          // preview URL the VM already tore down ("page might be down").
          // The header's "Reload preview" (CodePanelHeader) does a full
          // SandpackProvider remount instead — slower, but it always gets a
          // consistent fresh VM + URL, so that's the only reload path we expose.
          showRefreshButton={false}
          showRestartButton={false}
        />
      </SandpackLayout>
    </SandpackProvider>
  );
}
