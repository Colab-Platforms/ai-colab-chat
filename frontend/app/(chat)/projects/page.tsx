"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit2, MessageSquare, MessagesSquare, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { folderService, contextService } from "@/lib/services";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderItem } from "@/components/sidebar/sidebar-types";
import { ProjectIconTile, updatedLabel } from "@/components/projects/project-look";
import {
  DeleteProjectDialog,
  ProjectDialog,
  emptyProjectForm,
  saveProjectBrief,
  type ProjectFormValues,
} from "@/components/projects/project-dialog";

function ProjectCard({
  folder,
  onOpen,
  onEdit,
  onDelete,
}: {
  folder: FolderItem;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const chatCount = folder._count?.chats ?? 0;
  const recent = folder.chats ?? [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group relative flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-cl transition-colors hover:border-line-strong cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <ProjectIconTile project={folder} size={40} />
        <div className="min-w-0 flex-1 pt-px">
          <div className="text-[15px] font-semibold text-foreground truncate">{folder.name}</div>
          <div className="text-xs text-faint">{updatedLabel(folder.updatedAt)}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 -mr-1 -mt-1 shrink-0 rounded-md text-muted-foreground flex items-center justify-center hover:bg-sidebar-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity cursor-pointer"
              aria-label="Project actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
              <Edit2 className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-3.5 text-[13.5px] leading-relaxed text-muted-foreground line-clamp-2 min-h-[2.8em]">
        {folder.description || "No description"}
      </p>

      <div className="mt-4 border-t border-border pt-3 space-y-2 min-h-[64px]">
        {recent.length === 0 ? (
          <p className="text-[13px] text-faint">No chats yet</p>
        ) : (
          recent.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 text-[13px] text-foreground">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-faint" />
              <span className="truncate">{c.title || "New Chat"}</span>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MessagesSquare className="w-3.5 h-3.5" />
          {chatCount} {chatCount === 1 ? "chat" : "chats"}
        </span>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<FolderItem | null>(null);
  const [editInitial, setEditInitial] = useState<ProjectFormValues>(emptyProjectForm);
  const [editContextId, setEditContextId] = useState<number | null>(null);
  const [editBriefLoading, setEditBriefLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FolderItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

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

  const handleCreate = async (v: ProjectFormValues) => {
    setSaving(true);
    try {
      const res = await folderService.create({
        name: v.name,
        description: v.description || null,
        icon: v.icon,
        color: v.color,
      });
      const created: FolderItem = res.data.data;
      if (v.brief.trim()) {
        const ok = await saveProjectBrief({
          folderId: created.id,
          projectName: created.name,
          brief: v.brief,
          existingContextId: null,
        });
        if (!ok) toast.error("Project created, but its brief couldn't be saved");
      }
      toast.success("Project created");
      setCreateOpen(false);
      router.push(`/projects/${created.id}`);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = async (folder: FolderItem) => {
    setEditTarget(folder);
    setEditInitial({
      name: folder.name,
      description: folder.description || "",
      brief: "",
      icon: folder.icon || "folder",
      color: folder.color || "blue",
    });
    setEditContextId(null);
    setEditBriefLoading(true);
    try {
      const res = await contextService.list({ folderId: String(folder.id), type: "FOLDER", pageSize: "1" });
      const existing = res.data.data?.data?.[0];
      if (existing) {
        setEditContextId(existing.id);
        setEditInitial((prev) => ({ ...prev, brief: existing.memory || "" }));
      }
    } catch {
      // the brief field just starts empty — not fatal
    } finally {
      setEditBriefLoading(false);
    }
  };

  const handleEdit = async (v: ProjectFormValues) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await folderService.update(editTarget.id, {
        name: v.name,
        description: v.description || null,
        icon: v.icon,
        color: v.color,
      });
      const ok = await saveProjectBrief({
        folderId: editTarget.id,
        projectName: v.name,
        brief: v.brief,
        existingContextId: editContextId,
      });
      if (!ok) toast.error("Project updated, but its brief couldn't be saved");
      toast.success("Project updated");
      setEditTarget(null);
      fetchFolders();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
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

  const isFiltering = Boolean(debouncedSearch);
  const countLabel = useMemo(
    () => `${folders.length} ${folders.length === 1 ? "project" : "projects"}`,
    [folders.length],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-6 pt-10 pb-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Group related chats and give them a shared brief the AI always remembers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-cl hover:bg-accent-hover transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New project
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="relative w-full max-w-[360px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects"
              className="h-10 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-primary/50"
            />
          </div>
          {!loading && <span className="shrink-0 text-[13px] text-muted-foreground">{countLabel}</span>}
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : folders.length === 0 && isFiltering ? (
            <div className="py-20 text-center">
              <h2 className="text-sm font-semibold text-foreground">No matching projects</h2>
              <p className="mt-1 text-xs text-muted-foreground">Try a different search term.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder) => (
                <ProjectCard
                  key={folder.id}
                  folder={folder}
                  onOpen={() => router.push(`/projects/${folder.id}`)}
                  onEdit={() => openEditDialog(folder)}
                  onDelete={() => setDeleteTarget(folder)}
                />
              ))}
              {!isFiltering && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-8 text-center transition-colors hover:bg-sidebar-accent cursor-pointer"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-muted-foreground">
                    <Plus className="w-4 h-4" />
                  </span>
                  <span className="mt-3 text-[14.5px] font-semibold text-foreground">New project</span>
                  <span className="mt-1.5 max-w-[220px] text-[13px] leading-snug text-muted-foreground">
                    Give it a name and a brief. Every chat inside will know what it&apos;s about.
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        initial={emptyProjectForm}
        submitting={saving}
        onSubmit={handleCreate}
      />

      <ProjectDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        mode="edit"
        initial={editInitial}
        briefLoading={editBriefLoading}
        submitting={saving}
        onSubmit={handleEdit}
      />

      <DeleteProjectDialog
        projectName={deleteTarget?.name}
        open={!!deleteTarget}
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
