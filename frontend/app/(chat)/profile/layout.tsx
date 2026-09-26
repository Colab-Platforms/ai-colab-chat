"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  LayoutDashboard, Wallet, CreditCard, BarChart3,
  UserCircle, ArrowLeft, Menu, X, Archive, Settings, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/sidebar/sidebar";

const userNav = [
  { label: "Dashboard", href: "/profile", icon: LayoutDashboard },
  { label: "Wallet", href: "/profile/wallet", icon: Wallet },
  { label: "Subscription", href: "/profile/subscription", icon: CreditCard },
  { label: "My Usage", href: "/profile/my-usage", icon: BarChart3 },
  { label: "My Account", href: "/profile/account", icon: UserCircle },
  { label: "Archived Chats", href: "/profile/archived", icon: Archive },
  { label: "Preferences", href: "/profile/preferences", icon: Settings },
  { label: "Contexts", href: "/profile/contexts", icon: Brain },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      // Check if this was an intentional logout — if so, go to the landing
      // page rather than /login with a redirect parameter.
      const isExplicitLogout = sessionStorage.getItem("explicit_logout") === "1";
      sessionStorage.removeItem("explicit_logout");

      if (isExplicitLogout) {
        router.replace("/");
        return;
      }

      const redirectTo = pathname || "/profile";
      router.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    }
  }, [user, isLoading, router, pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  // ─── Icons shown in the collapsed 64-px sidebar ───────────────────────────
  const collapsedIcons = (
    <>
      {/* Back to chat */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="#" onClick={(e) => {
            e.preventDefault();
            const lastPath = localStorage.getItem("last_chat_path") || "/home";
            router.push(lastPath);
          }}>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-lg cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Back to Chat</TooltipContent>
      </Tooltip>

      <div className="w-8 h-px bg-border/50 my-2" />

      {/* User nav icons */}
      {userNav.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>
              <Link href={item.href}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 rounded-lg cursor-pointer ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );

  // ─── Expanded inner content ───────────────────────────────────────────────
  const innerContent = (
    <>
      {/* Back to chat link — sits just below the logo/collapse row */}
      <div className="px-3 pb-2">
        <Link href="#" onClick={(e) => {
          e.preventDefault();
          setMobileOpen(false);
          const lastPath = localStorage.getItem("last_chat_path") || "/home";
          router.push(lastPath);
        }}>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground justify-start cursor-pointer w-full">
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
          </Button>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">General</p>
        {userNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              data-guide={item.href === "/profile/my-usage" ? "profile-my-usage" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer
                ${isActive
                  ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
            >
              <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  const sidebarContent = (
    <AppSidebar
      variant="settings"
      collapsed={false}
      onToggleCollapse={toggleCollapsed}
      onMobileClose={() => setMobileOpen(false)}
      collapsedIcons={collapsedIcons}
    >
      {innerContent}
    </AppSidebar>
  );

  const collapsedSidebarContent = (
    <AppSidebar
      variant="settings"
      collapsed={true}
      onToggleCollapse={toggleCollapsed}
      onMobileClose={() => setMobileOpen(false)}
      collapsedIcons={collapsedIcons}
    >
      {innerContent}
    </AppSidebar>
  );

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-full relative bg-gradient-to-br from-purple-100 via-[#EACFEF] to-pink-100 dark:from-purple-950/40 dark:via-background dark:to-pink-950/40 text-foreground">
      {/* Mobile top bar — same pattern as chat layout */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-3 bg-background/80 backdrop-blur-md border-b border-border/50 justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer -ml-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <span className="font-semibold text-sm">Settings</span>
        <div className="w-8" />{/* spacer to center the title */}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 h-full flex-shrink-0 border-r border-border/40
        bg-background md:bg-transparent flex flex-col
        transition-all duration-300 ease-in-out overflow-hidden
        ${mobileOpen ? "translate-x-0 w-[280px]" : "-translate-x-full md:translate-x-0"}
        ${collapsed ? "md:w-[64px]" : "md:w-[280px]"}
      `}>
        {/* Desktop: show collapsed or expanded */}
        <div className="hidden md:flex h-full">
          {collapsed ? collapsedSidebarContent : (
            <div className="w-[280px] min-w-[280px] h-full flex flex-col">
              {sidebarContent}
            </div>
          )}
        </div>
        {/* Mobile: always show expanded */}
        <div className="md:hidden h-full flex flex-col w-[280px] min-w-[280px]">
          {sidebarContent}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
