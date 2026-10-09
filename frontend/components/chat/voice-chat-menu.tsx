"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  MoreHorizontal,
  Share,
  Pin,
  PinOff,
  Edit2,
  CornerUpRight,
  Archive,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { chatService, folderService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface VoiceChatMenuProps {
  chatId: number;
  title: string | null;
  isPinned?: boolean;
  folderId?: number | null;
  onChanged: () => void;
  onDeleted: () => void;
}

export function VoiceChatMenu({
  chatId,
  title,
  isPinned,
  folderId,
  onChanged,
  onDeleted,
}: VoiceChatMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(title || "");
  const [moveOpen, setMoveOpen] = useState(false);
  const [folders, setFolders] = useState<{ id: number; name: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>(
    folderId ? String(folderId) : "none",
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (moveOpen && folders.length === 0) {
      folderService
        .list({ pageSize: "100" })
        .then((res) => setFolders(res.data.data?.data || []))
        .catch(() => {});
    }
  }, [moveOpen, folders.length]);

  const stop = (e: MouseEvent) => e.stopPropagation();

  const handleShare = async () => {
    try {
      const res = await chatService.share(chatId);
      const shareUrl = `${window.location.origin}/share/${res.data.data.shareId}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: title || "Voice Chat",
            text: "Check out this voice chat",
            url: shareUrl,
          });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch {
      toast.error("Failed to share chat");
    }
  };

  const handlePin = async () => {
    try {
      await chatService.pin(chatId);
      onChanged();
    } catch {
      toast.error("Failed to update pin");
    }
  };

  const handleRename = async () => {
    try {
      await chatService.update(chatId, { title: newTitle });
      toast.success("Chat renamed");
      setRenameOpen(false);
      onChanged();
    } catch {
      toast.error("Failed to rename chat");
    }
  };

  const handleMove = async () => {
    try {
      await chatService.update(chatId, {
        folderId: selectedFolder === "none" ? null : Number(selectedFolder),
      });
      toast.success("Chat moved");
      setMoveOpen(false);
      onChanged();
    } catch {
      toast.error("Failed to move chat");
    }
  };

  const handleArchive = async () => {
    try {
      await chatService.archive(chatId);
      toast.success("Chat archived");
      onChanged();
    } catch {
      toast.error("Failed to archive chat");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await chatService.delete(chatId);
      toast.success("Chat deleted");
      setDeleteOpen(false);
      onDeleted();
    } catch {
      toast.error("Failed to delete chat");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div onClick={stop}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={stop}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            title="More"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stop}>
          <DropdownMenuItem onClick={handleShare} className="gap-2 cursor-pointer">
            <Share className="w-3.5 h-3.5" /> Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePin} className="gap-2 cursor-pointer">
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            {isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { setNewTitle(title || ""); setRenameOpen(true); }}
            className="gap-2 cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { setSelectedFolder(folderId ? String(folderId) : "none"); setMoveOpen(true); }}
            className="gap-2 cursor-pointer"
          >
            <CornerUpRight className="w-3.5 h-3.5" /> Move to project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleArchive} className="gap-2 cursor-pointer">
            <Archive className="w-3.5 h-3.5" /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="gap-2 text-destructive focus:text-destructive cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent onClick={stop}>
          <DialogHeader>
            <DialogTitle>Rename Voice Chat</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Chat title"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent onClick={stop}>
          <DialogHeader>
            <DialogTitle>Move to Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Project</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={handleMove}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete voice chat?"
        description="This permanently deletes the conversation and any documents generated in it. This action cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
