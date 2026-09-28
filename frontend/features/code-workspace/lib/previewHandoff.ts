/**
 * Hands the panel's *current* files to the full-screen preview tab
 * (/code-preview/[id]). Autosave is debounced, so reading from the API alone
 * could miss the last second of edits; the new tab takes this snapshot first
 * and falls back to the API (e.g. on a later refresh of that tab).
 *
 * localStorage, not sessionStorage: a `target="_blank" rel="noopener"` tab
 * starts with an empty sessionStorage. The entry is consumed on read.
 */

export interface PreviewHandoff {
  title: string;
  framework: string;
  files: { path: string; content: string }[];
}

const key = (projectId: number) => `code-workspace:preview:${projectId}`;

export function writePreviewHandoff(projectId: number, data: PreviewHandoff) {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(data));
  } catch {
    // Quota/private mode: the preview tab just loads the saved files instead.
  }
}

// Consumed entries, kept for this page load: Strict Mode runs the reading
// effect twice, and the second run must not fall back to (older) API files.
const taken = new Map<number, PreviewHandoff>();

export function takePreviewHandoff(projectId: number): PreviewHandoff | null {
  const cached = taken.get(projectId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    localStorage.removeItem(key(projectId));
    const data = JSON.parse(raw) as PreviewHandoff;
    taken.set(projectId, data);
    return data;
  } catch {
    return null;
  }
}
