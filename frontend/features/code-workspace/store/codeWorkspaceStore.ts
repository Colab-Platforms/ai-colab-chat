import { useSyncExternalStore } from "react";
import { toast } from "@/lib/toast";
import { codeWorkspaceApi } from "../api";
import { languageFromPath } from "../lib/language";
import type {
  CodeFileMeta,
  CodeProjectDto,
  CodeProjectInfo,
  CodeStreamEvent,
  CodeView,
} from "../types";

/**
 * One code workspace per app shell (same idea as the document panel).
 *
 * Streaming performance is the whole design here: a project arrives as
 * thousands of tiny deltas. File *content* is therefore kept outside React
 * state in `contents`, and deltas are pushed straight to the Monaco editor
 * through `subscribeDeltas` — no re-render per token. React state (`state`)
 * only changes on structural events: a file starts/ends, the panel opens,
 * the view toggles, a save finishes.
 */

export interface CodeWorkspaceState {
  isOpen: boolean;
  project: CodeProjectInfo | null;
  files: Record<string, CodeFileMeta>;
  activePath: string | null;
  /** While generating, the editor follows the file being written until the user picks one. */
  followStream: boolean;
  view: CodeView;
  isGenerating: boolean;
  streamingPath: string | null;
  loading: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  /** Bumped when content changes by anything other than stream deltas or typing (load, restore). */
  contentRevision: number;
  /** Bumped on every content change — drives the (debounced) preview refresh. */
  editRevision: number;
}

type DeltaListener = (path: string, chunk: string, reset: boolean) => void;

const SESSION_KEY = "code-workspace:last-open";
const SAVE_DEBOUNCE_MS = 900;

let state: CodeWorkspaceState = {
  isOpen: false,
  project: null,
  files: {},
  activePath: null,
  followStream: true,
  view: "code",
  isGenerating: false,
  streamingPath: null,
  loading: false,
  saveState: "idle",
  contentRevision: 0,
  editRevision: 0,
};

const contents = new Map<string, string>();
const listeners = new Set<() => void>();
const deltaListeners = new Set<DeltaListener>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Paths the current AI turn has written — a late project fetch must not clobber them. */
let turnTouched = new Set<string>();
let loadSeq = 0;

/** Server message from an axios error, else the fallback. */
function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}

function set(patch: Partial<CodeWorkspaceState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function emitDelta(path: string, chunk: string, reset: boolean) {
  for (const l of deltaListeners) l(path, chunk, reset);
}

function rememberOpen(project: CodeProjectInfo | null) {
  try {
    if (project) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ projectId: project.id, chatId: project.chatId }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // storage disabled — the panel just won't survive a reload
  }
}

/** Entry file a user most likely wants to see first. */
function pickDefaultPath(paths: string[]): string | null {
  const preferred = [/^src\/App\.[jt]sx?$/, /^src\/App\.vue$/, /^index\.html$/, /^src\/main\.[jt]sx?$/, /^app\.py$/, /^(src\/)?(index|server|app)\.[jt]s$/];
  for (const re of preferred) {
    const hit = paths.find((p) => re.test(p));
    if (hit) return hit;
  }
  return paths[0] ?? null;
}

function toInfo(dto: CodeProjectDto): CodeProjectInfo {
  return {
    id: dto.id,
    chatId: dto.chatId,
    title: dto.title,
    framework: dto.framework,
    previewable: dto.previewable,
    currentVersion: dto.currentVersion,
    status: dto.status,
  };
}

/** Replaces everything with a fetched project (open / reload / restore). */
function applyProject(dto: CodeProjectDto, opts: { keepActive?: boolean } = {}) {
  contents.clear();
  const files: Record<string, CodeFileMeta> = {};
  for (const f of dto.files) {
    contents.set(f.path, f.content);
    files[f.path] = { path: f.path, language: f.language, status: "done" };
  }
  const paths = Object.keys(files);
  const activePath =
    opts.keepActive && state.activePath && files[state.activePath] ? state.activePath : pickDefaultPath(paths);
  set({
    project: toInfo(dto),
    files,
    activePath,
    loading: false,
    isGenerating: dto.status === "GENERATING" && state.isGenerating,
    contentRevision: state.contentRevision + 1,
    editRevision: state.editRevision + 1,
  });
}

async function loadProject(projectId: number): Promise<boolean> {
  const seq = ++loadSeq;
  set({ loading: true });
  try {
    const dto = await codeWorkspaceApi.getProject(projectId);
    if (seq !== loadSeq) return false;
    if (state.isGenerating && state.project?.id === projectId) {
      // An AI edit is streaming into this project right now — fill in only
      // the files it has not rewritten yet.
      const files = { ...state.files };
      for (const f of dto.files) {
        if (turnTouched.has(f.path)) continue;
        contents.set(f.path, f.content);
        files[f.path] = { path: f.path, language: f.language, status: "done" };
      }
      set({ files, loading: false, contentRevision: state.contentRevision + 1 });
    } else {
      applyProject(dto);
    }
    return true;
  } catch (error) {
    if (seq === loadSeq) set({ loading: false });
    toast.error(errorMessage(error, "Could not open the project"));
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Saving manual edits
 * ------------------------------------------------------------------ */

async function saveNow(path: string) {
  saveTimers.delete(path);
  const project = state.project;
  if (!project || !state.files[path]) return;
  set({ saveState: "saving" });
  try {
    await codeWorkspaceApi.saveFile(project.id, path, contents.get(path) ?? "");
    if (saveTimers.size === 0) set({ saveState: "saved" });
  } catch (error) {
    set({ saveState: "error" });
    toast.error(errorMessage(error, `Could not save ${path}`));
  }
}

function flushSaves() {
  for (const [path, timer] of saveTimers) {
    clearTimeout(timer);
    void saveNow(path);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushSaves);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export const codeWorkspace = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Raw content stream for the editor: (path, chunk, reset). */
  subscribeDeltas(listener: DeltaListener) {
    deltaListeners.add(listener);
    return () => {
      deltaListeners.delete(listener);
    };
  },

  getContent: (path: string) => contents.get(path) ?? "",

  getAllFiles: () =>
    Object.keys(state.files)
      .sort()
      .map((path) => ({ path, content: contents.get(path) ?? "" })),

  /** Opens the panel on a project, fetching it unless it is already loaded. */
  async open(projectId: number, opts: { focusPath?: string } = {}) {
    if (state.project?.id !== projectId) {
      flushSaves();
      set({ isOpen: true, view: "code" });
      const ok = await loadProject(projectId);
      if (!ok) {
        set({ isOpen: false });
        return;
      }
    } else {
      set({ isOpen: true });
    }
    if (opts.focusPath && state.files[opts.focusPath]) set({ activePath: opts.focusPath });
    rememberOpen(state.project);
  },

  close() {
    flushSaves();
    set({ isOpen: false });
    rememberOpen(null);
  },

  /** Reopens the panel after a page reload if it was open on this chat. */
  restoreForChat(chatId: number | null) {
    if (chatId === null || state.isOpen) return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.chatId === chatId && typeof saved.projectId === "number") {
        void codeWorkspace.open(saved.projectId);
      }
    } catch {
      // ignore malformed storage
    }
  },

  setView: (view: CodeView) => set({ view }),

  /** User picked a file. While generating, this stops the editor from auto-following the stream. */
  selectFile(path: string) {
    if (!state.files[path]) return;
    set({ activePath: path, followStream: state.isGenerating ? path === state.streamingPath : true, view: "code" });
  },

  followStream() {
    set({ followStream: true, activePath: state.streamingPath ?? state.activePath });
  },

  /** Typing in the editor. Debounced autosave per file. */
  updateFromEditor(path: string, value: string) {
    if (!state.project || state.isGenerating || contents.get(path) === value) return;
    contents.set(path, value);
    set({ editRevision: state.editRevision + 1, saveState: "saving" });
    const existing = saveTimers.get(path);
    if (existing) clearTimeout(existing);
    saveTimers.set(
      path,
      setTimeout(() => void saveNow(path), SAVE_DEBOUNCE_MS),
    );
  },

  async createFile(rawPath: string) {
    const project = state.project;
    const path = rawPath.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
    if (!project || !path) return;
    if (state.files[path]) {
      toast.error(`${path} already exists`);
      return;
    }
    try {
      await codeWorkspaceApi.saveFile(project.id, path, "");
      contents.set(path, "");
      set({
        files: { ...state.files, [path]: { path, language: languageFromPath(path), status: "done" } },
        activePath: path,
        view: "code",
        editRevision: state.editRevision + 1,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Could not create the file"));
    }
  },

  /** Deletes a file, or a folder and everything under it. */
  async deletePath(path: string) {
    const project = state.project;
    if (!project) return;
    try {
      await codeWorkspaceApi.deleteFile(project.id, path);
      const files = { ...state.files };
      for (const p of Object.keys(files)) {
        if (p === path || p.startsWith(`${path}/`)) {
          delete files[p];
          contents.delete(p);
          const timer = saveTimers.get(p);
          if (timer) clearTimeout(timer);
          saveTimers.delete(p);
        }
      }
      const activePath = state.activePath && files[state.activePath] ? state.activePath : pickDefaultPath(Object.keys(files));
      set({ files, activePath, editRevision: state.editRevision + 1 });
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete"));
    }
  },

  /** Renames a file or a folder. */
  async renamePath(from: string, rawTo: string) {
    const project = state.project;
    const to = rawTo.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
    if (!project || !to || to === from) return;
    flushSaves();
    try {
      await codeWorkspaceApi.renameFile(project.id, from, to);
      const files: Record<string, CodeFileMeta> = {};
      let activePath = state.activePath;
      for (const [p, meta] of Object.entries(state.files)) {
        if (p === from || p.startsWith(`${from}/`)) {
          const next = to + p.slice(from.length);
          contents.set(next, contents.get(p) ?? "");
          contents.delete(p);
          files[next] = { ...meta, path: next, language: languageFromPath(next) };
          if (activePath === p) activePath = next;
        } else {
          files[p] = meta;
        }
      }
      set({ files, activePath, contentRevision: state.contentRevision + 1, editRevision: state.editRevision + 1 });
    } catch (error) {
      toast.error(errorMessage(error, "Could not rename"));
    }
  },

  async restoreVersion(version: number) {
    const project = state.project;
    if (!project) return;
    flushSaves();
    try {
      const dto = await codeWorkspaceApi.restoreVersion(project.id, version);
      applyProject(dto, { keepActive: true });
      toast.success(`Restored version ${version}`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not restore that version"));
    }
  },

  /** Re-fetches the project after the server rewrote its files (e.g. a GitHub pull). */
  async reloadFromServer() {
    const project = state.project;
    if (!project) return;
    flushSaves();
    try {
      applyProject(await codeWorkspaceApi.getProject(project.id), { keepActive: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not refresh the project"));
    }
  },

  /**
   * Re-reads only the project's metadata — e.g. currentVersion after the server
   * snapshotted the user's edits for a Vercel publish. File contents are left
   * alone, so it is safe while the user is still typing.
   */
  async refreshProjectInfo() {
    const project = state.project;
    if (!project || state.isGenerating) return;
    try {
      const dto = await codeWorkspaceApi.getProject(project.id);
      if (state.project?.id === dto.id && !state.isGenerating) set({ project: toInfo(dto) });
    } catch {
      // Decoration only — the version chip catches up on the next load.
    }
  },

  async renameProject(title: string) {
    const project = state.project;
    const next = title.trim();
    if (!project || !next || next === project.title) return;
    set({ project: { ...project, title: next } });
    try {
      await codeWorkspaceApi.renameProject(project.id, next);
    } catch {
      set({ project });
      toast.error("Could not rename the project");
    }
  },

  /**
   * Feeds one SSE event from the chat stream into the workspace.
   * `chatId` is the chat the stream belongs to.
   */
  applyStreamEvent(event: CodeStreamEvent, chatId: number) {
    switch (event.type) {
      case "code_project": {
        flushSaves();
        turnTouched = new Set();
        const info: CodeProjectInfo = {
          id: event.projectId,
          chatId,
          title: event.title,
          framework: event.framework,
          previewable: event.previewable,
          currentVersion: event.version,
          status: "GENERATING",
        };
        const sameProject = state.project?.id === event.projectId;
        if (event.isNew || !sameProject) {
          contents.clear();
          loadSeq++; // cancel any in-flight fetch of another project
          set({
            project: info,
            files: {},
            activePath: null,
            isOpen: true,
            view: "code",
            isGenerating: true,
            followStream: true,
            streamingPath: null,
            contentRevision: state.contentRevision + 1,
          });
          // Editing a project this tab has not loaded: fetch the files the AI
          // won't rewrite, merged around whatever streams in meanwhile.
          if (!event.isNew) void loadProject(event.projectId);
        } else {
          set({ project: info, isOpen: true, view: "code", isGenerating: true, followStream: true, streamingPath: null });
        }
        rememberOpen(info);
        return;
      }
      case "code_file_start": {
        const { path, language } = event;
        turnTouched.add(path);
        contents.set(path, "");
        emitDelta(path, "", true);
        set({
          files: { ...state.files, [path]: { path, language, status: "streaming" } },
          streamingPath: path,
          activePath: state.followStream || !state.activePath ? path : state.activePath,
        });
        return;
      }
      case "code_file_delta": {
        const { path, content } = event;
        contents.set(path, (contents.get(path) ?? "") + content);
        emitDelta(path, content, false);
        return;
      }
      case "code_file_end": {
        const meta = state.files[event.path];
        if (!meta) return;
        set({
          files: { ...state.files, [event.path]: { ...meta, status: "done", truncated: !!event.truncated } },
          streamingPath: state.streamingPath === event.path ? null : state.streamingPath,
        });
        return;
      }
      case "code_file_delete": {
        turnTouched.add(event.path);
        contents.delete(event.path);
        const files = { ...state.files };
        delete files[event.path];
        set({
          files,
          activePath: state.activePath === event.path ? pickDefaultPath(Object.keys(files)) : state.activePath,
        });
        return;
      }
      case "code_done": {
        if (state.project?.id !== event.projectId) return;
        set({
          isGenerating: false,
          streamingPath: null,
          followStream: true,
          project: {
            ...state.project,
            status: event.failed ? "FAILED" : "READY",
            currentVersion: event.version ?? state.project.currentVersion,
          },
          editRevision: state.editRevision + 1,
        });
        // previewable is recomputed server-side from the files actually written.
        void codeWorkspaceApi
          .getProject(event.projectId)
          .then((dto) => {
            if (state.project?.id === dto.id && !state.isGenerating) {
              set({ project: { ...state.project, previewable: dto.previewable, title: dto.title } });
            }
          })
          .catch(() => {});
        return;
      }
      case "code_plan":
        return; // shown in the chat bubble, not in the panel
    }
  },

  /** The chat stream ended without code_done (network drop, stop before start). */
  endStream() {
    if (!state.isGenerating) return;
    const files = { ...state.files };
    for (const [p, meta] of Object.entries(files)) {
      if (meta.status === "streaming") files[p] = { ...meta, status: "done", truncated: true };
    }
    set({
      isGenerating: false,
      streamingPath: null,
      files,
      project: state.project ? { ...state.project, status: "READY" } : null,
    });
    // Reload the saved state so the editor matches what the server kept.
    if (state.project) void loadProject(state.project.id);
  },
};

/** Subscribe to a slice of the workspace state. The selector must return a stable value. */
export function useCodeWorkspace<T>(selector: (s: CodeWorkspaceState) => T): T {
  return useSyncExternalStore(
    codeWorkspace.subscribe,
    () => selector(state),
    () => selector(state),
  );
}
