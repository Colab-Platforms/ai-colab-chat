import { useEffect, useRef, useState } from "react";

interface TimedResponse {
  id: number;
  status: string;
  createdAt?: string;
  completedAt?: string | null;
}

/**
 * Seconds a model took to answer, as "14.2s" (or null while unknown).
 *
 * Saved responses carry createdAt/completedAt, so the figure survives a
 * reload. A response streamed live in this tab has no completedAt until the
 * next server sync, so the time is measured locally from when it was first
 * seen streaming until it completed.
 */
export function useResponseLatency(resp?: TimedResponse | null): string | null {
  const startRef = useRef<number | null>(null);
  const [liveSeconds, setLiveSeconds] = useState<number | null>(null);

  const status = resp?.status;
  useEffect(() => {
    if (status === "STREAMING" || status === "PENDING") {
      if (startRef.current === null) startRef.current = Date.now();
    } else if (status === "COMPLETED" && startRef.current !== null) {
      setLiveSeconds((Date.now() - startRef.current) / 1000);
      startRef.current = null;
    }
  }, [status]);

  if (!resp || resp.status !== "COMPLETED") return null;

  if (resp.createdAt && resp.completedAt) {
    const seconds = (new Date(resp.completedAt).getTime() - new Date(resp.createdAt).getTime()) / 1000;
    if (Number.isFinite(seconds) && seconds >= 0) return `${seconds.toFixed(1)}s`;
  }
  return liveSeconds !== null ? `${liveSeconds.toFixed(1)}s` : null;
}
