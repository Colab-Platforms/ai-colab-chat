"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  startTransition,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Menu, Settings, LogOut, Sun, Moon, ArrowRight } from "lucide-react";
import {
  chatService,
  folderService,
  assistantService,
  subscriptionService,
} from "@/lib/services";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/context/theme-context";
import { setRouteUiFromPathname } from "@/lib/route-ui-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sidebar } from "../sidebar/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StartupGuide } from "./startup-guide";
import { DocumentPanel } from "./document-panel";

interface Chat {
  id: number;
  title: string | null;
  folderId: number | null;
  isArchived: boolean;
  isPinned: boolean;
  updatedAt: string;
  assistantId?: number | null;
  assistant?: { id: number; name: string; icon: string } | null;
}

interface Assistant {
  id: number;
  name: string;
  description?: string | null;
  icon: string;
  bgFrom?: string | null;
  bgVia?: string | null;
  bgTo?: string | null;
  bgFromDark?: string | null;
  bgViaDark?: string | null;
  bgToDark?: string | null;
  isActive: boolean;
}

interface Folder {
  id: number;
  name: string;
}

export function ChatLayoutView({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const layoutRenderCountRef = useRef(0);
  layoutRenderCountRef.current += 1;
  if (process.env.NODE_ENV === "development") {
    console.debug("[ChatLayoutView render]", {
      count: layoutRenderCountRef.current,
      pathname,
    });
  }

  useEffect(() => {
    setRouteUiFromPathname(pathname);
  }, [pathname]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistantsPage, setAssistantsPage] = useState(1);
  const [assistantsHasMore, setAssistantsHasMore] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<number | null>(
    null,
  );
  const [activeAssistantTheme, setActiveAssistantTheme] =
    useState<Assistant | null>(null);
  const [planPopupOpen, setPlanPopupOpen] = useState(false);
  const chatsRef = useRef<Chat[]>([]);
  const chatAssistantCacheRef = useRef<Map<number, number | null>>(new Map());
  const chatAssistantInflightRef = useRef<Map<number, Promise<number | null>>>(
    new Map(),
  );
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const chatSearchRef = useRef(chatSearch);
  chatSearchRef.current = chatSearch;
  const pageRef = useRef(page);
  pageRef.current = page;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const assistantsPageRef = useRef(assistantsPage);
  assistantsPageRef.current = assistantsPage;
  const assistantsHasMoreRef = useRef(assistantsHasMore);
  assistantsHasMoreRef.current = assistantsHasMore;

  // Hydrate sidebar collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }, []);

  const isProfileRoute = pathname.startsWith("/profile");

  const fetchChats = useCallback(async (pageNum = 1, searchTerm?: string) => {
    const effectiveSearch = searchTerm ?? chatSearchRef.current;
    try {
      const res = await chatService.list({
        page: pageNum.toString(),
        pageSize: "6",
        isArchived: "false",
        ...(effectiveSearch
          ? { search: effectiveSearch }
          : { folderId: "null" }),
      });
      const result = res.data.data;
      const fetched = result?.data || [];

      setChats((prev) => {
        if (pageNum === 1) {
          const merged = fetched.map((bc: any) => {
            const existing = prev.find((pc: any) => pc.id === bc.id);
            if (!existing) return bc;
            if (
              existing.title === bc.title &&
              existing.folderId === bc.folderId &&
              existing.isPinned === bc.isPinned &&
              existing.isArchived === bc.isArchived &&
              existing.assistantId === bc.assistantId
            ) {
              return existing;
            }
            return { ...existing, ...bc };
          });
          if (
            prev.length === merged.length &&
            merged.every((m: any, i: number) => prev[i] === m)
          ) {
            return prev;
          }
          return merged;
        }
        const exists = new Set(prev.map((c: any) => c.id));
        return [...prev, ...fetched.filter((c: any) => !exists.has(c.id))];
      });

      setPage(pageNum);
      setHasMore(Boolean(result?.hasNextPage));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await folderService.list();
      const data = res.data?.data;
      const foldersArray = Array.isArray(data?.data) ? data.data : [];
      setFolders((prev: Folder[]) => {
        if (
          prev.length === foldersArray.length &&
          prev.every(
            (f: Folder, i: number) =>
              f.id === foldersArray[i]?.id && f.name === foldersArray[i]?.name,
          )
        ) {
          return prev;
        }
        return foldersArray;
      });
    } catch (err) {
      console.error("Failed to fetch folders:", err);
      setFolders([]);
    }
  }, []);

  const fetchAssistants = useCallback(async (pageNum = 1) => {
    try {
      const res = await assistantService.list({
        isActive: "true",
        page: pageNum.toString(),
        pageSize: "4",
      });
      const result = res.data.data;
      const fetched = result?.data || [];

      setAssistants((prev) => {
        if (pageNum === 1) {
          if (
            prev.length === fetched.length &&
            prev.every(
              (a: any, i: number) =>
                a.id === fetched[i]?.id &&
                a.name === fetched[i]?.name &&
                a.isActive === fetched[i]?.isActive,
            )
          ) {
            return prev;
          }
          return fetched;
        }
        return [...prev, ...fetched];
      });
      setAssistantsPage(pageNum);
      setAssistantsHasMore(Boolean(result?.hasNextPage));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user && !isProfileRoute) {
      fetchFolders();
      fetchAssistants(1);
    }
  }, [user, isProfileRoute, fetchFolders, fetchAssistants]);

  const prevPathnameRef = useRef(pathname);

  // When navigating back from settings/profile (or any non-chat route)
  // to a chat route, re-fetch sidebar data so changes made in settings
  // are reflected immediately.
  useEffect(() => {
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = pathname;

    if (!user) return;

    const isNonChatRoute = (p: string) =>
      p.startsWith("/profile") ||
      p.startsWith("/login") ||
      p.startsWith("/register") ||
      p.startsWith("/forgot-password");

    const wasNonChatRoute = isNonChatRoute(prevPathname);
    const isNowChatRoute = !isNonChatRoute(pathname);

    if (wasNonChatRoute && isNowChatRoute) {
      fetchFolders();
      fetchChats(1);
      fetchAssistants(1);

      // Clear models cache and trigger refresh so any settings changes take effect
      sessionStorage.removeItem("models_cache_v1");
      window.dispatchEvent(new CustomEvent("refresh-models"));
    }
  }, [user, pathname, fetchFolders, fetchChats, fetchAssistants]);

  useEffect(() => {
    if (user && !isProfileRoute) {
      fetchChats(1);
    }
  }, [user, isProfileRoute, fetchChats, chatSearch]);

  useEffect(() => {
    if (!user || isProfileRoute) return;
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/share/")
    ) {
      return;
    }

    const pendingSignup =
      localStorage.getItem("signup_free_plan_prompt_pending") === "1";
    const seenSignup =
      localStorage.getItem("signup_free_plan_prompt_seen") === "1";
    if (!pendingSignup || seenSignup) return;

    // Check if used already has a paid subscription — if so, silently clear the
    // flag without showing the free-plan modal (e.g. user paid during signup).
    subscriptionService
      .getCurrent()
      .then((res) => {
        const current = res?.data?.data?.subscription;
        const isPaid =
          current &&
          ["ACTIVE", "TRIAL"].includes(String(current.status)) &&
          Number(current.plan?.monthlyPrice ?? 0) > 0;

        if (isPaid) {
          // Already on a paid plan — dismiss silently.
          localStorage.removeItem("signup_free_plan_prompt_pending");
          localStorage.setItem("signup_free_plan_prompt_seen", "1");
          window.dispatchEvent(new Event("ai-colab:plan-popup-handled"));
        } else {
          setPlanPopupOpen(true);
        }
      })
      .catch(() => {
        setPlanPopupOpen(true);
      });
  }, [user, isProfileRoute, pathname]);

  const dismissPlanPopup = useCallback(() => {
    setPlanPopupOpen(false);
    localStorage.removeItem("signup_free_plan_prompt_pending");
    localStorage.setItem("signup_free_plan_prompt_seen", "1");
    window.dispatchEvent(new Event("ai-colab:plan-popup-handled"));
  }, []);

  const handleUpgradeFromPopup = useCallback(() => {
    dismissPlanPopup();
    router.push("/profile/subscription");
  }, [dismissPlanPopup, router]);

  const chatListRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const runChatListRefresh = useCallback(
    (immediate: boolean) => {
      const run = () => {
        startTransition(() => {
          fetchChats(1);
        });
      };
      if (immediate) {
        if (chatListRefreshTimerRef.current) {
          clearTimeout(chatListRefreshTimerRef.current);
          chatListRefreshTimerRef.current = null;
        }
        run();
        return;
      }
      if (chatListRefreshTimerRef.current) {
        clearTimeout(chatListRefreshTimerRef.current);
      }
      chatListRefreshTimerRef.current = setTimeout(() => {
        chatListRefreshTimerRef.current = null;
        run();
      }, 450);
    },
    [fetchChats],
  );

  useEffect(() => {
    const handleRefresh = (e: Event) => {
      const ce = e as CustomEvent<{ immediate?: boolean }>;
      const immediate = Boolean(ce.detail?.immediate);
      runChatListRefresh(immediate);
    };
    window.addEventListener("refresh-chats", handleRefresh as EventListener);
    return () => {
      window.removeEventListener(
        "refresh-chats",
        handleRefresh as EventListener,
      );
      if (chatListRefreshTimerRef.current) {
        clearTimeout(chatListRefreshTimerRef.current);
        chatListRefreshTimerRef.current = null;
      }
    };
  }, [runChatListRefresh]);

  useEffect(() => {
    const handleRefreshAssistants = () => fetchAssistants(1);
    window.addEventListener("refresh-assistants", handleRefreshAssistants);
    return () =>
      window.removeEventListener("refresh-assistants", handleRefreshAssistants);
  }, [fetchAssistants]);

  useEffect(() => {
    const handleAssistantSelected = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ assistant?: Assistant }>;
      const assistant = customEvt.detail?.assistant ?? null;
      const raw = localStorage.getItem("selectedAssistantId");
      const parsed = raw ? Number(raw) : NaN;
      const nextId = Number.isNaN(parsed) ? null : parsed;

      setActiveAssistantId((prev) => (prev === nextId ? prev : nextId));
      if (assistant) {
        setActiveAssistantTheme((prev) =>
          prev?.id === assistant.id ? prev : assistant,
        );
      } else {
        setActiveAssistantTheme((prev) => (prev === null ? prev : null));
      }
    };
    window.addEventListener("assistant-selected", handleAssistantSelected);
    return () =>
      window.removeEventListener("assistant-selected", handleAssistantSelected);
  }, []);

  const activeAssistantIdRef = useRef(activeAssistantId);
  activeAssistantIdRef.current = activeAssistantId;
  const assistantsRef = useRef(assistants);
  assistantsRef.current = assistants;

  useEffect(() => {
    let cancelled = false;

    const resolveAndApply = async () => {
      let newId: number | null = null;

      if (pathname === "/home" || pathname === "/new") {
        const raw = localStorage.getItem("selectedAssistantId");
        const parsed = raw ? Number(raw) : NaN;
        newId = Number.isNaN(parsed) ? null : parsed;
      } else if (pathname.startsWith("/c/")) {
        const match = pathname.match(/^\/c\/(\d+)/);
        const chatId = match ? Number(match[1]) : NaN;
        if (!Number.isNaN(chatId)) {
          const listChat = chatsRef.current.find((c) => c.id === chatId);
          if (listChat) {
            newId = listChat.assistantId ?? null;
            chatAssistantCacheRef.current.set(chatId, newId);
          } else {
            const cached = chatAssistantCacheRef.current.get(chatId);
            if (cached !== undefined) {
              newId = cached;
            } else {
              try {
                const inflight = chatAssistantInflightRef.current.get(chatId);
                const fetchPromise =
                  inflight ??
                  chatService
                    .getById(chatId)
                    .then((res) => res.data.data?.assistantId ?? null)
                    .catch(() => null)
                    .finally(() =>
                      chatAssistantInflightRef.current.delete(chatId),
                    );
                if (!inflight)
                  chatAssistantInflightRef.current.set(chatId, fetchPromise);
                newId = await fetchPromise;
                chatAssistantCacheRef.current.set(chatId, newId);
              } catch {
                newId = null;
              }
            }
          }
        }
      }

      if (cancelled) return;
      if (newId === activeAssistantIdRef.current) return;

      let newTheme: Assistant | null = null;
      if (newId) {
        const listMatch = assistantsRef.current.find((a) => a.id === newId);
        if (listMatch) {
          newTheme = listMatch;
        } else {
          try {
            const res = await assistantService.getById(newId);
            newTheme = res.data.data || null;
          } catch {
            newTheme = null;
          }
        }
      }

      if (cancelled) return;
      setActiveAssistantId(newId);
      setActiveAssistantTheme(newTheme);
    };

    resolveAndApply();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const id = activeAssistantIdRef.current;
    if (!id) return;
    const listMatch = assistants.find((a) => a.id === id);
    if (listMatch) {
      setActiveAssistantTheme((prev) =>
        prev?.id === listMatch.id ? prev : listMatch,
      );
    }
  }, [assistants]);

  const handleLogout = useCallback(() => {
    logout();
    router.replace("/");
  }, [logout, router]);

  /** Folders + chat list — assistants are refreshed only via dedicated events. */
  const handleSidebarRefresh = useCallback(() => {
    fetchFolders();
    window.dispatchEvent(
      new CustomEvent("refresh-chats", {
        detail: { immediate: true, refreshFolders: true },
      }),
    );
  }, [fetchFolders]);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
    window.dispatchEvent(new Event("ai-colab:mobile-sidebar-closed"));
  }, []);

  // Notify the startup guide when the mobile sidebar opens/closes
  useEffect(() => {
    if (mobileOpen) {
      window.dispatchEvent(new Event("ai-colab:mobile-sidebar-opened"));
    } else {
      window.dispatchEvent(new Event("ai-colab:mobile-sidebar-closed"));
    }
  }, [mobileOpen]);

  // Allow the startup guide to close the mobile sidebar (e.g. when user clicks Back)
  useEffect(() => {
    const onClose = () => setMobileOpen(false);
    const onOpen = () => setMobileOpen(true);
    window.addEventListener("ai-colab:close-mobile-sidebar", onClose);
    window.addEventListener("ai-colab:open-mobile-sidebar", onOpen);
    return () => {
      window.removeEventListener("ai-colab:close-mobile-sidebar", onClose);
      window.removeEventListener("ai-colab:open-mobile-sidebar", onOpen);
    };
  }, []);

  const handleLoadMoreChats = useCallback(() => {
    if (hasMoreRef.current) fetchChats(pageRef.current + 1);
  }, [fetchChats]);

  const handleLoadMoreAssistants = useCallback(() => {
    if (assistantsHasMoreRef.current)
      fetchAssistants(assistantsPageRef.current + 1);
  }, [fetchAssistants]);

  if (isLoading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (isProfileRoute) {
    return (
      <div className="h-dvh flex bg-background overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 relative z-1">
          {children}
        </main>
        <StartupGuide
          userId={typeof user?.id === "number" ? user.id : undefined}
          isGuideTaken={Boolean(user?.isGuideTaken)}
        />
      </div>
    );
  }

  const renderSidebar = (isMobile: boolean) => (
    <Sidebar
      chats={chats}
      folders={folders}
      assistants={assistants}
      onRefresh={handleSidebarRefresh}
      onMobileClose={handleMobileClose}
      hasMore={hasMore}
      onLoadMore={handleLoadMoreChats}
      searchQuery={chatSearch}
      onSearchChange={setChatSearch}
      assistantsHasMore={assistantsHasMore}
      onLoadMoreAssistants={handleLoadMoreAssistants}
      collapsed={isMobile ? false : sidebarCollapsed}
      onToggleCollapse={toggleSidebarCollapsed}
    />
  );

  const resolvedGradient = activeAssistantTheme
    ? theme === "dark" &&
      activeAssistantTheme.bgFromDark &&
      activeAssistantTheme.bgToDark
      ? {
          from: activeAssistantTheme.bgFromDark,
          via:
            activeAssistantTheme.bgViaDark || activeAssistantTheme.bgFromDark,
          to: activeAssistantTheme.bgToDark,
        }
      : activeAssistantTheme.bgFrom && activeAssistantTheme.bgTo
        ? {
            from: activeAssistantTheme.bgFrom,
            via: activeAssistantTheme.bgVia || activeAssistantTheme.bgFrom,
            to: activeAssistantTheme.bgTo,
          }
        : null
    : null;
  const hasAssistantGradient = !!resolvedGradient;
  const dynamicBackgroundStyle = resolvedGradient
    ? {
        background: `linear-gradient(135deg, ${resolvedGradient.from}, ${resolvedGradient.via}, ${resolvedGradient.to})`,
      }
    : undefined;

  return (
    <>
      <Dialog
        open={planPopupOpen}
        onOpenChange={(open) => {
          if (!open) dismissPlanPopup();
        }}
      >
        <DialogContent className="sm:max-w-md border-border/40 bg-background/95 backdrop-blur-xl">
          <DialogHeader className="space-y-3 text-left">
            <Badge
              variant="default"
              className="w-fit rounded-full px-3 py-1 text-xs"
            >
              Free plan activated 🎉
            </Badge>
            <div className="space-y-1">
              <DialogTitle className="text-xl sm:text-2xl text-balance">
                You’ve got 30 days of free access to get started.
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-muted-foreground">
                Need more power? Upgrade anytime for higher limits, priority
                speed, and full access.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={dismissPlanPopup}
              className="sm:flex-1"
            >
              Start chatting
            </Button>
            <Button
              onClick={handleUpgradeFromPopup}
              className="sm:flex-1 gap-2 bg-landing-primary hover:bg-landing-primary-hover text-white"
            >
              Upgrade plan
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className={`h-dvh flex overflow-hidden text-foreground ${
          hasAssistantGradient
            ? "bg-background"
            : "bg-linear-to-br from-white via-pink-50 to-rose-100/70 dark:from-purple-950/40 dark:via-background dark:to-pink-950/40"
        }`}
        style={dynamicBackgroundStyle}
      >
        <aside
          className={`hidden md:flex shrink-0 border-r border-border/50 transition-[width] duration-300 ease-in-out ${
            sidebarCollapsed ? "w-16" : "w-70"
          }`}
          style={{ contain: "layout style paint", willChange: "transform" }}
          data-guide="sidebar"
        >
          {renderSidebar(false)}
        </aside>

        <div className="md:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-3 bg-background/80 backdrop-blur-md border-b border-border/50 justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer -ml-2 text-foreground"
            onClick={() => {
              setMobileOpen(true);
            }}
            data-guide="mobile-menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <span className="font-semibold text-sm">
            {activeAssistantTheme?.name || "AI Colab"}
          </span>
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-full cursor-pointer hover:opacity-80 flex items-center justify-center p-0 overflow-hidden"
                  data-guide="profile-menu"
                >
                  <Avatar className="w-8 h-8 border border-border/50">
                    {user?.profileImage && (
                      <AvatarImage
                        src={user.profileImage}
                        alt={`${user?.firstName} ${user?.lastName}`}
                      />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {user?.firstName?.[0]?.toUpperCase()}
                      {user?.lastName?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-50 z-9500"
                style={{ zIndex: 9500 }}
              >
                <div className="px-2 py-1.5 border-b border-border/50 mb-1 flex flex-col items-start min-w-0">
                  <span className="truncate w-full text-left font-medium text-sm leading-tight">
                    {user?.firstName} {user?.lastName}
                  </span>
                  {user?.email && (
                    <span className="truncate w-full text-left text-xs text-muted-foreground leading-tight mt-0.5">
                      {user?.email}
                    </span>
                  )}
                </div>
                <DropdownMenuItem
                  onClick={toggleTheme}
                  className="gap-2 cursor-pointer"
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/profile")}
                  className="gap-2 cursor-pointer"
                >
                  <Settings className="w-4 h-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {mobileOpen && (
          <aside
            className={`
              md:hidden fixed z-50 h-full w-70 shrink-0 border-r border-border/40
              bg-background flex flex-col transition-all duration-300 ease-in-out translate-x-0
            `}
            style={{ contain: "layout style paint" }}
            data-guide="sidebar"
          >
            {renderSidebar(true)}
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0 md:pt-0 pt-14">
          {children}
        </main>

        <DocumentPanel />

        <StartupGuide
          userId={typeof user?.id === "number" ? user.id : undefined}
          isGuideTaken={Boolean(user?.isGuideTaken)}
        />
      </div>
    </>
  );
}
