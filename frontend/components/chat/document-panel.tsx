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
  type DeckPreview,
} from "./document-spec-renderer";

const THEMES: Array<{ value: string; label: string }> = [
  { value: "professional", label: "Professional" },
  { value: "minimal", label: "Minimal" },
  { value: "report", label: "Report" },
];

// Format-specific templates, added to THEMES per format. Keys must match
// DOCX_TEMPLATES / XLSX_TEMPLATES in
// backend/src/modules/document/document.types.ts.
const FORMAT_THEMES: Record<string, Array<{ value: string; label: string }>> = {
  DOCX: [
    { value: "business-plan", label: "Business Plan" },
    { value: "client-proposal", label: "Client Proposal" },
    { value: "cover-letter", label: "Cover Letter" },
    { value: "lesson-plan", label: "Lesson Plan" },
    { value: "meeting-minutes", label: "Meeting Minutes" },
    { value: "service-agreement", label: "Service Agreement" },
  ],
  XLSX: [
    { value: "financial-model", label: "Financial Model" },
    { value: "inventory-tracker", label: "Inventory Tracker" },
    { value: "monthly-budget", label: "Monthly Budget" },
    { value: "project-tracker", label: "Project Tracker" },
    { value: "sales-tracker", label: "Sales Tracker" },
    { value: "timesheet", label: "Timesheet" },
  ],
};

// PPTX-only a deck gets its own richer templates (fonts, decoration, photo
// layouts) rather than the flat document themes above. Keys must match
// backend/src/modules/document/document.pptxTemplates.ts.
const PPTX_TEMPLATES: Array<{ value: string; label: string }> = [
  { value: "corporate", label: "Corporate" },
  { value: "aurora", label: "Aurora" },
  { value: "sunset", label: "Sunset" },
  { value: "emerald", label: "Emerald" },
  { value: "mono", label: "Mono" },
  { value: "marketing-plan", label: "Marketing Plan" },
  { value: "pitch-deck", label: "Pitch Deck" },
  { value: "project-kickoff", label: "Project Kickoff" },
  { value: "quarterly-review", label: "Quarterly Review" },
  { value: "sales-proposal", label: "Sales Proposal" },
  { value: "training-deck", label: "Training Deck" },
];

// Mind-map-only palettes. Keys must match MINDMAP_THEMES in
// backend/src/modules/document/document.types.ts.
const MINDMAP_THEME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "vibrant", label: "Vibrant" },
  { value: "ocean", label: "Ocean" },
  { value: "autumn", label: "Autumn" },
  { value: "midnight", label: "Midnight" },
];

// Resizable width. The chat column must keep a usable width, so the panel's
// maximum is measured from its container at drag time, not from the window
// (the window also holds the sidebar).
const PANEL_MIN_WIDTH = 360;
const CHAT_MIN_WIDTH = 380;
const PANEL_DEFAULT_WIDTH = 800;
const PANEL_WIDTH_KEY = "documentPanelWidth";
const KEYBOARD_STEP = 24;

const readSavedWidth = (): number => {
  try {
    const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= PANEL_MIN_WIDTH ? saved : PANEL_DEFAULT_WIDTH;
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
};

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
  /** Present for a deck filled into a designed template file. */
  deckPreview?: DeckPreview;
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

  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(readSavedWidth);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  /** Keeps `next` between the panel minimum and what leaves the chat its minimum. */
  const clampWidth = useCallback((next: number) => {
    const container = panelRef.current?.parentElement;
    const max = container
      ? Math.max(PANEL_MIN_WIDTH, container.clientWidth - CHAT_MIN_WIDTH)
      : Number.POSITIVE_INFINITY;
    return Math.round(Math.min(Math.max(next, PANEL_MIN_WIDTH), max));
  }, []);

  const saveWidth = useCallback((value: number) => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(value));
    } catch {
      /* private mode: the width just won't be remembered */
    }
  }, []);

  // A saved width can be too wide for a smaller window; shrink with it.
  useEffect(() => {
    const onResize = () => setWidth((current) => clampWidth(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampWidth]);

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

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStart.current = { x: event.clientX, width };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start) return;
    // The handle is on the panel's LEFT edge: dragging left makes it wider.
    setWidth(clampWidth(start.width + (start.x - event.clientX)));
  };

  const onResizeEnd = () => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    setResizing(false);
    saveWidth(width);
  };

  const onResizeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = width + KEYBOARD_STEP;
    else if (event.key === "ArrowRight") next = width - KEYBOARD_STEP;
    else if (event.key === "Home") next = PANEL_DEFAULT_WIDTH;
    if (next === null) return;
    event.preventDefault();
    const clamped = clampWidth(next);
    setWidth(clamped);
    saveWidth(clamped);
  };

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
    <div
      ref={panelRef}
      className={`relative hidden md:flex shrink-0 flex-col border-l border-border/50 bg-background ${
        resizing ? "select-none" : ""
      }`}
      style={{ width }}
    >
      {/* Drag to resize; double-click or Home resets. A wider invisible hit area sits over the 1px border. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={() => {
          const reset = clampWidth(PANEL_DEFAULT_WIDTH);
          setWidth(reset);
          saveWidth(reset);
        }}
        onKeyDown={onResizeKey}
        className="group absolute -left-1.5 top-0 z-30 flex h-full w-3 cursor-col-resize touch-none items-stretch justify-center outline-none"
      >
        <span
          className={`w-0.5 rounded-full transition-colors ${
            resizing
              ? "bg-primary"
              : "bg-transparent group-hover:bg-primary/60 group-focus-visible:bg-primary/60"
          }`}
        />
      </div>
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
                  : [...THEMES, ...(FORMAT_THEMES[payload.format] ?? [])]
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
              deckPreview={payload.deckPreview}
            />
          </div>
        )}
      </div>
    </div>
  );
}
