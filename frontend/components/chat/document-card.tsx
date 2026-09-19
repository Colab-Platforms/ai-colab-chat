"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { documentService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useDocumentPanel } from "@/context/document-panel-context";

export type DocumentFormat = "PDF" | "DOCX" | "PPTX" | "XLSX" | "CSV";

export interface GeneratedDocument {
  id: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  format: string;
  title: string;
  fileName?: string | null;
  fileUrl?: string | null;
  fileSize?: number | null;
  lastError?: string | null;
}

/**
 * Mirrors DOCUMENT_FORMAT_META on the backend. Kept as a lookup rather than
 * `format.toLowerCase()` so an unknown value from an older row degrades to
 * sensible defaults instead of producing a broken extension or icon.
 *
 * `tint` is the conventional colour each format is recognised by, so the icon
 * is identifiable before the label is read. `short` is the badge text — three
 * characters is what fits legibly at 36px.
 */
const FORMAT_META: Record<
  DocumentFormat,
  { label: string; extension: string; short: string; tint: string }
> = {
  PDF: { label: "PDF", extension: "pdf", short: "PDF", tint: "#E1382E" },
  DOCX: { label: "Word", extension: "docx", short: "DOC", tint: "#2B579A" },
  PPTX: { label: "PowerPoint", extension: "pptx", short: "PPT", tint: "#D14524" },
  XLSX: { label: "Excel", extension: "xlsx", short: "XLS", tint: "#1D7044" },
  // Deliberately a distinct tone from XLS green — same "spreadsheet" family,
  // but a plain-text file is a genuinely different thing to open than a
  // styled workbook, and the icon should say so before the label does.
  CSV: { label: "CSV", extension: "csv", short: "CSV", tint: "#546E7A" },
};

const metaFor = (format: string) =>
  FORMAT_META[(format || "PDF").toUpperCase() as DocumentFormat] ??
  FORMAT_META.PDF;

/**
 * A file-type badge: a folded page in the format's colour with its short name.
 *
 * Drawn inline rather than pulled from an icon set because no icon library
 * ships per-format file glyphs, and shipping four raster assets for something
 * this small would cost four network requests and break at high DPI. Inline
 * SVG also inherits the card's sizing and needs no dark-mode variant — the
 * tints are chosen to hold contrast against both themes.
 */
function FileFormatIcon({
  format,
  className,
}: {
  format: string;
  className?: string;
}) {
  const { tint, short, label } = metaFor(format);

  return (
    <svg
      viewBox="0 0 32 40"
      className={className}
      role="img"
      aria-label={`${label} file`}
    >
      <path
        d="M6 1.5h13.2L28 10.3V36a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 4 36V4a2.5 2.5 0 0 1 2.5-2.5Z"
        fill={tint}
      />
      {/* Folded corner, drawn as a lightened wedge over the page colour. */}
      <path
        d="M19.2 1.5 28 10.3h-6.3a2.5 2.5 0 0 1-2.5-2.5V1.5Z"
        fill="#ffffff"
        fillOpacity={0.38}
      />
      <text
        x="16"
        y="28.5"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#ffffff"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        {short}
      </text>
    </svg>
  );
}

/**
 * Generation outlives the chat's SSE connection, so this card owns its own
 * lifecycle: it polls until the document reaches a terminal state, entirely
 * independently of the conversation. That is what lets the user keep chatting
 * — and keep sending new messages — while a PDF is still being built.
 */

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 5 * 60 * 1000;

const stagesFor = (label: string) => [
  "Understanding your request",
  "Structuring the document",
  "Laying out pages",
  `Finalising the ${label}`,
];

const formatBytes = (bytes?: number | null): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function DocumentCard({
  document: initial,
  className,
}: {
  document: GeneratedDocument;
  className?: string;
}) {
  const [doc, setDoc] = useState<GeneratedDocument>(initial);
  const [stage, setStage] = useState(0);
  const startedAt = useRef(Date.now());
  const { openDocumentPanel } = useDocumentPanel();

  const isWorking = doc.status === "PENDING" || doc.status === "PROCESSING";
  const meta = metaFor(doc.format);
  const STAGES = stagesFor(meta.label);

  // Auto-opens the preview panel the moment a document that was generating
  // (or re-rendering after a style edit) becomes ready — not on mount of an
  // already-completed card, so scrolling through chat history doesn't spam
  // the panel open for every past document.
  const wasWorkingRef = useRef(
    initial.status === "PENDING" || initial.status === "PROCESSING",
  );
  useEffect(() => {
    if (wasWorkingRef.current && doc.status === "COMPLETED") {
      openDocumentPanel(doc);
    }
    wasWorkingRef.current = isWorking;
  }, [doc, isWorking, openDocumentPanel]);

  // Keep in sync when the parent supplies a fresher copy (e.g. after a chat
  // reload) without discarding what polling has already learned.
  useEffect(() => {
    setDoc((prev) => (initial.status !== prev.status ? initial : prev));
  }, [initial]);

  useEffect(() => {
    if (!isWorking) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > MAX_POLL_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await documentService.getById(doc.id);
        if (!cancelled && res.data?.data) setDoc(res.data.data);
      } catch {
        // Transient failures are fine — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [doc.id, isWorking]);

  // Purely cosmetic stage ticker. The backend reports no sub-status, so this
  // communicates progress without pretending to know the real percentage.
  useEffect(() => {
    if (!isWorking) return;
    const timer = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      3500,
    );
    return () => clearInterval(timer);
  }, [isWorking]);

  const handleRetry = useCallback(async () => {
    try {
      const res = await documentService.retry(doc.id);
      startedAt.current = Date.now();
      setStage(0);
      if (res.data?.data) setDoc(res.data.data);
    } catch {
      /* keep the failed state visible */
    }
  }, [doc.id]);

  /* ---------------- generating ---------------- */
  if (isWorking) {
    return (
      <div
        className={cn(
          "relative mt-2 w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-muted/30 px-4 py-3",
          className,
        )}
      >
        {/* sweeping shimmer */}
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[doccard-shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />

        <div className="relative flex items-start gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            <FileFormatIcon format={doc.format} className="h-9 w-9 opacity-90" />
            <span className="absolute inset-0 rounded-lg border border-primary/30 animate-ping" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <p className="truncate text-sm font-medium">
                Generating your {meta.label}…
              </p>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {doc.title}
            </p>

            <div className="mt-2 flex items-center gap-1.5">
              {STAGES.map((label, index) => (
                <span
                  key={label}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-500",
                    index <= stage ? "bg-primary/70" : "bg-border",
                  )}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {STAGES[stage]} · you can keep chatting
            </p>
          </div>
        </div>

        <style jsx>{`
          @keyframes doccard-shimmer {
            100% {
              transform: translateX(100%);
            }
          }
        `}</style>
      </div>
    );
  }

  /* ---------------- failed ---------------- */
  if (doc.status === "FAILED") {
    return (
      <div
        className={cn(
          "mt-2 w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">
              Couldn&apos;t generate the {meta.label}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {doc.lastError || "Something went wrong while building the file."}
            </p>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="mt-2 h-7 text-xs"
              onClick={handleRetry}
            >
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- ready ---------------- */
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openDocumentPanel(doc)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") openDocumentPanel(doc);
      }}
      className={cn(
        "group mt-2 w-full max-w-md cursor-pointer rounded-xl border border-border/60 bg-background px-4 py-3 transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <FileFormatIcon format={doc.format} className="h-9 w-9" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            {meta.label}
            {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""} · ready
          </p>
        </div>

        {doc.fileUrl && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-8 px-2"
              title="Open in a new tab"
              onClick={(e) => {
                e.stopPropagation();
                window.open(doc.fileUrl!, "_blank", "noopener");
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                const link = window.document.createElement("a");
                link.href = doc.fileUrl!;
                link.download =
                  doc.fileName || `${doc.title}.${meta.extension}`;
                link.rel = "noopener";
                link.target = "_blank";
                link.click();
              }}
            >
              <Download className="mr-1.5 h-3 w-3" />
              Download
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
