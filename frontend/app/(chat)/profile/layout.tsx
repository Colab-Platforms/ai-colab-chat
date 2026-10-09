"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  LayoutDashboard, Wallet, BarChart3, BadgeCheck, SlidersHorizontal,
  UserCircle, ArrowLeft, Menu, X, Archive, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/sidebar/sidebar";

const navGroups = [
  { label: null, items: [{ label: "Overview", href: "/profile", icon: LayoutDashboard }] },
  {
    label: "Account",
    items: [
      { label: "Account", href: "/profile/account", icon: UserCircle },
      { label: "Preferences", href: "/profile/preferences", icon: SlidersHorizontal },
      { label: "Contexts", href: "/profile/contexts", icon: Brain },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Subscription", href: "/profile/subscription", icon: BadgeCheck },
      { label: "Wallet", href: "/profile/wallet", icon: Wallet },
      { label: "Usage", href: "/profile/my-usage", icon: BarChart3 },
    ],
  },
  { label: "Data", items: [{ label: "Archived chats", href: "/profile/archived", icon: Archive }] },
];
const userNav = navGroups.flatMap((g) => g.items);

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
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            const lastPath = localStorage.getItem("last_chat_path") || "/home";
            router.push(lastPath);
          }}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to chat
        </button>
        <h2 className="px-2 pt-4 pb-2 text-xl font-semibold tracking-tight text-foreground">Settings</h2>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi === 0 ? "" : "mt-4"}>
            {group.label && (
              <p className="px-2 pb-1.5 text-[11px] font-medium text-faint">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    data-guide={item.href === "/profile/my-usage" ? "profile-my-usage" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors cursor-pointer ${
                      isActive
                        ? "bg-surface text-foreground font-medium shadow-cl"
                        : "text-foreground/80 hover:bg-sidebar-accent"
                    }`}
                  >
                    <item.icon className={`w-4 h-4 ${isActive ? "text-accent-ink" : "text-muted-foreground"}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  const sidebarContent = (
    <AppSidebar
      variant="settings"
      hideHeader
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
      hideHeader
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
    <div className="flex h-full relative bg-background text-foreground">
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
        ${mobileOpen ? "translate-x-0 w-[240px]" : "-translate-x-full md:translate-x-0"}
        ${collapsed ? "md:w-[64px]" : "md:w-[240px]"}
      `}>
        {/* Desktop: show collapsed or expanded */}
        <div className="hidden md:flex h-full">
          {collapsed ? collapsedSidebarContent : (
            <div className="w-[240px] min-w-[240px] h-full flex flex-col">
              {sidebarContent}
            </div>
          )}
        </div>
        {/* Mobile: always show expanded */}
        <div className="md:hidden h-full flex flex-col w-[240px] min-w-[240px]">
          {sidebarContent}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="max-w-[880px] mx-auto px-4 pb-10 pt-6 md:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
