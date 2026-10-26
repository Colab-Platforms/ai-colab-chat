"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { documentService } from "@/lib/services";
import { registerMindmapFlush } from "./mindmap-autosave-registry";
import type { MindmapSpec } from "./mindmap-types";

/** Edits are sent after this long with no further edits. */
export const AUTOSAVE_DELAY_MS = 5000;
/** A save that hit "still updating" (409) is retried after this. */
const CONFLICT_RETRY_MS = 3000;
const MAX_HISTORY = 100;

interface EditorState {
  spec: MindmapSpec;
  past: MindmapSpec[];
  future: MindmapSpec[];
  /** Bumped by every change; compared with the last saved rev to know if we're dirty. */
  rev: number;
}

type EditorAction =
  | { type: "commit"; spec: MindmapSpec }
  | { type: "undo" }
  | { type: "redo" };

const reducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case "commit":
      if (action.spec === state.spec) return state;
      return {
        spec: action.spec,
        past: [...state.past, state.spec].slice(-MAX_HISTORY),
        future: [],
        rev: state.rev + 1,
      };
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        spec: previous,
        past: state.past.slice(0, -1),
        future: [state.spec, ...state.future],
        rev: state.rev + 1,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        spec: next,
        past: [...state.past, state.spec],
        future: state.future.slice(1),
        rev: state.rev + 1,
      };
    }
  }
};

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

/**
 * Editing state for one mind map: the tree, undo/redo, and autosave.
 *
 * Undo history is per open session only (it lives in memory); what is saved is
 * always the whole current tree, so a dropped or repeated request can never
 * leave the server holding a half-applied sequence of edits.
 */
export function useMindmapEditor(
  documentId: number,
  initialSpec: MindmapSpec,
  onSaved?: () => void,
) {
  const [state, dispatch] = useReducer(reducer, {
    spec: initialSpec,
    past: [],
    future: [],
    rev: 0,
  });
  const [savedRev, setSavedRev] = useState(0);
  const [phase, setPhase] = useState<"idle" | "saving" | "error">("idle");
  const [everSaved, setEverSaved] = useState(false);

  // Latest values for callbacks that outlive a render (timers, unload handlers).
  const latest = useRef({ spec: state.spec, rev: state.rev });
  const savedRevRef = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  // The latest `save`, so its own retry timer and the flush points below always
  // call the current one rather than a stale closure.
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    latest.current = { spec: state.spec, rev: state.rev };
    onSavedRef.current = onSaved;
  }, [state.spec, state.rev, onSaved]);

  const dirty = state.rev !== savedRev;

  const save = useCallback(async (): Promise<void> => {
    // One request at a time, so two saves can never land out of order.
    if (inFlight.current) await inFlight.current;

    const { spec, rev } = latest.current;
    if (rev === savedRevRef.current) return;

    setPhase("saving");
    const request = documentService
      .updateSpec(documentId, spec)
      .then(() => {
        savedRevRef.current = rev;
        setSavedRev(rev);
        setEverSaved(true);
        setPhase("idle");
        onSavedRef.current?.();
      })
      .catch((error: { response?: { status?: number } }) => {
        if (error?.response?.status === 409) {
          // The server is mid re-render (theme/title change). Keep the edit
          // and try again shortly; this is not a failure.
          setPhase("idle");
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(
            () => void saveRef.current(),
            CONFLICT_RETRY_MS,
          );
        } else {
          setPhase("error");
        }
      });
    inFlight.current = request;
    await request;
    inFlight.current = null;
  }, [documentId]);

  // Debounce: every new edit (rev) restarts the countdown.
  useEffect(() => {
    if (state.rev === savedRev) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.rev, savedRev, save]);

  // Flush points: chat composer, closing/switching the panel, and leaving the page.
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    const unregister = registerMindmapFlush(() => saveRef.current());

    const flushOnHide = () => {
      if (latest.current.rev === savedRevRef.current) return;
      // `keepalive` lets the request outlive the page; a normal request is
      // cancelled by the browser as the tab closes.
      try {
        const token = localStorage.getItem("token");
        void fetch(`${API_BASE_URL}/documents/${documentId}/spec`, {
          method: "PUT",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ spec: latest.current.spec }),
        });
      } catch {
        /* nothing more can be done while the page is going away */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void saveRef.current();
    };

    window.addEventListener("pagehide", flushOnHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushOnHide);
      document.removeEventListener("visibilitychange", onVisibility);
      unregister();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      // Panel closed or another document opened: don't strand pending edits.
      void saveRef.current();
    };
  }, [documentId]);

  const status: SaveStatus =
    phase === "saving"
      ? "saving"
      : phase === "error"
        ? "error"
        : dirty
          ? "dirty"
          : everSaved
            ? "saved"
            : "clean";

  return {
    spec: state.spec,
    status,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit: useCallback((spec: MindmapSpec) => dispatch({ type: "commit", spec }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    /** Saves now (and retries after an error). */
    flush: save,
  };
}

export type MindmapEditor = ReturnType<typeof useMindmapEditor>;
