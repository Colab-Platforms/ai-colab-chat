"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, Search } from "lucide-react";
import { chatService } from "@/lib/services";
import { startNewChatInFolder } from "@/lib/newChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FolderItem } from "@/components/sidebar/sidebar-types";

interface ModalChat {
  id: number;
  title: string | null;
  updatedAt: string;
}

function relativeTime(iso?: string) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const PAGE_SIZE = 10;

export function ProjectChatsModal({
  folder,
  onClose,
}: {
  folder: FolderItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [chats, setChats] = useState<ModalChat[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!folder) return;
    setSearch("");
    setDebouncedSearch("");
    setChats([]);
    setPage(1);
    setHasMore(false);
  }, [folder]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchChats = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!folder) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params: Record<string, string> = {
          folderId: String(folder.id),
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
          isArchived: "false",
        };
        if (debouncedSearch) params.search = debouncedSearch;
        const res = await chatService.list(params);
        const result = res.data.data;
        const fetched: ModalChat[] = result?.data || [];
        setChats((prev) => (append ? [...prev, ...fetched] : fetched));
        setPage(pageNum);
        setHasMore(Boolean(result?.hasNextPage));
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [folder, debouncedSearch],
  );

  useEffect(() => {
    if (!folder) return;
    fetchChats(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, debouncedSearch]);

  const startChat = () => {
    if (!folder) return;
    startNewChatInFolder(router, folder.id);
    onClose();
  };

  const openChat = (chatId: number) => {
    router.push(`/c/${chatId}`);
    onClose();
  };

  return (
    <Dialog open={!!folder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0 gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 flex items-center justify-center font-semibold text-sm">
              {folder?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="text-base">{folder?.name}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {folder?.description || "No description"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-3 flex items-center gap-2 border-b border-border/60">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats in this project..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          {chats.length > 0 && (
            <Button size="sm" onClick={startChat} className="gap-1.5 h-9 shrink-0 bg-violet-200/70 hover:bg-violet-200 text-violet-900 dark:bg-violet-500/20 dark:hover:bg-violet-500/30 dark:text-violet-200 border-0 cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold">
              {debouncedSearch ? "No matching chats" : "No chats yet in this project"}
            </h3>
            {!debouncedSearch && (
              <Button onClick={startChat} className="mt-4 gap-1.5 bg-violet-200/70 hover:bg-violet-200 text-violet-900 dark:bg-violet-500/20 dark:hover:bg-violet-500/30 dark:text-violet-200 border-0 cursor-pointer">
                <Plus className="w-4 h-4" />
                Start your first chat
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="p-2">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => openChat(chat.id)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-sidebar-accent transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0 truncate">{chat.title || "New Chat"}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(chat.updatedAt)}</span>
                </button>
              ))}
              {hasMore && (
                <Button
                  variant="ghost"
                  className="w-full mt-1 h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => fetchChats(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </Button>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
