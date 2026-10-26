"use client";

import { MindmapCanvas } from "./mindmap-canvas";
import { useMindmapEditor } from "./use-mindmap-editor";
import type { MindmapSpec, MindmapThemeTokens } from "./mindmap-types";

/**
 * An editable mind map for one stored document.
 *
 * `initialSpec` seeds the editor ONCE; after that the editor owns the tree, so
 * a refetch of the spec (which happens after a theme change) cannot clobber
 * edits in progress. Render it with `key={documentId}` so opening a different
 * document starts a fresh editor instead of reusing this one's tree.
 */
export function MindmapEditorSurface({
  documentId,
  initialSpec,
  tokens,
  disabled,
  onSaved,
}: {
  documentId: number;
  initialSpec: MindmapSpec;
  tokens: MindmapThemeTokens;
  /** Pauses editing, e.g. while a theme change is re-rendering the file. */
  disabled?: boolean;
  /** Called after each successful save, e.g. to refresh the download link. */
  onSaved?: () => void;
}) {
  const editor = useMindmapEditor(documentId, initialSpec, onSaved);
  return (
    <MindmapCanvas
      spec={editor.spec}
      tokens={tokens}
      editor={editor}
      documentId={documentId}
      disabled={disabled}
    />
  );
}
