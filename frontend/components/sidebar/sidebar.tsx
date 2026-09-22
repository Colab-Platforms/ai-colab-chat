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
import { Plus, Search, Star, AudioLines, FolderArchive } from "lucide-react";
import { chatService, folderService } from "@/lib/services";
import { getRouteUiSnapshot, subscribeRouteUi, useIsStarredRoute, useIsVoiceRoute, useIsAssetsRoute } from "@/lib/route-ui-store";
import { toast } from "@/lib/toast";
import { AppSidebar } from "./app-sidebar";
import type { Assistant, Chat, FolderItem } from "./sidebar-types";
import { ProjectsSection } from "./sidebar-projects-section";
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(searchQuery);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const getDraftFolderScope = () => {
    const arr = Array.from(expandedFolders);
    if (arr.length === 1) return arr[0];
    return null;
  };
  const [projectsExpanded, setProjectsExpanded] = useState(false);
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
        projectsExpanded: boolean;
        assistantsExpanded: boolean;
        chatsExpanded: boolean;
      }>;

      if (typeof parsed.projectsExpanded === "boolean") setProjectsExpanded(parsed.projectsExpanded);
      if (typeof parsed.assistantsExpanded === "boolean") setAssistantsExpanded(parsed.assistantsExpanded);
      if (typeof parsed.chatsExpanded === "boolean") setChatsExpanded(parsed.chatsExpanded);
    } catch {
      // ignore invalid localStorage payload
    } finally {
      setHasHydratedTopAccordion(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasHydratedTopAccordion) return;
    try {
      localStorage.setItem(
        TOP_ACCORDION_STORAGE_KEY,
        JSON.stringify({
          projectsExpanded,
          assistantsExpanded,
          chatsExpanded,
        }),
      );
    } catch {
      // ignore quota / private browsing errors
    }
  }, [hasHydratedTopAccordion, projectsExpanded, assistantsExpanded, chatsExpanded]);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderTarget, setRenameFolderTarget] = useState<{ id: number; name: string } | null>(null);

  const [deleteFolderTarget, setDeleteFolderTarget] = useState<number | null>(null);

  const [pendingMoveForChat, setPendingMoveForChat] = useState<number | null>(null);
  const [pendingMoveNewFolderId, setPendingMoveNewFolderId] = useState<number | null>(null);
  const sidebarRenderCountRef = useRef(0);
  const chatFolderByIdRef = useRef<Map<number, number | null>>(new Map());
  const pendingNewChatContextsKey = "pending_new_chat_context_ids";
  const pendingNewChatFolderIdKey = "pending_new_chat_folder_id";

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
    const nextFolderId = folderId && folderId > 0 ? folderId : null;

    onMobileClose();
    localStorage.removeItem("selectedAssistantId");
    localStorage.removeItem(pendingNewChatContextsKey);
    localStorage.removeItem(pendingNewChatFolderIdKey);
    if (nextFolderId) {
      localStorage.setItem(pendingNewChatFolderIdKey, String(nextFolderId));
    }
    window.dispatchEvent(new Event("assistant-selected"));

    window.dispatchEvent(
      new CustomEvent("pending-new-chat-folder-updated", {
        detail: { folderId: nextFolderId },
      }),
    );
    // HomeFolderScopeSync (app/(chat)/home/page.tsx) treats the URL's
    // `folderId` param as the source of truth and clears localStorage whenever
    // it's absent — so navigating to a bare "/home" would immediately wipe the
    // value just set above. Carry it through the URL too so the two stay in sync.
    const homeHref = nextFolderId ? `/home?folderId=${nextFolderId}` : "/home";
    if (routeUiRef.current.isDraftRoute) {
      // Already on the new-chat screen, so no navigation (and thus no
      // HomeFolderScopeSync re-run) will happen. Update the URL in place
      // anyway so it can't go stale and later resync localStorage backwards.
      router.replace(homeHref);
      return;
    }
    router.push(homeHref);
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

  const handleRenameFolder = async (folderId: number, newName: string) => {
    try {
      await folderService.update(folderId, { name: newName });
      toast.success("Folder renamed");
      onRefresh();
      setRenameFolderTarget(null);
    } catch {
      toast.error("Failed to rename folder");
    }
  };

  const handleDeleteFolder = async (deleteChats: boolean) => {
    if (!deleteFolderTarget) return;
    setDeleting(true);
    try {
      await folderService.delete(deleteFolderTarget, deleteChats);
      toast.success(deleteChats ? "Folder and chats deleted" : "Folder deleted, chats moved out");
      onRefresh();
      setDeleteFolderTarget(null);
    } catch {
      toast.error("Failed to delete folder");
    } finally {
      setDeleting(false);
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

  const syncDraftFolderScope = (nextFolderId: number | null) => {
    try {
      if (nextFolderId && nextFolderId > 0) {
        localStorage.setItem(pendingNewChatFolderIdKey, String(nextFolderId));
      } else {
        localStorage.removeItem(pendingNewChatFolderIdKey);
      }
    } catch {
      // localStorage can fail in some environments; accordion must still work.
    }

    try {
      localStorage.removeItem(pendingNewChatContextsKey);
    } catch {
      // ignore
    }

    window.dispatchEvent(
      new CustomEvent("pending-new-chat-folder-updated", {
        detail: { folderId: nextFolderId },
      }),
    );
  };

  const toggleFolder = (folderId: number) => {
    const isCurrentlyExpanded = expandedFolders.has(folderId);
    const nextScopeFolderId: number | null = isCurrentlyExpanded ? null : folderId;

    setExpandedFolders((prev) => {
      const next = new Set<number>();
      if (prev.has(folderId)) return next;
      next.add(folderId);
      return next;
    });

    // Always sync pending folder for new chat — not only when isDraftRoute. Otherwise
    // switching folder 1 → 2 on /new (previously not "draft") or brief route/store lag
    // leaves stale pending_new_chat_folder_id; NewChatPage reads LS at send time.
    syncDraftFolderScope(nextScopeFolderId);
  };

  useEffect(() => {
    if (projectsExpanded) return;
    setExpandedFolders(new Set());
    syncDraftFolderScope(null);
  }, [projectsExpanded]);

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
            onClick={() => handleNewChat(getDraftFolderScope())}
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
          onClick={() => handleNewChat(getDraftFolderScope())}
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

          <ProjectsSection
            projectsExpanded={projectsExpanded}
            setProjectsExpanded={setProjectsExpanded}
            safeFolders={safeFolders}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            search={search}
            onRefresh={onRefresh}
            onMobileClose={onMobileClose}
            handleArchiveChat={handleArchiveChat}
            handlePinChat={handlePinChat}
            handleRenameChat={handleRenameChat}
            handleMoveChat={handleMoveChat}
            handleShareChat={handleShareChat}
            handleOpenCreateFolderForMove={handleOpenCreateFolderForMove}
            localFolders={localFolders}
            pendingMoveForChat={pendingMoveForChat}
            pendingMoveNewFolderId={pendingMoveNewFolderId}
            setPendingMoveForChat={setPendingMoveForChat}
            setPendingMoveNewFolderId={setPendingMoveNewFolderId}
            setRenameFolderTarget={setRenameFolderTarget}
            setDeleteFolderTarget={setDeleteFolderTarget}
            setDeleteTarget={setDeleteTarget}
            filteredChats={filteredChats}
            setCreateFolderOpen={setCreateFolderOpen}
            onNewChatInFolder={(folderId: number) => handleNewChat(folderId)}
          />

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

      <Dialog open={!!renameFolderTarget} onOpenChange={(open) => !open && setRenameFolderTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameFolderTarget?.name || ""}
              onChange={(e) => setRenameFolderTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && renameFolderTarget) handleRenameFolder(renameFolderTarget.id, renameFolderTarget.name); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFolderTarget(null)}>Cancel</Button>
            <Button onClick={() => renameFolderTarget && handleRenameFolder(renameFolderTarget.id, renameFolderTarget.name)} disabled={!renameFolderTarget?.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFolderTarget} onOpenChange={(open) => !open && setDeleteFolderTarget(null)}>
        <DialogContent className="w-[94vw] max-w-[calc(100vw-2rem)] sm:max-w-[720px] p-6">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm text-muted-foreground text-center sm:text-left">
            What would you like to do with the chats and contexts inside this project?
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:flex-nowrap">
            <Button
              variant="outline"
              onClick={() => setDeleteFolderTarget(null)}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-between sm:flex-nowrap">
            <Button
              variant="outline"
              onClick={() => handleDeleteFolder(false)}
              disabled={deleting}
              className="w-full sm:w-auto border-primary/40 text-primary hover:bg-primary/5 text-xs sm:text-sm"
            >
              {deleting ? "Moving..." : "Move chats & contexts out"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDeleteFolder(true)}
              disabled={deleting}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              {deleting ? "Deleting..." : "Delete chats & contexts"}
            </Button>
            </div>
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
