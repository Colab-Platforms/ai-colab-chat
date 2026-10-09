"use client";

import { useState, useEffect, useRef, memo, type MouseEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Edit2,
  CornerUpRight,
  Share,
  Archive,
  Trash2,
  FolderPlus,
  Pin,
  PinOff,
} from "lucide-react";
import { useIsChatActive } from "@/lib/route-ui-store";
import type { Chat, FolderItem } from "@/components/sidebar/sidebar-types";

export const ChatItem = memo(function ChatItem({
  chat,
  folders,
  isActive: isActiveProp,
  onDelete,
  onArchive,
  onPin,
  onNavigate,
  onRename,
  onMove,
  onShare,
  onCreateFolderForMove,
  pendingMoveNewFolderId,
  onPendingMoveConsumed,
  indent,
}: {
  chat: Chat;
  folders: FolderItem[];
  isActive: boolean;
  onDelete: (e: MouseEvent, id: number) => void;
  onArchive: (e: MouseEvent, id: number) => void;
  onPin: (id: number) => void;
  onNavigate: () => void;
  onRename: (chatId: number, title: string) => void;
  onMove: (chatId: number, folderId: number | null) => void;
  onShare: (chatId: number) => void;
  onCreateFolderForMove: (chatId: number) => void;
  pendingMoveNewFolderId: number | null;
  onPendingMoveConsumed: () => void;
  indent?: boolean;
}) {
  const isActiveFromRoute = useIsChatActive(chat.id);
  const isActive = isActiveProp || isActiveFromRoute;
  const [renameOpen, setRenameOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(chat.title || "");
  const [moveOpen, setMoveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>(chat.folderId?.toString() || "none");
  const chatItemRenderCountRef = useRef(0);

  useEffect(() => {
    if (pendingMoveNewFolderId !== null) {
      setSelectedFolder(pendingMoveNewFolderId.toString());
      setMoveOpen(true);
      onPendingMoveConsumed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMoveNewFolderId]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    chatItemRenderCountRef.current += 1;
    console.debug("[ChatItem render]", {
      chatId: chat.id,
      count: chatItemRenderCountRef.current,
      isActive,
    });
  });

  const handleMoveClick = () => {
    if (folders.length === 0) {
      onCreateFolderForMove(chat.id);
    } else {
      setSelectedFolder(chat.folderId?.toString() || "none");
      setMoveOpen(true);
    }
  };

  return (
    <div className="group relative w-full">
      <Link
        href={`/c/${chat.id}`}
        onClick={() => {
          try {
            if (chat.folderId && chat.folderId > 0) {
              localStorage.setItem("sidebar_active_chat_hint_id", String(chat.id));
              localStorage.setItem("sidebar_active_chat_hint_folder_id", String(chat.folderId));
            } else {
              localStorage.removeItem("sidebar_active_chat_hint_id");
              localStorage.removeItem("sidebar_active_chat_hint_folder_id");
            }
          } catch {
            // ignore localStorage issues
          }
          onNavigate();
        }}
        className={`flex w-full min-w-0 items-center gap-2 py-2 pr-10 rounded-lg text-[13.5px] transition-colors cursor-pointer ${
          indent ? "pl-9" : "pl-3"
        } ${
          isActive
            ? "bg-accent-soft text-accent-ink font-medium"
            : "hover:bg-sidebar-accent text-foreground"
        }`}
      >
        <span className="truncate flex-1" title={chat.title || "New Chat"}>
          {chat.title || "New Chat"}
        </span>
      </Link>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
        {chat.isPinned && (
          <Button
            variant="ghost"
            className="h-7 w-7 p-0 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(chat.id); }}
            title="Unpin"
          >
            <Pin className="w-3 h-3" />
          </Button>
        )}
        <div className={chat.isPinned ? `overflow-hidden transition-[width] duration-150 ${menuOpen ? "w-7" : "w-7 md:w-0 md:group-hover:w-7"}` : ""}>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-7 w-7 p-0 rounded text-muted-foreground transition-opacity hover:text-foreground hover:bg-sidebar-accent md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onShare(chat.id)} className="gap-2 cursor-pointer">
                <Share className="w-3.5 h-3.5" /> Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPin(chat.id)} className="gap-2 cursor-pointer">
                {chat.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                {chat.isPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewTitle(chat.title || ""); setRenameOpen(true); }} className="gap-2 cursor-pointer">
                <Edit2 className="w-3.5 h-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleMoveClick} className="gap-2 cursor-pointer">
                <CornerUpRight className="w-3.5 h-3.5" /> Move to project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); onArchive(e as MouseEvent, chat.id); }} className="gap-2 cursor-pointer">
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); onDelete(e as MouseEvent, chat.id); }} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Chat title" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={() => { onRename(chat.id, newTitle); setRenameOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Move to Project</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Project</SelectItem>
                {folders.map(f => (
                  <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5 h-8 border border-dashed border-border/50"
              onClick={() => { setMoveOpen(false); onCreateFolderForMove(chat.id); }}
            >
              <FolderPlus className="w-3.5 h-3.5" /> Create new folder
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button
              disabled={selectedFolder === "none"}
              onClick={() => {
                onMove(chat.id, selectedFolder === "none" ? null : parseInt(selectedFolder, 10));
                setMoveOpen(false);
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}, (prev, next) => {
  if (prev.isActive !== next.isActive) return false;
  if (prev.pendingMoveNewFolderId !== next.pendingMoveNewFolderId) return false;
  if (prev.indent !== next.indent) return false;
  if (prev.chat.id !== next.chat.id) return false;
  if (prev.chat.title !== next.chat.title) return false;
  if (prev.chat.folderId !== next.chat.folderId) return false;
  if (prev.chat.isPinned !== next.chat.isPinned) return false;
  if (prev.chat.isArchived !== next.chat.isArchived) return false;
  if (prev.chat.updatedAt !== next.chat.updatedAt) return false;
  if (prev.folders.length !== next.folders.length) return false;
  for (let i = 0; i < prev.folders.length; i += 1) {
    if (
      prev.folders[i].id !== next.folders[i].id ||
      prev.folders[i].name !== next.folders[i].name
    ) {
      return false;
    }
  }
  return true;
});
