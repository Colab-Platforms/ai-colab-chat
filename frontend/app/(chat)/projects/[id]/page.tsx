"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef } from "react";
import { ArrowLeft, FileText, Loader2, MessageSquare, NotebookPen, Paperclip, Pencil, SquarePen, Trash2, X } from "lucide-react";
import { chatService, contextService, folderService } from "@/lib/services";
import { startNewChatInFolder } from "@/lib/newChat";
import { toast } from "@/lib/toast";
import type { FolderItem } from "@/components/sidebar/sidebar-types";
import { ProjectIconTile, shortDate } from "@/components/projects/project-look";
import {
  DeleteProjectDialog,
  ProjectDialog,
  emptyProjectForm,
  saveProjectBrief,
  type ProjectFormValues,
} from "@/components/projects/project-dialog";

interface ProjectChat {
  id: number;
  title: string | null;
  updatedAt: string;
}

interface ProjectDocument {
  id: number;
  fileName: string;
  fileSize: number;
  textChars: number;
}

const PAGE_SIZE = 20;
// Mirrors the backend limits in folder-document.service.ts.
const MAX_DOCUMENTS = 5;
const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.xls,.xlsx";

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const folderId = Number(params.id);

  const [folder, setFolder] = useState<FolderItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [brief, setBrief] = useState("");
  const [briefContextId, setBriefContextId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [chats, setChats] = useState<ProjectChat[]>([]);
  const [chatTotal, setChatTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadFolder = useCallback(async () => {
    try {
      const res = await folderService.getById(folderId);
      setFolder(res.data.data);
    } catch {
      setNotFound(true);
    }
  }, [folderId]);

  const loadBrief = useCallback(async () => {
    try {
      const res = await contextService.list({ folderId: String(folderId), type: "FOLDER", pageSize: "1" });
      const existing = res.data.data?.data?.[0];
      setBrief(existing?.memory || "");
      setBriefContextId(existing?.id ?? null);
    } catch {
      /* no brief shown not fatal */
    }
  }, [folderId]);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await folderService.listDocuments(folderId);
      setDocuments(res.data.data || []);
    } catch {
      /* documents card just stays empty */
    }
  }, [folderId]);

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingDoc(true);
    try {
      await folderService.uploadDocument(folderId, file);
      await loadDocuments();
      toast.success("Document added to this project");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to upload document");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDocument = async (docId: number) => {
    try {
      await folderService.deleteDocument(folderId, docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      toast.error("Failed to remove document");
    }
  };

  const loadChats = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoadingChats(true);
      try {
        const res = await chatService.list({
          folderId: String(folderId),
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
          isArchived: "false",
        });
        const result = res.data.data;
        const fetched: ProjectChat[] = result?.data || [];
        setChats((prev) => (append ? [...prev, ...fetched] : fetched));
        setPage(pageNum);
        setHasMore(Boolean(result?.hasNextPage));
        if (typeof result?.totalRecords === "number") setChatTotal(result.totalRecords);
      } catch {
        toast.error("Failed to load chats");
      } finally {
        setLoadingChats(false);
        setLoadingMore(false);
      }
    },
    [folderId],
  );

  useEffect(() => {
    if (Number.isNaN(folderId)) {
      setNotFound(true);
      return;
    }
    loadFolder();
    loadBrief();
    loadDocuments();
    loadChats(1, false);
  }, [folderId, loadFolder, loadBrief, loadDocuments, loadChats]);

  const handleEdit = async (v: ProjectFormValues) => {
    setSaving(true);
    try {
      await folderService.update(folderId, {
        name: v.name,
        description: v.description || null,
        icon: v.icon,
        color: v.color,
      });
      const ok = await saveProjectBrief({
        folderId,
        projectName: v.name,
        brief: v.brief,
        existingContextId: briefContextId,
      });
      if (!ok) toast.error("Project updated, but its brief couldn't be saved");
      toast.success("Project updated");
      setEditOpen(false);
      await Promise.all([loadFolder(), loadBrief()]);
      window.dispatchEvent(new Event("folder-created"));
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (deleteChats: boolean) => {
    setDeleting(true);
    try {
      await folderService.delete(folderId, deleteChats);
      toast.success(deleteChats ? "Project and chats deleted" : "Project deleted, chats moved out");
      window.dispatchEvent(new Event("refresh-chats"));
      router.replace("/projects");
    } catch {
      toast.error("Failed to delete project");
      setDeleting(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Project not found</h1>
        <Link href="/projects" className="text-sm font-medium text-primary hover:underline">
          Back to all projects
        </Link>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const editInitial: ProjectFormValues = {
    ...emptyProjectForm,
    name: folder.name,
    description: folder.description || "",
    brief,
    icon: folder.icon || "folder",
    color: folder.color || "blue",
  };
  const shownChatCount = chatTotal ?? folder._count?.chats ?? chats.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-6 pt-8 pb-16">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All projects
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <ProjectIconTile project={folder} size={52} />
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground truncate">
                {folder.name}
              </h1>
              {folder.description && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{folder.description}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              title="Edit project"
              className="h-10 w-10 rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-line-strong flex items-center justify-center transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              title="Delete project"
              className="h-10 w-10 rounded-lg border border-border bg-surface text-muted-foreground hover:text-destructive hover:border-line-strong flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => startNewChatInFolder(router, folder.id)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-cl hover:bg-accent-hover transition-colors cursor-pointer"
            >
              <SquarePen className="w-4 h-4" />
              New chat
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <section>
            <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">
              Chats <span className="ml-1 text-[13px] font-normal text-faint">{shownChatCount}</span>
            </h2>

            {loadingChats ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : chats.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No chats in this project yet</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Start one and it will remember the project brief automatically.
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                  {chats.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/c/${c.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-foreground hover:bg-sidebar-accent transition-colors"
                      >
                        <MessageSquare className="w-4 h-4 shrink-0 text-faint" />
                        <span className="flex-1 truncate">{c.title || "New Chat"}</span>
                        <span className="shrink-0 text-xs text-faint">{shortDate(c.updatedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => loadChats(page + 1, true)}
                    disabled={loadingMore}
                    className="mt-3 h-9 w-full rounded-lg border border-border bg-surface text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-line-strong transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {loadingMore ? "Loading…" : "Load more chats"}
                  </button>
                )}
              </>
            )}
          </section>

          <div className="space-y-4">
          <aside className="rounded-2xl border border-border bg-surface p-5 shadow-cl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                <NotebookPen className="w-4 h-4 text-primary" />
                Project brief
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="text-[13px] font-medium text-primary hover:text-accent-hover transition-colors cursor-pointer"
              >
                Edit
              </button>
            </div>
            {brief ? (
              <>
                <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap pr-1 text-[13.5px] leading-relaxed text-foreground">{brief}</p>
                <p className="mt-3 text-xs text-faint">Added to every chat in this project.</p>
              </>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                No brief yet. Add goals, audience and tone so every chat in this project starts with the right context.
              </p>
            )}
          </aside>

          <aside className="rounded-2xl border border-border bg-surface p-5 shadow-cl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                <Paperclip className="w-4 h-4 text-primary" />
                Documents
                <span className="text-[13px] font-normal text-faint">
                  {documents.length}/{MAX_DOCUMENTS}
                </span>
              </div>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={uploadingDoc || documents.length >= MAX_DOCUMENTS}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingDoc && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {uploadingDoc ? "Reading…" : "Add"}
              </button>
              <input
                ref={docInputRef}
                type="file"
                accept={DOCUMENT_ACCEPT}
                className="hidden"
                onChange={handleUploadDocument}
              />
            </div>
            {documents.length > 0 ? (
              <>
                <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {documents.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px]"
                    >
                      <FileText className="w-4 h-4 shrink-0 text-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">{d.fileName}</span>
                        <span className="text-xs text-faint">{formatSize(d.fileSize)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(d.id)}
                        title="Remove document"
                        className="shrink-0 text-faint hover:text-destructive transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-faint">Read by the AI in every chat in this project.</p>
              </>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                Add a PRD, scope of work or spec (PDF, Word, PowerPoint, text, Excel or CSV, up to 8 MB). The AI reads
                it in every chat in this project.
              </p>
            )}
          </aside>
          </div>
        </div>
      </div>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={editInitial}
        submitting={saving}
        onSubmit={handleEdit}
      />
      <DeleteProjectDialog
        projectName={folder.name}
        open={deleteOpen}
        deleting={deleting}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
