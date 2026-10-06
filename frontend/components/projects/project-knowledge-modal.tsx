"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { knowledgeService, type KnowledgeSourceType } from "@/lib/services";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { FolderItem } from "@/components/sidebar/sidebar-types";
import { BrandKitTab, ProductsTab } from "./project-brand-tabs";

interface SourceRow {
  id: number;
  type: KnowledgeSourceType;
  title: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  lastError: string | null;
  chunkCount: number;
}

const TYPE_LABEL: Record<KnowledgeSourceType, string> = {
  DOCUMENT: "Document",
  PAST_POST: "Past post",
  PRODUCT_DOC: "Product doc",
  COMPETITOR: "Competitor",
  NOTE: "Note",
};

type Tab = "knowledge" | "brand" | "products";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv";
const POLL_MS = 4000;

function StatusChip({ source }: { source: SourceRow }) {
  if (source.status === "READY") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> {source.chunkCount} chunks
      </span>
    );
  }
  if (source.status === "FAILED") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-destructive"
        title={source.lastError ?? undefined}
      >
        <AlertCircle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Indexing
    </span>
  );
}

export function ProjectKnowledgeModal({
  folder,
  onClose,
}: {
  folder: FolderItem | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("knowledge");
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderId = folder?.id;

  const load = useCallback(
    async (silent = false) => {
      if (!folderId) return;
      if (!silent) setLoading(true);
      try {
        const res = await knowledgeService.list({ folderId });
        setSources(res.data?.data ?? []);
      } catch {
        if (!silent) toast.error("Failed to load knowledge");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [folderId],
  );

  useEffect(() => {
    if (!folderId) {
      setSources([]);
      return;
    }
    setNoteTitle("");
    setNoteText("");
    setTab("knowledge");
    void load();
  }, [folderId, load]);

  // Poll only while something is still being indexed.
  const hasInFlight = sources.some(
    (s) => s.status === "PENDING" || s.status === "PROCESSING",
  );
  useEffect(() => {
    if (!folderId || !hasInFlight) return;
    const timer = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [folderId, hasInFlight, load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !folderId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await knowledgeService.upload(file, { folderId, type: "DOCUMENT" });
      }
      await load(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddNote = async () => {
    if (!folderId || !noteTitle.trim() || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await knowledgeService.addText({
        folderId,
        type: "NOTE",
        title: noteTitle.trim(),
        text: noteText.trim(),
      });
      setNoteTitle("");
      setNoteText("");
      await load(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await knowledgeService.delete(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleReindex = async (id: number) => {
    try {
      await knowledgeService.reindex(id);
      await load(true);
    } catch {
      toast.error("Failed to re-index");
    }
  };

  return (
    <Dialog open={!!folder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Brand & knowledge - {folder?.name}</DialogTitle>
          <DialogDescription>
            What the AI knows about this project's brand, products and past
            content. The Content Writer uses all three.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
          {(
            [
              ["knowledge", "Knowledge"],
              ["brand", "Brand kit"],
              ["products", "Products"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                tab === id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "brand" && folderId ? <BrandKitTab folderId={folderId} /> : null}
        {tab === "products" && folderId ? <ProductsTab folderId={folderId} /> : null}
        {tab === "knowledge" && (
          <>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload files
          </Button>
          <span className="text-[11px] text-muted-foreground">
            PDF, DOCX, PPTX, TXT, MD, CSV · up to 10 MB
          </span>
        </div>

        <ScrollArea className="max-h-64 rounded-lg border border-border/60">
          {loading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sources.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              Nothing here yet. Upload a file or add a note below.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.title}</div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{TYPE_LABEL[s.type]}</span>
                      <StatusChip source={s} />
                    </div>
                  </div>
                  {s.status === "FAILED" && (
                    <Button
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Retry"
                      onClick={() => void handleReindex(s.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => void handleDelete(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="space-y-2">
          <div className="text-xs font-medium">Add a note</div>
          <Input
            placeholder="Title (e.g. Brand voice)"
            value={noteTitle}
            maxLength={200}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <Textarea
            placeholder="Paste text the AI should know…"
            rows={4}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <Button
            size="sm"
            disabled={savingNote || !noteTitle.trim() || !noteText.trim()}
            onClick={() => void handleAddNote()}
          >
            {savingNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add note
          </Button>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
