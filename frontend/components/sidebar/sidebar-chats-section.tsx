"use client";

import { memo, useMemo, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ChatItem } from "@/components/sidebar/sidebar-chat-item";
import type { Chat, FolderItem } from "@/components/sidebar/sidebar-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets chats (already newest-first) into sidebar date groups. */
function groupChatsByDate(chats: Chat[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();

  const order = ["Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];
  const buckets = new Map<string, Chat[]>(order.map((label) => [label, []]));

  for (const chat of chats) {
    let label: string;
    if (chat.isPinned) {
      label = "Pinned";
    } else {
      const t = new Date(chat.updatedAt).getTime();
      if (Number.isNaN(t) || t >= today) label = "Today";
      else if (t >= today - DAY_MS) label = "Yesterday";
      else if (t >= today - 7 * DAY_MS) label = "Previous 7 days";
      else if (t >= today - 30 * DAY_MS) label = "Previous 30 days";
      else label = "Older";
    }
    buckets.get(label)!.push(chat);
  }

  return order
    .map((label) => ({ label, chats: buckets.get(label)! }))
    .filter((g) => g.chats.length > 0);
}

export const ChatsSection = memo(function ChatsSection({
  onMobileClose,
  unfoldered,
  localFolders,
  setDeleteTarget,
  handleArchiveChat,
  handlePinChat,
  handleRenameChat,
  handleMoveChat,
  handleShareChat,
  handleOpenCreateFolderForMove,
  pendingMoveForChat,
  pendingMoveNewFolderId,
  setPendingMoveForChat,
  setPendingMoveNewFolderId,
  hasMore,
  loadingMoreChats,
  onLoadMore,
}: {
  onMobileClose: () => void;
  unfoldered: Chat[];
  localFolders: FolderItem[];
  setDeleteTarget: Dispatch<SetStateAction<number | null>>;
  handleArchiveChat: (e: React.MouseEvent, chatId: number) => void;
  handlePinChat: (chatId: number) => void;
  handleRenameChat: (chatId: number, newTitle: string) => void;
  handleMoveChat: (chatId: number, folderId: number | null) => void;
  handleShareChat: (chatId: number) => void;
  handleOpenCreateFolderForMove: (chatId: number) => void;
  pendingMoveForChat: number | null;
  pendingMoveNewFolderId: number | null;
  setPendingMoveForChat: Dispatch<SetStateAction<number | null>>;
  setPendingMoveNewFolderId: Dispatch<SetStateAction<number | null>>;
  hasMore?: boolean;
  loadingMoreChats?: boolean;
  onLoadMore?: () => void;
}) {
  const groups = useMemo(() => groupChatsByDate(unfoldered), [unfoldered]);
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="pb-2">
          <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-faint">{group.label}</div>
          {group.chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              folders={localFolders}
              isActive={false}
              onDelete={(e, id) => { e.stopPropagation(); e.preventDefault(); setDeleteTarget(id); }}
              onArchive={handleArchiveChat}
              onPin={handlePinChat}
              onNavigate={onMobileClose}
              onRename={handleRenameChat}
              onMove={handleMoveChat}
              onShare={handleShareChat}
              onCreateFolderForMove={handleOpenCreateFolderForMove}
              pendingMoveNewFolderId={pendingMoveForChat === chat.id ? pendingMoveNewFolderId : null}
              onPendingMoveConsumed={() => { setPendingMoveForChat(null); setPendingMoveNewFolderId(null); }}
            />
          ))}
        </div>
      ))}

      {hasMore && (
        <div className="mt-2 flex w-full min-w-0 justify-start px-1">
          <Button
            variant="ghost"
            className="h-auto min-h-8 w-full max-w-full min-w-0 cursor-pointer justify-start whitespace-normal break-words px-2 py-1.5 text-left text-xs leading-tight text-muted-foreground hover:text-foreground"
            onClick={onLoadMore}
            disabled={loadingMoreChats}
          >
            {loadingMoreChats ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Loading...
              </>
            ) : (
              <span className="block whitespace-normal break-words">
                Load More Chats
              </span>
            )}
          </Button>
        </div>
      )}
    </>
  );
}, (prev, next) => {
  if (Boolean(prev.hasMore) !== Boolean(next.hasMore)) return false;
  if (Boolean(prev.loadingMoreChats) !== Boolean(next.loadingMoreChats)) return false;
  if (prev.onLoadMore !== next.onLoadMore) return false;
  if (prev.pendingMoveForChat !== next.pendingMoveForChat) return false;
  if (prev.pendingMoveNewFolderId !== next.pendingMoveNewFolderId) return false;
  if (prev.unfoldered.length !== next.unfoldered.length) return false;
  if (prev.localFolders.length !== next.localFolders.length) return false;

  for (let i = 0; i < prev.unfoldered.length; i += 1) {
    const a = prev.unfoldered[i];
    const b = next.unfoldered[i];
    if (
      a.id !== b.id ||
      a.title !== b.title ||
      a.folderId !== b.folderId ||
      a.isPinned !== b.isPinned ||
      a.isArchived !== b.isArchived ||
      a.updatedAt !== b.updatedAt
    ) {
      return false;
    }
  }
  for (let i = 0; i < prev.localFolders.length; i += 1) {
    if (
      prev.localFolders[i].id !== next.localFolders[i].id ||
      prev.localFolders[i].name !== next.localFolders[i].name
    ) {
      return false;
    }
  }
  return true;
});
