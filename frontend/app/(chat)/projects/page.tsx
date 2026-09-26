"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Folder,
  Search,
  LayoutGrid,
  List,
  Plus,
  MoreHorizontal,
  Edit2,
  Trash2,
} from "lucide-react";
import { folderService, contextService } from "@/lib/services";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FolderItem } from "@/components/sidebar/sidebar-types";
import { ProjectChatsModal } from "@/components/projects/project-chats-modal";

type ViewMode = "grid" | "list";

const CARD_COLORS = [
  { bg: "bg-violet-100 dark:bg-violet-500/15", text: "text-violet-600 dark:text-violet-300" },
  { bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-600 dark:text-blue-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-300" },
  { bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-600 dark:text-amber-300" },
  { bg: "bg-rose-100 dark:bg-rose-500/15", text: "text-rose-600 dark:text-rose-300" },
  { bg: "bg-sky-100 dark:bg-sky-500/15", text: "text-sky-600 dark:text-sky-300" },
];

function colorFor(id: number) {
  return CARD_COLORS[id % CARD_COLORS.length];
}

function relativeTime(iso?: string) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ProjectCard({
  folder,
  viewMode,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: FolderItem & { updatedAt?: string };
  viewMode: ViewMode;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const color = colorFor(folder.id);
  const chatCount = folder._count?.chats ?? 0;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 w-7 shrink-0 rounded p-0 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="cursor-pointer" onClick={onRename}>
          <Edit2 className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (viewMode === "list") {
    return (
      <div
        onClick={onOpen}
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      >
        <div className={`h-9 w-9 shrink-0 rounded-lg ${color.bg} ${color.text} flex items-center justify-center font-semibold text-sm`}>
          {folder.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{folder.name}</div>
          {folder.description && (
            <div className="text-xs text-muted-foreground truncate">{folder.description}</div>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {chatCount} {chatCount === 1 ? "chat" : "chats"}
        </span>
        <span className="shrink-0 w-14 text-right text-[11px] text-muted-foreground">
          {relativeTime(folder.updatedAt)}
        </span>
        {menu}
      </div>
    );
  }

  return (
    <div
      onClick={onOpen}
      className="flex flex-col gap-3.5 rounded-2xl border border-border/60 bg-background p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className={`h-10 w-10 rounded-xl ${color.bg} ${color.text} flex items-center justify-center font-semibold text-sm`}>
          {folder.name.charAt(0).toUpperCase()}
        </div>
        {menu}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate mb-1">{folder.name}</div>
        <div className="text-xs text-muted-foreground line-clamp-2 min-h-[2.2em]">
          {folder.description || "No description"}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
          {chatCount} {chatCount === 1 ? "chat" : "chats"}
        </span>
        <span>{relativeTime(folder.updatedAt)}</span>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [folders, setFolders] = useState<(FolderItem & { updatedAt?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContext, setNewContext] = useState("");
  const [creating, setCreating] = useState(false);

  const [renameTarget, setRenameTarget] = useState<(FolderItem & { updatedAt?: string }) | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renameContext, setRenameContext] = useState("");
  const [renameContextId, setRenameContextId] = useState<number | null>(null);
  const [renameContextLoading, setRenameContextLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FolderItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [activeModalFolder, setActiveModalFolder] = useState<FolderItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const stored = localStorage.getItem("projectsViewMode");
    if (stored === "grid" || stored === "list") setViewMode(stored);
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("projectsViewMode", mode);
  };

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: "1", pageSize: "100" };
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await folderService.list(params);
      setFolders(res.data.data?.data || []);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await folderService.create({
        name: newTitle.trim(),
        description: newDescription.trim() || null,
      });
      const created = res.data.data;
      if (newContext.trim()) {
        try {
          await contextService.create({
            title: `${created.name} context`,
            memory: newContext.trim(),
            type: "FOLDER",
            folderId: created.id,
          });
        } catch {
          toast.error("Project created, but its context couldn't be saved");
        }
      }
      toast.success("Project created");
      setCreateOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewContext("");
      setFolders((prev) => [created, ...prev]);
      setActiveModalFolder(created);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = async (folder: FolderItem & { updatedAt?: string }) => {
    setRenameTarget(folder);
    setRenameName(folder.name);
    setRenameDescription(folder.description || "");
    setRenameContext("");
    setRenameContextId(null);
    setRenameContextLoading(true);
    try {
      const res = await contextService.list({
        folderId: String(folder.id),
        type: "FOLDER",
        pageSize: "1",
      });
      const existing = res.data.data?.data?.[0];
      if (existing) {
        setRenameContext(existing.memory || "");
        setRenameContextId(existing.id);
      }
    } catch {
      // context field just starts empty — not fatal
    } finally {
      setRenameContextLoading(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    try {
      await folderService.update(renameTarget.id, {
        name: renameName.trim(),
        description: renameDescription.trim() || null,
      });

      const trimmedContext = renameContext.trim();
      try {
        if (renameContextId) {
          if (trimmedContext) {
            await contextService.update(renameContextId, {
              title: `${renameName.trim()} context`,
              memory: trimmedContext,
            });
          } else {
            await contextService.delete(renameContextId);
          }
        } else if (trimmedContext) {
          await contextService.create({
            title: `${renameName.trim()} context`,
            memory: trimmedContext,
            type: "FOLDER",
            folderId: renameTarget.id,
          });
        }
      } catch {
        toast.error("Project updated, but its context couldn't be saved");
      }

      toast.success("Project updated");
      setRenameTarget(null);
      fetchFolders();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (deleteChats: boolean) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await folderService.delete(deleteTarget.id, deleteChats);
      toast.success(deleteChats ? "Project and chats deleted" : "Project deleted, chats moved out");
      setDeleteTarget(null);
      fetchFolders();
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  const isEmpty = !loading && folders.length === 0 && !debouncedSearch;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 px-6 py-5 border-b border-border/50">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Group related chats together and keep the context that matters to them.
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 bg-violet-200/70 hover:bg-violet-200 text-violet-900 dark:bg-violet-500/20 dark:hover:bg-violet-500/30 dark:text-violet-200 border-0 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create New Project
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full h-9 pl-9 pr-3 rounded-full border border-border/60 bg-muted/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-background transition-colors"
            />
          </div>

          <div className="ml-auto flex items-center gap-0.5 bg-muted/60 border border-border/40 rounded-full p-0.5">
            <button
              onClick={() => changeViewMode("grid")}
              title="Grid view"
              className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => changeViewMode("list")}
              title="List view"
              className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
              <Folder className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold">Create your Own Project</h2>
            <p className="text-sm text-muted-foreground mt-2.5 max-w-md leading-relaxed">
              Projects keep related chats, a short description and shared context together in one
              place. Give it a title and a one-line description, then start as many chats inside it
              as you need — every chat will remember what the project is about.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-6 gap-1.5 bg-violet-200/70 hover:bg-violet-200 text-violet-900 dark:bg-violet-500/20 dark:hover:bg-violet-500/30 dark:text-violet-200 border-0 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create New Project
            </Button>
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-semibold">No matching projects</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">Try a different search term.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="max-w-5xl mx-auto py-6 px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {folders.map((folder) => (
              <ProjectCard
                key={folder.id}
                folder={folder}
                viewMode="grid"
                onOpen={() => setActiveModalFolder(folder)}
                onRename={() => openEditDialog(folder)}
                onDelete={() => setDeleteTarget(folder)}
              />
            ))}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4 px-4 flex flex-col gap-2">
            {folders.map((folder) => (
              <ProjectCard
                key={folder.id}
                folder={folder}
                viewMode="list"
                onOpen={() => setActiveModalFolder(folder)}
                onRename={() => openEditDialog(folder)}
                onDelete={() => setDeleteTarget(folder)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setNewTitle(""); setNewDescription(""); setNewContext(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Project title</label>
              <Input
                placeholder="e.g. Marketing Campaign"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground/80">Short description</label>
                <span className="text-[11px] text-muted-foreground">{newDescription.length}/150</span>
              </div>
              <Textarea
                placeholder="What is this project about?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value.slice(0, 150))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground/80">Project context (optional)</label>
                <span className="text-[11px] text-muted-foreground">{newContext.length}/500</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Give the AI something to remember for every chat in this project.
              </p>
              <Textarea
                placeholder="e.g. We're a D2C skincare brand targeting Gen Z on Instagram."
                value={newContext}
                onChange={(e) => setNewContext(e.target.value.slice(0, 500))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || creating}>
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Project title</label>
              <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Short description</label>
              <Textarea
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value.slice(0, 150))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground/80">Project context (optional)</label>
                <span className="text-[11px] text-muted-foreground">{renameContext.length}/500</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Give the AI something to remember for every chat in this project.
              </p>
              <Textarea
                placeholder={renameContextLoading ? "Loading..." : "e.g. We're a D2C skincare brand targeting Gen Z on Instagram."}
                value={renameContext}
                onChange={(e) => setRenameContext(e.target.value.slice(0, 500))}
                disabled={renameContextLoading}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameName.trim() || renaming}>
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="w-[94vw] max-w-[calc(100vw-2rem)] sm:max-w-[640px] p-6">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm text-muted-foreground text-center sm:text-left">
            What would you like to do with the chats inside &quot;{deleteTarget?.name}&quot;?
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:flex-nowrap">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-between sm:flex-nowrap">
              <Button
                variant="outline"
                onClick={() => handleDelete(false)}
                disabled={deleting}
                className="w-full sm:w-auto border-primary/40 text-primary hover:bg-primary/5 text-xs sm:text-sm"
              >
                {deleting ? "Moving..." : "Move chats out"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(true)}
                disabled={deleting}
                className="w-full sm:w-auto text-xs sm:text-sm"
              >
                {deleting ? "Deleting..." : "Delete chats too"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectChatsModal folder={activeModalFolder} onClose={() => setActiveModalFolder(null)} />
    </div>
  );
}
