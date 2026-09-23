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
import { useDocumentPanel } from "@/context/document-panel-context";
import {
  DocumentSpecRenderer,
  type AnySpec,
  type SpecKind,
  type ThemeTokens,
} from "./document-spec-renderer";

const THEMES: Array<{ value: string; label: string }> = [
  { value: "professional", label: "Professional" },
  { value: "minimal", label: "Minimal" },
  { value: "report", label: "Report" },
];

const POLL_INTERVAL_MS = 2000;

interface SpecPayload {
  format: string;
  specKind: SpecKind;
  spec: AnySpec;
  theme: string;
  themeTokens: ThemeTokens;
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

  const isRendering =
    activeDocument?.status === "PENDING" || activeDocument?.status === "PROCESSING";

  const loadSpec = useCallback(async (id: number) => {
    try {
      const res = await documentService.getSpec(id);
      if (res.data?.data) {
        setPayload(res.data.data);
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

  const applyStyleChange = (patch: { title?: string; theme?: string }) => {
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
              {THEMES.map((t) => (
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

      <div className="relative flex-1 overflow-y-auto bg-white">
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

        {payload && !loadError && (
   
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
