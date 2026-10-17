"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { documentService } from "@/lib/services";
import type { MindmapSpec, MindmapThemeTokens } from "./mindmap/mindmap-types";
import { MindmapEditorSurface } from "./mindmap/mindmap-editor-surface";
import { flushMindmapEdits } from "./mindmap/mindmap-autosave-registry";
import { useDocumentPanel } from "@/context/document-panel-context";
import {
  DocumentSpecRenderer,
  type AnySpec,
  type SpecKind,
  type ThemeTokens,
  type PptxTemplateTokens,
} from "./document-spec-renderer";

const THEMES: Array<{ value: string; label: string }> = [
  { value: "professional", label: "Professional" },
  { value: "minimal", label: "Minimal" },
  { value: "report", label: "Report" },
];

// PPTX-only a deck gets its own richer templates (fonts, decoration, photo
// layouts) rather than the flat document themes above. Keys must match
// backend/src/modules/document/document.pptxTemplates.ts.
const PPTX_TEMPLATES: Array<{ value: string; label: string }> = [
  { value: "corporate", label: "Corporate" },
  { value: "aurora", label: "Aurora" },
  { value: "sunset", label: "Sunset" },
  { value: "emerald", label: "Emerald" },
  { value: "mono", label: "Mono" },
];

// Mind-map-only palettes. Keys must match MINDMAP_THEMES in
// backend/src/modules/document/document.types.ts.
const MINDMAP_THEME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "vibrant", label: "Vibrant" },
  { value: "ocean", label: "Ocean" },
  { value: "autumn", label: "Autumn" },
  { value: "midnight", label: "Midnight" },
];

const POLL_INTERVAL_MS = 2000;
const FILE_REFRESH_DELAY_MS = 6000;

interface SpecPayload {
  /** Which document this spec was fetched for; see the guard where it is rendered. */
  forDocumentId: number;
  format: string;
  specKind: SpecKind;
  spec: AnySpec;
  theme: string;
  themeTokens: ThemeTokens | PptxTemplateTokens | MindmapThemeTokens;
}

/**
 * The right-hand preview/edit panel. Renders whatever `useDocumentPanel`
 * currently points at, refetching the spec whenever the active document
 * changes or a re-render (theme/title edit) completes.
 */
export function DocumentPanel() {
  const { isOpen, activeDocument, closeDocumentPanel, updateActiveDocument } =
    useDocumentPanel();

  const [payload, setPayload] = useState<SpecPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRendering =
    activeDocument?.status === "PENDING" || activeDocument?.status === "PROCESSING";

  const loadSpec = useCallback(async (id: number) => {
    try {
      const res = await documentService.getSpec(id);
      if (res.data?.data) {
        setPayload({ ...res.data.data, forDocumentId: id });
        setLoadError(null);
      }
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || "Couldn't load this document's content.");
    }
  }, []);

  useEffect(() => {
    if (!activeDocument) return;
    setTitleDraft(activeDocument.title);
    if (activeDocument.status === "COMPLETED") {
      void loadSpec(activeDocument.id);
    }
  }, [activeDocument?.id, activeDocument?.status, loadSpec]);

  // While a style edit is re-rendering, poll the document itself (same
  // pattern as DocumentCard) so the panel notices when it's COMPLETED again.
  useEffect(() => {
    if (!activeDocument || !isRendering) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await documentService.getById(activeDocument.id);
        if (!cancelled && res.data?.data) updateActiveDocument(res.data.data);
      } catch {
        // next tick retries
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeDocument, isRendering, updateActiveDocument]);

  if (!isOpen || !activeDocument) return null;

  // The download link points at the rendered file, which is refreshed in the
  // background after a manual edit. Re-read the document a little later so the
  // header's Open/Download buttons stop serving the pre-edit file.
  const refreshFileLink = (id: number) => {
    if (fileRefreshTimer.current) clearTimeout(fileRefreshTimer.current);
    fileRefreshTimer.current = setTimeout(async () => {
      try {
        const res = await documentService.getById(id);
        if (res.data?.data) updateActiveDocument(res.data.data);
      } catch {
        /* the link just stays on the previous file */
      }
    }, FILE_REFRESH_DELAY_MS);
  };

  const applyStyleChange = async (patch: { title?: string; theme?: string }) => {
    // A theme/title change re-renders from the STORED map, so unsaved edits
    // must reach the server first or the re-render would drop them.
    await flushMindmapEdits();
    documentService
      .updateStyle(activeDocument.id, patch)
      .then((res) => {
        if (res.data?.data) updateActiveDocument(res.data.data);
      })
      .catch(() => {
        /* keep the current preview visible; the user can retry the edit */
      });
  };

  const handleTitleChange = (value: string) => {
    setTitleDraft(value);
    if (titleDebounce.current) clearTimeout(titleDebounce.current);
    titleDebounce.current = setTimeout(() => {
      if (value.trim() && value.trim() !== activeDocument.title) {
        applyStyleChange({ title: value.trim() });
      }
    }, 500);
  };

  const extension = activeDocument.format.toLowerCase();

  return (
    <div className="hidden md:flex w-[800px] shrink-0 flex-col border-l border-border/50 bg-background">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Input
          value={titleDraft}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="h-8 border-none px-1 text-sm font-medium shadow-none focus-visible:ring-1"
        />
        {payload && (
          <Select value={payload.theme} onValueChange={(value) => applyStyleChange({ theme: value })}>
            <SelectTrigger size="sm" className="h-8 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(payload.specKind === "presentation"
                ? PPTX_TEMPLATES
                : payload.specKind === "mindmap"
                  ? MINDMAP_THEME_OPTIONS
                  : THEMES
              ).map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {activeDocument.fileUrl && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0"
              title="Open in a new tab"
              onClick={() => window.open(activeDocument.fileUrl!, "_blank", "noopener")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0"
              title="Download"
              onClick={() => {
                const link = window.document.createElement("a");
                link.href = activeDocument.fileUrl!;
                link.download = activeDocument.fileName || `${activeDocument.title}.${extension}`;
                link.rel = "noopener";
                link.target = "_blank";
                link.click();
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          title="Close"
          onClick={closeDocumentPanel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        className={`relative flex-1 bg-white ${
          payload?.specKind === "mindmap" ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {isRendering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground backdrop-blur-[1px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating the {activeDocument.format}…
          </div>
        )}

        {activeDocument.status === "FAILED" && (
          <div className="p-6 text-sm text-destructive">
            {activeDocument.lastError || "This document failed to generate."}
          </div>
        )}

        {loadError && <div className="p-6 text-sm text-destructive">{loadError}</div>}

        {payload &&
          !loadError &&
          payload.specKind === "mindmap" &&
          // The payload can briefly belong to the PREVIOUS document while the
          // new one loads. An editor seeded from it would let the user edit,
          // and save, the wrong map onto this document.
          payload.forDocumentId === activeDocument.id && (
            // Full-bleed and editable: the canvas owns its own pan/zoom, so it
            // must not sit inside the padded, scrolling page wrapper the other
            // formats use. Keyed by document so pan/zoom/undo survive a theme
            // change but reset when a different map opens.
            <MindmapEditorSurface
              key={activeDocument.id}
              documentId={activeDocument.id}
              initialSpec={payload.spec as MindmapSpec}
              tokens={payload.themeTokens as MindmapThemeTokens}
              disabled={isRendering}
              onSaved={() => refreshFileLink(activeDocument.id)}
            />
          )}

        {payload && !loadError && payload.specKind !== "mindmap" && (
          <div
            className="h-full w-full bg-white p-8 text-black"
            style={{ ["--doc-preview-bg" as any]: "#ffffff" }}
          >
            <DocumentSpecRenderer
              specKind={payload.specKind}
              spec={payload.spec}
              themeTokens={payload.themeTokens}
            />
          </div>
        )}
      </div>
    </div>
  );
}
