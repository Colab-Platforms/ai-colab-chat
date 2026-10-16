"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCodeWorkspace } from "../store/codeWorkspaceStore";
import { vercelApi } from "./api";
import type { VercelStatusDto } from "./types";

const POLL_MS = 2000;
/** After an action that starts background work, keep polling briefly so it shows up. */
const AFTER_ACTION_POLL_MS = 8_000;

/**
 * Mirrors ../github/useGithubStatus.ts, minus the post-AI-turn polling: nothing
 * deploys on an AI turn, so there is nothing to catch afterwards. Polls while a
 * deployment is in flight — including one the user walked away from.
 */
export function useVercelStatus() {
  const projectId = useCodeWorkspace((s) => s.project?.id ?? null);
  const currentVersion = useCodeWorkspace((s) => s.project?.currentVersion ?? 0);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const saveState = useCodeWorkspace((s) => s.saveState);

  const [status, setStatus] = useState<VercelStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const pollUntil = useRef(0);
  const requestSeq = useRef(0);
  const lastProject = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (projectId === null) return;
    const seq = ++requestSeq.current;
    try {
      const next = await vercelApi.getStatus(projectId);
      // A slower, older response must not overwrite a newer one (or another project's).
      if (seq === requestSeq.current) setStatus(next);
    } catch {
      // Status is decoration: a failed fetch hides nothing and must never surface as an error.
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [projectId]);

  const pollSoon = useCallback(() => {
    pollUntil.current = Date.now() + AFTER_ACTION_POLL_MS;
  }, []);

  // New project → forget the previous project's link immediately.
  useEffect(() => {
    if (lastProject.current !== projectId) {
      lastProject.current = projectId;
      setStatus(null);
      setLoading(true);
    }
  }, [projectId]);

  // Refetch on: project open, AI turn end (version bump), editor save (dirty flag → amber dot).
  useEffect(() => {
    if (isGenerating) return;
    void refresh();
  }, [refresh, isGenerating, currentVersion, saveState === "saved"]); // eslint-disable-line react-hooks/exhaustive-deps

  const deploying = !!status?.activeDeployment;
  useEffect(() => {
    if (!status?.configured) return;
    const shouldPoll = deploying || Date.now() < pollUntil.current;
    if (!shouldPoll) return;
    const timer = setTimeout(() => void refresh(), POLL_MS);
    return () => clearTimeout(timer);
  }, [status, deploying, refresh]);

  return { status, loading, refresh, pollSoon, projectId };
}
