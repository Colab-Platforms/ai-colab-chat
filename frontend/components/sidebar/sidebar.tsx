"use client";

export { AppSidebar } from "./app-sidebar";
export type { AppSidebarProps } from "./app-sidebar";

import { useState, useEffect, useCallback, useMemo, useRef, memo, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, Star, AudioLines, FolderArchive, Folder } from "lucide-react";
import { chatService, folderService } from "@/lib/services";
import { getRouteUiSnapshot, subscribeRouteUi, useIsStarredRoute, useIsVoiceRoute, useIsAssetsRoute, useIsProjectsRoute } from "@/lib/route-ui-store";
import { toast } from "@/lib/toast";
import { startNewChatInFolder } from "@/lib/newChat";
import { AppSidebar } from "./app-sidebar";
import type { Assistant, Chat, FolderItem } from "./sidebar-types";
import { AssistantsSection } from "./sidebar-assistants-section";
import { ChatsSection } from "./sidebar-chats-section";

interface SidebarProps {
  chats: Chat[];
  folders: FolderItem[];
  assistants: Assistant[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  assistantsHasMore?: boolean;
  onLoadMoreAssistants?: () => void;
  onRefresh: () => void;
  onMobileClose: () => void;
  onLogout?: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function SidebarInner({
  chats,
  folders = [],
  assistants,
  searchQuery,
  onSearchChange,
  assistantsHasMore,
  onLoadMoreAssistants,
  onRefresh,
  onMobileClose,
  onLogout,
  hasMore,
  onLoadMore,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const router = useRouter();
  const activeChatIdRef = useRef<number | null>(getRouteUiSnapshot().activeChatId);
  const routeUiRef = useRef(getRouteUiSnapshot());

  useEffect(() => {
    const unsub = subscribeRouteUi(() => {
      const snapshot = getRouteUiSnapshot();
      routeUiRef.current = snapshot;
      activeChatIdRef.current = snapshot.activeChatId;
    });
    routeUiRef.current = getRouteUiSnapshot();
    activeChatIdRef.current = routeUiRef.current.activeChatId;
    return unsub;
  }, []);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const isStarredRoute = useIsStarredRoute();
  const isVoiceRoute = useIsVoiceRoute();
  const isAssetsRoute = useIsAssetsRoute();
  const isProjectsRoute = useIsProjectsRoute();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(searchQuery);
  const [assistantsExpanded, setAssistantsExpanded] = useState(true);
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const TOP_ACCORDION_STORAGE_KEY = "sidebarTopAccordionState_v1";
  const [hasHydratedTopAccordion, setHasHydratedTopAccordion] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOP_ACCORDION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        assistantsExpanded: boolean;
        chatsExpanded: boolean;
      }>;

      if (typeof parsed.assistantsExpanded === "boolean") setAssistantsExpanded(parsed.assistantsExpanded);
      if (typeof parsed.chatsExpanded === "boolean") setChatsExpanded(parsed.chatsExpanded);
    } catch {
      // ignore invalid localStorage payload
    } finally {
      setHasHydratedTopAccordion(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedTopAccordion) return;
    try {
      localStorage.setItem(
        TOP_ACCORDION_STORAGE_KEY,
        JSON.stringify({
          assistantsExpanded,
          chatsExpanded,
        }),
      );
    } catch {
      // ignore quota / private browsing errors
    }
  }, [hasHydratedTopAccordion, assistantsExpanded, chatsExpanded]);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [pendingMoveForChat, setPendingMoveForChat] = useState<number | null>(null);
  const [pendingMoveNewFolderId, setPendingMoveNewFolderId] = useState<number | null>(null);
  const sidebarRenderCountRef = useRef(0);
  const chatFolderByIdRef = useRef<Map<number, number | null>>(new Map());

  const safeFolders = useMemo(() => (Array.isArray(folders) ? folders : []), [folders]);
  const [localFolders, setLocalFolders] = useState<FolderItem[]>(safeFolders);
  useEffect(() => {
    if (!pendingMoveForChat) {
      setLocalFolders(safeFolders);
    }
  }, [safeFolders, pendingMoveForChat]);

  useEffect(() => {
    setSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handler = () => {
      setCreateFolderOpen(true);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("open-create-folder-dialog", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("open-create-folder-dialog", handler);
      }
    };
  }, []);

  useEffect(() => {
    const next = new Map<number, number | null>();
    for (const c of chats) {
      next.set(c.id, c.folderId ?? null);
    }
    chatFolderByIdRef.current = next;
  }, [chats]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    sidebarRenderCountRef.current += 1;
    const snap = getRouteUiSnapshot();
    console.debug("[SidebarInner render]", {
      count: sidebarRenderCountRef.current,
      activeChatId: snap.activeChatId,
      isDraftRoute: snap.isDraftRoute,
      isStarredRoute: snap.isStarredRoute,
      chats: chats.length,
      folders: localFolders.length,
      assistants: assistants.length,
    });
  });

  const handleCreateFolder = async (
    opts?: { forChatId?: number }
  ) => {
    if (!newFolderName.trim()) return;
    try {
      const res = await folderService.create({ name: newFolderName.trim() });
      const created: FolderItem = { id: res.data.data.id, name: newFolderName.trim() };
      toast.success("Folder created");
      setNewFolderName("");
      setCreateFolderOpen(false);

      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("folder-created"));
        }
      } catch {
        // ignore cross-environment issues
      }

      if (opts?.forChatId !== undefined) {
        setLocalFolders(prev => [created, ...prev]);
        setPendingMoveNewFolderId(created.id);
        setPendingMoveForChat(opts.forChatId);
      }
      onRefresh();
    } catch {
      toast.error("Failed to create folder");
    }
  };

  const handleNewChat = (folderId?: number | null) => {
    onMobileClose();
    startNewChatInFolder(router, folderId, { isDraftRoute: routeUiRef.current.isDraftRoute });
  };

  const handleDeleteChat = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await chatService.delete(deleteTarget);
      toast.success("Chat deleted");
      onRefresh();
      if (activeChatIdRef.current === deleteTarget) {
        router.push("/home");
      }
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete chat");
    } finally {
      setDeleting(false);
    }
  };

  const handleArchiveChat = async (e: MouseEvent, chatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await chatService.archive(chatId);
      onRefresh();
      if (activeChatIdRef.current === chatId) {
        router.push("/home");
      }
    } catch { /* ignore */ }
  };

  const handlePinChat = async (chatId: number) => {
    try {
      await chatService.pin(chatId);
      onRefresh();
    } catch {
      toast.error("Failed to update pin");
    }
  };

  const handleRenameChat = async (chatId: number, newTitle: string) => {
    try {
      await chatService.update(chatId, { title: newTitle });
      toast.success("Chat renamed");
      onRefresh();
    } catch {
      toast.error("Failed to rename chat");
    }
  };

  const handleMoveChat = async (chatId: number, folderId: number | null) => {
    try {
      await chatService.update(chatId, { folderId });
      toast.success("Chat moved");
      onRefresh();
    } catch {
      toast.error("Failed to move chat");
    }
  };

  const handleShareChat = async (chatId: number) => {
    try {
      const res = await chatService.share(chatId);
      const shareUrl = `${window.location.origin}/share/${res.data.data.shareId}`;
      const chatTitle = chats.find((chat) => chat.id === chatId)?.title || "AI Colab Chat";

      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: chatTitle,
            text: "Check out this chat on AI Colab",
            url: shareUrl,
          });
          toast.success("Chat shared successfully!");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch {
      toast.error("Failed to share chat");
    }
  };

  const handleOpenCreateFolderForMove = (chatId: number) => {
    setPendingMoveForChat(chatId);
    setPendingMoveNewFolderId(null);
    setCreateFolderOpen(true);
  };

  const handleAssistantSelected = useCallback((assistant: Assistant) => {
    onMobileClose();
    localStorage.setItem("selectedAssistantId", String(assistant.id));
    window.dispatchEvent(
      new CustomEvent("assistant-selected", {
        detail: { assistant },
      }),
    );
    routerRef.current.push("/home");
  }, [onMobileClose]);

  const filteredChats = useMemo(() => chats.filter((c: Chat) => !c.isArchived), [chats]);

  const unfoldered = useMemo(() => {
    const sortByPin = (a: Chat, b: Chat) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    return filteredChats.filter((c: Chat) => !c.folderId).slice().sort(sortByPin);
  }, [filteredChats]);

  const collapsedIcons = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-lg cursor-pointer"
            onClick={() => handleNewChat()}
          >
            <Plus className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">New Chat</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-lg cursor-pointer"
            onClick={() => {
              if (onToggleCollapse) onToggleCollapse();
              setTimeout(() => {
                searchInputRef.current?.focus();
              }, 100);
            }}
          >
            <Search className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Search chats</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 rounded-lg cursor-pointer ${
              isStarredRoute
                ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/15"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            }`}
            onClick={() => { onMobileClose(); router.push("/starred"); }}
          >
            <Star className={`w-4 h-4 ${isStarredRoute ? "fill-current" : ""}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Starred Messages</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 rounded-lg cursor-pointer ${
              isVoiceRoute
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            }`}
            onClick={() => { onMobileClose(); router.push("/voice"); }}
          >
            <AudioLines className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Voice Chats</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 rounded-lg cursor-pointer ${
              isAssetsRoute
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            }`}
            onClick={() => { onMobileClose(); router.push("/assets"); }}
          >
            <FolderArchive className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Assets Vault</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 rounded-lg cursor-pointer ${
              isProjectsRoute
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            }`}
            onClick={() => { onMobileClose(); router.push("/projects"); }}
          >
            <Folder className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Projects</TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <AppSidebar
      variant="chat"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onMobileClose={onMobileClose}
      onLogout={onLogout}
      collapsedIcons={collapsedIcons}
    >
      <div className="p-3 pb-2 space-y-2">
        <Button
          onClick={() => handleNewChat()}
          className="w-full justify-start gap-2 h-10 bg-violet-200/70 hover:bg-violet-200 text-violet-900 dark:bg-violet-500/20 dark:hover:bg-violet-500/30 dark:text-violet-200 border-0 shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search chats..."
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              onSearchChange(value);
            }}
            className="h-9 border-none bg-sidebar-accent/50 pl-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
          />
        </div>
      </div>

      <Separator className="opacity-50" />

      <ScrollArea className="flex-1 px-2 min-h-0">
        <div className="py-2 space-y-0.5">

          <button
            onClick={() => { onMobileClose(); router.push("/projects"); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              isProjectsRoute
                ? "bg-gradient-to-r from-primary/20 to-primary/10 text-foreground font-medium"
                : "text-foreground hover:bg-sidebar-accent"
            }`}
          >
            <Folder className={`w-4 h-4 ${isProjectsRoute ? "text-primary" : "text-muted-foreground"}`} />
            <span>Projects</span>
          </button>

          <AssistantsSection
            assistants={assistants}
            assistantsExpanded={assistantsExpanded}
            setAssistantsExpanded={setAssistantsExpanded}
            assistantsHasMore={assistantsHasMore}
            onLoadMoreAssistants={onLoadMoreAssistants}
            onAssistantSelected={handleAssistantSelected}
          />

          <ChatsSection
            chatsExpanded={chatsExpanded}
            setChatsExpanded={setChatsExpanded}
            onMobileClose={onMobileClose}
            router={router}
            unfoldered={unfoldered}
            localFolders={localFolders}
            setDeleteTarget={setDeleteTarget}
            handleArchiveChat={handleArchiveChat}
            handlePinChat={handlePinChat}
            handleRenameChat={handleRenameChat}
            handleMoveChat={handleMoveChat}
            handleShareChat={handleShareChat}
            handleOpenCreateFolderForMove={handleOpenCreateFolderForMove}
            pendingMoveForChat={pendingMoveForChat}
            pendingMoveNewFolderId={pendingMoveNewFolderId}
            setPendingMoveForChat={setPendingMoveForChat}
            setPendingMoveNewFolderId={setPendingMoveNewFolderId}
            hasMore={hasMore}
            onLoadMore={onLoadMore}
          />
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Chat"
        description="This will permanently delete this chat and all its messages. This action cannot be undone."
        onConfirm={handleDeleteChat}
        loading={deleting}
      />

      <Dialog open={createFolderOpen} onOpenChange={(open) => { setCreateFolderOpen(open); if (!open && !pendingMoveNewFolderId) setPendingMoveForChat(null); }}>
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
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(pendingMoveForChat !== null ? { forChatId: pendingMoveForChat } : undefined); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateFolderOpen(false); setPendingMoveForChat(null); }}>Cancel</Button>
            <Button
              onClick={() => handleCreateFolder(pendingMoveForChat !== null ? { forChatId: pendingMoveForChat } : undefined)}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppSidebar>
  );
}

export const Sidebar = memo(SidebarInner, (prev, next) => {
  const keys = Object.keys(next) as (keyof typeof next)[];
  let same = true;
  for (const key of keys) {
    if (prev[key] !== next[key]) {
      if (process.env.NODE_ENV === "development") {
        console.debug(`[Sidebar memo] prop "${String(key)}" changed`, { prev: prev[key], next: next[key] });
      }
      same = false;
    }
  }
  return same;
});
