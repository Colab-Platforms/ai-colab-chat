"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Link2, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { chatService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelAvatar, ModelAvatarStack } from "./model-avatar";

interface HeaderModel {
  id: number;
  name: string;
  externalId?: string | null;
}

/**
 * Desktop top bar of a conversation: title, which model(s) are answering,
 * Share and a small actions menu. (Mobile has its own bar in the layout.)
 */
export function ChatHeader({
  chatId,
  title,
  models,
  onTitleChange,
}: {
  chatId: number;
  title: string;
  models: HeaderModel[];
  onTitleChange: (title: string) => void;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refreshSidebar = () =>
    window.dispatchEvent(new CustomEvent("refresh-chats", { detail: { immediate: true } }));

  const handleShare = async () => {
    try {
      const res = await chatService.share(chatId);
      const url = `${window.location.origin}/share/${res.data.data.shareId}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: title || "Colab AI chat", url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Failed to share chat");
    }
  };

  const handleRename = async () => {
    const next = draft.trim();
    if (!next) return;
    try {
      await chatService.update(chatId, { title: next });
      onTitleChange(next);
      setRenameOpen(false);
      refreshSidebar();
      toast.success("Chat renamed");
    } catch {
      toast.error("Failed to rename chat");
    }
  };

  const handleArchive = async () => {
    try {
      await chatService.archive(chatId);
      refreshSidebar();
      router.push("/home");
    } catch {
      toast.error("Failed to archive chat");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await chatService.delete(chatId);
      toast.success("Chat deleted");
      refreshSidebar();
      router.push("/home");
    } catch {
      toast.error("Failed to delete chat");
      setDeleting(false);
    }
  };

  return (
    <header className="hidden md:flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
      <h1 className="min-w-0 truncate text-[15px] font-medium text-foreground">{title || "New Chat"}</h1>

      {models.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-1.5 pr-2.5 text-xs text-muted-foreground">
          {models.length === 1 ? (
            <>
              <ModelAvatar externalId={models[0].externalId} name={models[0].name} size={16} />
              {models[0].name}
            </>
          ) : (
            <>
              <ModelAvatarStack models={models} size={16} />
              {models.length} models
            </>
          )}
        </span>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={handleShare}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:border-line-strong hover:bg-sidebar-accent cursor-pointer"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat actions"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground cursor-pointer data-[state=open]:bg-sidebar-accent"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={() => {
              setDraft(title || "");
              setRenameOpen(true);
            }}
          >
            <Pencil className="w-4 h-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/c/${chatId}`);
              toast.success("Link copied");
            }}
          >
            <Link2 className="w-4 h-4" /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleArchive}>
            <Archive className="w-4 h-4" /> Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              placeholder="Chat title"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!draft.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Chat"
        description="This will permanently delete this chat and all its messages. This action cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </header>
  );
}
