"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Eye, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/dashboard/data-table";
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

  const columns: Column[] = [
    {
      key: "title",
      label: "Title",
      render: (r) => (
        <span className="font-medium max-w-37.5 truncate block" title={r.title}>
          {r.title}
        </span>
      ),
    },
    {
      key: "memory",
      label: "Content Info",
      render: (r) => (
        <span
          className="max-w-50 truncate block text-muted-foreground text-xs"
          title={r.memory}
        >
          {r.memory}
        </span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (r) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge
            variant={
              r.type === "GLOBAL"
                ? "default"
                : r.type === "FOLDER"
                  ? "secondary"
                  : "outline"
            }
          >
            {r.type === "CUSTOM" ? "CHAT" : r.type}
          </Badge>
          {r.type === "FOLDER" && r.folderId && (
            <span className="text-[10px] text-muted-foreground ml-1">
              in {getFolderName(r.folderId)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "isAutoSelected",
      label: "Auto-Selected",
      render: (r) => (
        <Badge
          variant={r.isAutoSelected ? "default" : "secondary"}
          className="text-[10px] uppercase"
        >
          {r.type === "GLOBAL" ? (r.isAutoSelected ? "Yes" : "No") : "N/A"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (r) => (
        <span className="text-xs whitespace-nowrap">
          {new Date(r.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="View"
            onClick={() => setViewContext(r)}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-blue-500"
            title="Edit"
            onClick={() => {
              setEditContext(r);
              setContextInitialData(r);
              setEditModalOpen(true);
            }}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={r.isAutoGenerated}
            title={
              r.isAutoGenerated
                ? "Cannot delete system generated context"
                : "Delete"
            }
            onClick={() => setDeleteTarget(r)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <DataTable
          columns={columns}
          data={contexts}
          title="Contexts"
          description="Memory the AI remembers across your chats — global, per-project, or chat-specific"
          searchPlaceholder="Search contexts..."
          headerActions={
            <Button onClick={handleOpenCreate} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Create Context
            </Button>
          }
          loading={loadingContexts}
        />
      </section>

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
            <DialogTitle>New Project Folder</DialogTitle>
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
