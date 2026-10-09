"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCodeWorkspace } from "../store/codeWorkspaceStore";
import { githubApi } from "./api";
import type { GithubStatusDto } from "./types";

const POLL_MS = 2000;
/**
 * After an AI turn finishes the server pushes in the background, and the push
 * may not have flipped `syncState` to SYNCING yet when we first ask. Keep
 * polling for a short window so the commit still shows up without a reload.
 */
const POST_TURN_POLL_MS = 12_000;

export function useGithubStatus() {
  const projectId = useCodeWorkspace((s) => s.project?.id ?? null);
  const currentVersion = useCodeWorkspace((s) => s.project?.currentVersion ?? 0);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const saveState = useCodeWorkspace((s) => s.saveState);

  const [status, setStatus] = useState<GithubStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const pollUntil = useRef(0);
  const requestSeq = useRef(0);
  const lastProject = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (projectId === null) return;
    const seq = ++requestSeq.current;
    try {
      const next = await githubApi.getStatus(projectId);
      // A slower, older response must not overwrite a newer one (or another project's).
      if (seq === requestSeq.current) setStatus(next);
    } catch {
      // Status is decoration: a failed fetch hides nothing and must never surface as an error.
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [projectId]);

  /** Poll for a while — call after an action that kicks off background work. */
  const pollSoon = useCallback(() => {
    pollUntil.current = Date.now() + POST_TURN_POLL_MS;
  }, []);

  // New project → forget the previous project's link immediately.
  useEffect(() => {
    if (lastProject.current !== projectId) {
      lastProject.current = projectId;
      setStatus(null);
      setLoading(true);
    }
  }, [projectId]);

  // Refetch on: project open, AI turn end (version bump / generating → idle), editor save (dirty flag).
  useEffect(() => {
    if (isGenerating) return;
    void refresh();
  }, [refresh, isGenerating, currentVersion, saveState === "saved"]); // eslint-disable-line react-hooks/exhaustive-deps

  // A finished AI turn triggers a background push — poll briefly to catch it.
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (wasGenerating.current && !isGenerating) pollSoon();
    wasGenerating.current = isGenerating;
  }, [isGenerating, pollSoon]);

  const syncing = status?.link?.syncState === "SYNCING";
  useEffect(() => {
    if (isGenerating || !status?.configured) return;
    const shouldPoll = syncing || Date.now() < pollUntil.current;
    if (!shouldPoll) return;
    const timer = setTimeout(() => void refresh(), POLL_MS);
    return () => clearTimeout(timer);
  }, [status, syncing, isGenerating, refresh]);

  return { status, loading, refresh, pollSoon, projectId };
}
