"use client";

import { memo, type Dispatch, type SetStateAction } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Star, AudioLines, FolderArchive } from "lucide-react";
import { ChatItem } from "@/components/sidebar/sidebar-chat-item";
import { SIDEBAR_SECTION_HEADER_ROW, SIDEBAR_SECTION_TITLE } from "@/components/sidebar/sidebar-section-styles";
import type { Chat, FolderItem } from "@/components/sidebar/sidebar-types";
import { useIsStarredRoute, useIsVoiceRoute, useIsAssetsRoute } from "@/lib/route-ui-store";

export const ChatsSection = memo(function ChatsSection({
  chatsExpanded,
  setChatsExpanded,
  onMobileClose,
  router,
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
  onLoadMore,
}: {
  chatsExpanded: boolean;
  setChatsExpanded: Dispatch<SetStateAction<boolean>>;
  onMobileClose: () => void;
  router: AppRouterInstance;
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
  onLoadMore?: () => void;
}) {
  const isStarredRoute = useIsStarredRoute();
  const isVoiceRoute = useIsVoiceRoute();
  const isAssetsRoute = useIsAssetsRoute();
  return (
    <>
      <div className={`${SIDEBAR_SECTION_HEADER_ROW}`}>
        <button
          type="button"
          className="min-w-0 flex-1 py-2.5 px-3 text-left"
          onClick={() => setChatsExpanded((p) => !p)}
        >
          <span className={`block w-full text-left ${SIDEBAR_SECTION_TITLE}`}>Chats</span>
        </button>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/80"
          onClick={() => setChatsExpanded((p) => !p)}
          aria-expanded={chatsExpanded}
          aria-label={chatsExpanded ? "Collapse chats" : "Expand chats"}
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${chatsExpanded ? "rotate-90" : ""}`}
          />
        </button>
      </div>
      {chatsExpanded && (
        <>
          <button
            onClick={() => { onMobileClose(); router.push("/starred"); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              isStarredRoute
                ? "bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 text-foreground font-medium"
                : "text-foreground hover:bg-sidebar-accent"
            }`}
          >
            <Star className={`w-4 h-4 ${isStarredRoute ? "fill-current text-yellow-500" : "text-muted-foreground"}`} />
            <span>Starred Messages</span>
          </button>
          <button
            onClick={() => { onMobileClose(); router.push("/voice"); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              isVoiceRoute
                ? "bg-gradient-to-r from-primary/20 to-primary/10 text-foreground font-medium"
                : "text-foreground hover:bg-sidebar-accent"
            }`}
          >
            <AudioLines className={`w-4 h-4 ${isVoiceRoute ? "text-primary" : "text-muted-foreground"}`} />
            <span>Voice Chats</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded-md">
              Beta
            </Badge>
          </button>
          <button
            onClick={() => { onMobileClose(); router.push("/assets"); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              isAssetsRoute
                ? "bg-gradient-to-r from-primary/20 to-primary/10 text-foreground font-medium"
                : "text-foreground hover:bg-sidebar-accent"
            }`}
          >
            <FolderArchive className={`w-4 h-4 ${isAssetsRoute ? "text-primary" : "text-muted-foreground"}`} />
            <span>Assets Vault</span>
          </button>
          {unfoldered.map((chat) => (
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

          {hasMore && (
            <Button
              variant="ghost"
              className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground h-8 cursor-pointer"
              onClick={onLoadMore}
            >
              Load More Chats
            </Button>
          )}
        </>
      )}
    </>
  );
}, (prev, next) => {
  if (prev.chatsExpanded !== next.chatsExpanded) return false;
  if (Boolean(prev.hasMore) !== Boolean(next.hasMore)) return false;
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
      a.isArchived !== b.isArchived
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
