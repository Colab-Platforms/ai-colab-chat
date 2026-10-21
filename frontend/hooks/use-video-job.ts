"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { videoService } from "@/lib/services";
import type { GeneratedVideo } from "@/components/chat/video-card";
import { isVideoWorking } from "@/components/studio/video-job-progress";

/**
 * A video outlives any request/response cycle — anywhere from ~20 seconds to
 * a few minutes on the provider's side — and there is no socket or SSE
 * channel for it, so whoever is showing a job owns a poll loop. This is that
 * loop in one place.
 */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 10 * 60 * 1000;

export interface VideoJobState {
  video: GeneratedVideo | null;
  /** True until the first fetch resolves, when the hook had nothing to start from. */
  loading: boolean;
  /** Set when the job could not be loaded at all (deleted, wrong user, network down). */
  error: string | null;
  working: boolean;
  /** The job is still working but has outrun the poll window — we stopped asking. */
  timedOut: boolean;
  /** Fetch once, now. Use after an action that changes the row server-side. */
  refresh: () => Promise<GeneratedVideo | null>;
  /** Swap in a row the caller already has, e.g. the response from a cancel or retry. */
  apply: (video: GeneratedVideo) => void;
}

export function useVideoJob(videoId: number | null, initial?: GeneratedVideo | null): VideoJobState {
  const [video, setVideo] = useState<GeneratedVideo | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const pollStartedAt = useRef(Date.now());
  const working = video ? isVideoWorking(video.status) : false;

  const refresh = useCallback(async (): Promise<GeneratedVideo | null> => {
    if (videoId == null) return null;
    try {
      const res = await videoService.getById(videoId);
      const next: GeneratedVideo | undefined = res.data?.data;
      if (next) {
        setVideo(next);
        setError(null);
        return next;
      }
      return null;
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? "Couldn't load this video");
      return null;
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  // A different job means a fresh poll window — otherwise clicking through a
  // session's history would inherit the first job's elapsed time and give up
  // early on the one the user actually opened.
  useEffect(() => {
    pollStartedAt.current = Date.now();
    setTimedOut(false);
    if (videoId == null) {
      setVideo(null);
      setLoading(false);
      return;
    }
    if (initial && initial.id === videoId) {
      setVideo(initial);
      setLoading(false);
    } else {
      setVideo(null);
      setLoading(true);
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (!working || timedOut) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - pollStartedAt.current > MAX_POLL_MS) {
        clearInterval(timer);
        if (!cancelled) setTimedOut(true);
        return;
      }
      if (!cancelled) await refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [working, timedOut, refresh]);

  const apply = useCallback((next: GeneratedVideo) => {
    pollStartedAt.current = Date.now();
    setTimedOut(false);
    setVideo(next);
  }, []);

  return { video, loading, error, working, timedOut, refresh, apply };
}
