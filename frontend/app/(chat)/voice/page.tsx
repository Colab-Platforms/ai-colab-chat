"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AudioLines,
  Plus,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Check,
  MessageSquare,
  Pin,
} from "lucide-react";
import { chatService } from "@/lib/services";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VoiceChatMenu } from "@/components/chat/voice-chat-menu";

const VoiceModal = dynamic(
  () =>
    import("@/components/chat/voice-modal").then((m) => ({
      default: m.VoiceModal,
    })),
  { ssr: false, loading: () => null },
);

interface VoiceChat {
  id: number;
  title: string | null;
  updatedAt: string;
  createdAt: string;
  isPinned?: boolean;
  folderId?: number | null;
  _count?: { messages: number };
}

type SortKey = "updatedAt:desc" | "createdAt:desc" | "createdAt:asc" | "title:asc";
type ViewMode = "grid" | "list";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updatedAt:desc", label: "Last updated" },
  { key: "createdAt:desc", label: "Newest first" },
  { key: "createdAt:asc", label: "Oldest first" },
  { key: "title:asc", label: "Title A-Z" },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function VoiceChatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<VoiceChat[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedAt:desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const newChatIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const stored = localStorage.getItem("voiceChatsViewMode");
    if (stored === "grid" || stored === "list") setViewMode(stored);
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("voiceChatsViewMode", mode);
  };

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        capability: "VOICE",
        isArchived: "false",
        pageSize: "100",
        sort,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await chatService.list(params);
      setChats(res.data.data?.data || []);
    } catch {
      toast.error("Failed to load voice chats");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sort]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const openNewChat = () => {
    newChatIdRef.current = undefined;
    setIsVoiceOpen(true);
  };

  const handleClose = () => {
    setIsVoiceOpen(false);
    if (newChatIdRef.current) {
      router.push(`/voice/${newChatIdRef.current}`);
    } else {
      fetchChats();
    }
  };

  const sortLabel = useMemo(
    () => SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Sort",
    [sort],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 px-6 py-5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Voice Chats</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Every conversation you've had with ColabAI out loud, saved just like a normal chat.
            </p>
          </div>
          <button
            onClick={openNewChat}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Toolbar: search / sort / view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voice chats..."
              className="w-full h-9 pl-9 pr-3 rounded-full border border-border/60 bg-muted/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-background transition-colors"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/60 bg-background text-xs font-medium text-foreground hover:bg-muted/60 transition-colors">
                  {sortLabel}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    className="gap-2 cursor-pointer"
                  >
                    <div className="w-3.5 flex justify-center">
                      {sort === opt.key && <Check className="w-3.5 h-3.5 text-primary" />}
                    </div>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-0.5 bg-muted/60 border border-border/40 rounded-full p-0.5">
            <button
              onClick={() => changeViewMode("grid")}
              title="Grid view"
              className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => changeViewMode("list")}
              title="List view"
              className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
                viewMode === "list"
                  ? "bg-white dark:bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <AudioLines className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-semibold">
              {debouncedSearch ? "No matching voice chats" : "No voice chats yet"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {debouncedSearch
                ? "Try a different search term."
                : "Start a conversation with ColabAI and it'll show up here, just like a normal chat."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="max-w-5xl mx-auto py-6 px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => router.push(`/voice/${chat.id}`)}
                className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/50 bg-background hover:border-primary/40 hover:shadow-md text-left transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <AudioLines className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {chat.isPinned && <Pin className="w-3.5 h-3.5 text-primary fill-current" />}
                    {!!chat._count?.messages && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                        <MessageSquare className="w-3 h-3" />
                        {chat._count.messages}
                      </span>
                    )}
                    <VoiceChatMenu
                      chatId={chat.id}
                      title={chat.title}
                      isPinned={chat.isPinned}
                      folderId={chat.folderId}
                      onChanged={fetchChats}
                      onDeleted={fetchChats}
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{chat.title || "Voice Chat"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(chat.updatedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-4 px-4 flex flex-col gap-1.5">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => router.push(`/voice/${chat.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-background hover:bg-muted/60 text-left transition-colors cursor-pointer"
              >
                <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <AudioLines className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {chat.isPinned && <Pin className="w-3 h-3 text-primary fill-current flex-shrink-0" />}
                    <span className="truncate">{chat.title || "Voice Chat"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(chat.updatedAt)}
                  </p>
                </div>
                {!!chat._count?.messages && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 flex-shrink-0">
                    <MessageSquare className="w-3 h-3" />
                    {chat._count.messages}
                  </span>
                )}
                <VoiceChatMenu
                  chatId={chat.id}
                  title={chat.title}
                  isPinned={chat.isPinned}
                  folderId={chat.folderId}
                  onChanged={fetchChats}
                  onDeleted={fetchChats}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <VoiceModal
        open={isVoiceOpen}
        onClose={handleClose}
        onChatId={(id) => {
          newChatIdRef.current = id;
        }}
      />
    </div>
  );
}
