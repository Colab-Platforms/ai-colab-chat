"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Brain, Loader2 } from "lucide-react";
import { SettingsCard, SettingsHeader } from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { ContextModal } from "@/components/contexts/ContextModal";
import { ContextViewDialog } from "@/components/contexts/ContextViewDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { contextService, folderService } from "@/lib/services";
import { toast } from "@/lib/toast";

export default function ContextsPage() {
  const [contexts, setContexts] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loadingContexts, setLoadingContexts] = useState(true);

  // view dialog (read-only)
  const [viewContext, setViewContext] = useState<any | null>(null);

  // create / edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editContext, setEditContext] = useState<any | null>(null); // null = create
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // create folder modal (used when ContextModal requests a new folder from this page)
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [pendingContextDraft, setPendingContextDraft] = useState<{
    title: string;
    memory: string;
    type: "GLOBAL" | "FOLDER" | "CUSTOM";
    folderId: string;
    isAutoSelected: boolean;
    existingContextId?: number | null;
  } | null>(null);
  const [contextInitialData, setContextInitialData] = useState<any | null>(
    null,
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchContexts = useCallback(async () => {
    setLoadingContexts(true);
    try {
      const res = await contextService.list();
      const data = res?.data?.data?.data;
      setContexts(Array.isArray(data) ? data : []);
    } catch {
      setContexts([]);
    } finally {
      setLoadingContexts(false);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await folderService.list();
      const data = res?.data?.data?.data;
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    fetchContexts();
    fetchFolders();
  }, [fetchContexts, fetchFolders]);

  // Keep folders updated when created elsewhere (e.g. sidebar)
  useEffect(() => {
    const handleFolderCreated = () => {
      void fetchFolders();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("folder-created", handleFolderCreated);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("folder-created", handleFolderCreated);
      }
    };
  }, [fetchFolders]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditContext(null);
    setContextInitialData(null);
    setEditModalOpen(true);
  };

  const handleSaveContext = async (data: any) => {
    setIsSaving(true);
    try {
      if (editContext) {
        await contextService.update(editContext.id, data);
        toast.success("Context updated");
      } else {
        await contextService.create(data);
        toast.success("Context created");
      }
      setEditModalOpen(false);
      await fetchContexts();
    } catch {
      toast.error("Failed to save context");
    } finally {
      setIsSaving(false);
    }
  };

  const handleContextRequestCreateFolder = (draft: {
    title: string;
    memory: string;
    type: "GLOBAL" | "FOLDER" | "CUSTOM";
    folderId: string;
    isAutoSelected: boolean;
  }) => {
    setPendingContextDraft({
      ...draft,
      existingContextId: editContext?.id ?? null,
    });
    setEditModalOpen(false);
    setCreateFolderOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await contextService.delete(deleteTarget.id);
      toast.success("Context deleted");
      setDeleteTarget(null);
      await fetchContexts();
    } catch {
      toast.error("Failed to delete context");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || isCreatingFolder) return;
    setIsCreatingFolder(true);
    try {
      const res = await folderService.create({ name: newFolderName.trim() });
      const createdId = res?.data?.data?.id;
      toast.success("Folder created");
      setNewFolderName("");
      setCreateFolderOpen(false);
      await fetchFolders();

      if (pendingContextDraft && createdId) {
        const draft = pendingContextDraft;
        setPendingContextDraft(null);
        const baseInitialData = {
          title: draft.title,
          memory: draft.memory,
          type: "FOLDER" as const,
          folderId: createdId,
          isAutoSelected: draft.isAutoSelected,
        };

        if (draft.existingContextId) {
          const existing = contexts.find(
            (c) => c.id === draft.existingContextId,
          ) || {
            id: draft.existingContextId,
          };
          const nextContext = { ...existing, ...baseInitialData };
          setContextInitialData(nextContext);
          setEditContext(nextContext);
        } else {
          setContextInitialData(baseInitialData);
          setEditContext(null);
        }

        setEditModalOpen(true);
      }
    } catch {
      toast.error("Failed to create folder");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // ── Table columns ─────────────────────────────────────────────────────────

  const getFolderName = (folderId: number) => {
    if (!Array.isArray(folders)) return "Unknown Folder";
    return folders.find((f) => f.id === folderId)?.name || "Unknown Folder";
  };

  const scopeLabel = (r: any) =>
    r.type === "GLOBAL" ? "Global" : r.type === "FOLDER" ? `Project · ${getFolderName(r.folderId)}` : "Chat";

  const appliedLabel = (r: any) =>
    r.type !== "GLOBAL" ? null : r.isAutoSelected ? "Applied automatically" : "Applied when you pick it";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <SettingsHeader
        title="Contexts"
        description="Things the AI remembers about you. Use them in every chat, in one project, or in a single chat."
        action={
          <Button onClick={handleOpenCreate} className="shrink-0 gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            New context
          </Button>
        }
      />

      {loadingContexts ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : contexts.length === 0 ? (
        <SettingsCard className="flex flex-col items-center px-4 py-12 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft">
            <Brain className="h-5 w-5 text-accent-ink" />
          </div>
          <p className="text-sm font-medium">No contexts yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Add something you want the AI to remember, like your role, tone or preferences.
          </p>
        </SettingsCard>
      ) : (
        <div className="space-y-3">
          {contexts.map((r) => {
            const applied = appliedLabel(r);
            return (
              <SettingsCard key={r.id} className="flex items-start gap-3.5 p-4">
                <button
                  type="button"
                  onClick={() => setViewContext(r)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-3.5 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                    <Brain className="h-4 w-4 text-accent-ink" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="mt-0.5 line-clamp-3 break-words text-[13px] text-muted-foreground">{r.memory}</span>
                    {String(r.memory ?? "").length > 160 && (
                      <span className="mt-1 inline-block text-xs font-medium text-accent-ink hover:underline">Read more</span>
                    )}
                    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                      <span className="rounded-md bg-sunken px-2 py-0.5 font-medium text-foreground">{scopeLabel(r)}</span>
                      {applied && <span>{applied}</span>}
                      <span>
                        · Added{" "}
                        {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => {
                      setEditContext(r);
                      setContextInitialData(r);
                      setEditModalOpen(true);
                    }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sunken hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={r.isAutoGenerated}
                    title={r.isAutoGenerated ? "Cannot delete system generated context" : "Delete"}
                    onClick={() => setDeleteTarget(r)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </SettingsCard>
            );
          })}
        </div>
      )}

      <ContextViewDialog
        open={!!viewContext}
        onOpenChange={(open) => !open && setViewContext(null)}
        context={viewContext}
        getFolderName={getFolderName}
      />

      {/* ── Create / Edit Modal ── */}
      <ContextModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setPendingContextDraft(null);
          setContextInitialData(null);
        }}
        onSave={handleSaveContext}
        initialData={contextInitialData || editContext}
        folders={folders}
        isSaving={isSaving}
        mode={editContext ? "edit" : "create"}
        onRequestCreateFolder={handleContextRequestCreateFolder}
      />

      {/* ── Delete Confirmation ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
        title="Delete Context"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />

      {/* New Project Folder dialog (for contexts on this page) */}
      <Dialog
        open={createFolderOpen}
        onOpenChange={(open) => {
          if (!isCreatingFolder) {
            setCreateFolderOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g. Marketing Campaign"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateFolder();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!isCreatingFolder) {
                  setCreateFolderOpen(false);
                }
              }}
              disabled={isCreatingFolder}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateFolder()}
              disabled={!newFolderName.trim() || isCreatingFolder}
            >
              {isCreatingFolder ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
