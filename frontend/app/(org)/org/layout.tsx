"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { orgService } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/sidebar/sidebar";

const nav = [
  { label: "Overview", href: "/org", icon: LayoutDashboard, exact: true },
  { label: "Members", href: "/org/members", icon: Users },
  { label: "Roles", href: "/org/roles", icon: ShieldCheck },
  { label: "Usage", href: "/org/usage", icon: BarChart3 },
  { label: "Audit", href: "/org/audit", icon: History },
  { label: "Billing", href: "/org/billing", icon: CreditCard, ownerOnly: true },
  { label: "Settings", href: "/org/settings", icon: Settings },
];

/**
 * Org admin console shell, built on the same sidebar as the platform admin
 * panel. Only active OWNER/ADMIN seats get in; the API enforces the same rule,
 * this just keeps everyone else off the page.
 */
export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [subActive, setSubActive] = useState(true);

  const m = user?.orgMembership;
  const allowed = m?.status === "ACTIVE" && (m.memberRole === "OWNER" || m.memberRole === "ADMIN");
  const isOwner = m?.memberRole === "OWNER";
  const items = nav.filter((i) => !i.ownerOnly || isOwner);

  useEffect(() => {
    if (localStorage.getItem("sidebarCollapsed") === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login?redirect=/org");
    else if (!allowed) router.replace("/home");
  }, [user, isLoading, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    orgService
      .me()
      .then((r) => setSubActive(Boolean(r.data?.data?.subscriptionActive)))
      .catch(() => {});
  }, [allowed, pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  const isActive = (item: (typeof nav)[number]) => (item.exact ? pathname === item.href : pathname?.startsWith(item.href));

  const collapsedIcons = (
    <>
      {items.map((item) => (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>
            <Link href={item.href}>
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 rounded-lg cursor-pointer ${
                  isActive(item) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="w-4 h-4" />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      ))}
    </>
  );

  const innerContent = (
    <>
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        <p className="px-3 py-1.5 truncate text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m?.orgName}</p>
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer
                ${active ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"}`}
            >
              <item.icon className={`w-4 h-4 ${active ? "text-primary" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  const sidebar = (isCollapsed: boolean) => (
    <AppSidebar
      variant="settings"
      collapsed={isCollapsed}
      onToggleCollapse={toggleCollapsed}
      onMobileClose={() => setMobileOpen(false)}
      collapsedIcons={collapsedIcons}
    >
      {innerContent}
    </AppSidebar>
  );

  if (!allowed) return null;

  return (
    <div className="flex h-screen relative bg-background text-foreground">
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-3 bg-background/80 backdrop-blur-md border-b border-border/50 justify-between">
        <Button variant="ghost" size="icon" className="cursor-pointer -ml-2 text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <span className="font-semibold text-sm truncate">{m?.orgName}</span>
        <div className="w-8" />
      </div>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        className={`
        fixed md:relative z-50 h-full flex-shrink-0 border-r border-border/40
        bg-background md:bg-transparent flex flex-col
        transition-all duration-300 ease-in-out overflow-hidden
        ${mobileOpen ? "translate-x-0 w-[280px]" : "-translate-x-full md:translate-x-0"}
        ${collapsed ? "md:w-[64px]" : "md:w-[280px]"}
      `}
      >
        <div className="hidden md:flex h-full">
          {collapsed ? sidebar(true) : <div className="w-[280px] min-w-[280px] h-full flex flex-col">{sidebar(false)}</div>}
        </div>
        <div className="md:hidden h-full flex flex-col w-[280px] min-w-[280px]">{sidebar(false)}</div>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {!subActive && (
          <div className="border-b border-border bg-accent-soft px-4 py-2.5 text-center text-sm text-accent-ink">
            Your organization&apos;s plan isn&apos;t active, so members are on the Free plan and new invitations are paused.{" "}
            {isOwner ? (
              <Link href="/org/billing" className="font-medium underline">
                Go to billing
              </Link>
            ) : (
              "Ask your organization owner to check billing."
            )}
          </div>
        )}
        <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
