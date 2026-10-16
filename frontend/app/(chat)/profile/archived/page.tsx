"use client";

import { useState, useEffect, useCallback } from "react";
import { chatService } from "@/lib/services";
import { Loader2, ArchiveRestore, MessageSquare, Archive, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { SettingsCard, SettingsHeader } from "@/components/settings/settings-ui";

interface ArchivedChat {
  id: number;
  title: string | null;
  updatedAt: string;
  createdAt: string;
  model?: { name?: string } | null;
  models?: { name?: string }[];
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function ArchivedChatsPage() {
  const [chats, setChats] = useState<ArchivedChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [unarchivingId, setUnarchivingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchivedChat | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchArchivedChats = useCallback(async () => {
    try {
      const res = await chatService.list({ isArchived: "true" });
      setChats(res.data.data?.data || []);
    } catch {
      toast.error("Failed to load archived chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchivedChats();
  }, [fetchArchivedChats]);

  const handleUnarchive = async (chatId: number) => {
    setUnarchivingId(chatId);
    try {
      await chatService.archive(chatId);
      toast.success("Chat restored");
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    } catch {
      toast.error("Failed to restore chat");
    } finally {
      setUnarchivingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await chatService.delete(deleteTarget.id);
      toast.success("Chat deleted");
      setChats((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete chat");
    } finally {
      setDeleting(false);
    }
  };

  const modelLabel = (c: ArchivedChat) => c.model?.name || c.models?.[0]?.name;

  return (
    <div>
      <SettingsHeader title="Archived chats" description="Chats you archive from the sidebar appear here. Restore them anytime." />

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : chats.length === 0 ? (
        <SettingsCard className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sunken">
            <Archive className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-base font-semibold">No archived chats</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Chats you archive from the sidebar will appear here. You can restore them anytime.
          </p>
        </SettingsCard>
      ) : (
        <SettingsCard className="overflow-hidden">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 transition-colors hover:bg-sunken/60"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{chat.title || "Untitled chat"}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {modelLabel(chat) ? `${modelLabel(chat)} · ` : ""}Archived {fmtDate(chat.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUnarchive(chat.id)}
                  disabled={unarchivingId === chat.id}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-sunken disabled:opacity-60"
                >
                  {unarchivingId === chat.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  )}
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(chat)}
                  title="Delete chat"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <p className="px-5 py-3 text-xs text-faint">
            {chats.length} archived chat{chats.length === 1 ? "" : "s"}
          </p>
        </SettingsCard>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete chat"
        description={`Permanently delete "${deleteTarget?.title || "Untitled chat"}"? This can't be undone.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
