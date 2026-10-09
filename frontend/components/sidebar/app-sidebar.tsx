"use client";

import { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  MessageSquare,
  Sun,
  Moon,
  LogOut,
  Settings,
  LifeBuoy,
  ShieldCheck,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { usePlanCapabilities } from "@/context/plan-capabilities-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface AppSidebarProps {
  /** "chat"     → footer shows Settings link
   *  "settings" → footer shows Go to Chat link */
  variant: "chat" | "settings";
  /** Scrollable inner content rendered between header and footer */
  children: ReactNode;
  /** Optional icon buttons shown inside the 64-px collapsed sidebar */
  collapsedIcons?: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Called when a mobile-overlay action should close the sheet */
  onMobileClose?: () => void;
  /** Called on logout; if omitted the component calls logout() directly */
  onLogout?: () => void;
  /** Hide the logo/collapse row (settings pages open with their own header) */
  hideHeader?: boolean;
}

export function AppSidebar({
  variant,
  children,
  collapsedIcons,
  collapsed,
  onToggleCollapse,
  onMobileClose,
  onLogout,
  hideHeader,
}: AppSidebarProps) {
  const { user, logout, hasRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { planName } = usePlanCapabilities();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = hasRole("ADMIN") || hasRole("SUPERADMIN");
  // Admin panel's own sidebar already has "Back to Chat" and Admin/Support nav,
  // so those dropdown items would just duplicate what's on screen.
  const isAdminArea = pathname?.startsWith("/admin");

  const handleClose = () => onMobileClose?.();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      logout();
      router.replace("/");
    }
  };

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="h-full flex flex-col items-center bg-sidebar text-sidebar-foreground w-[64px] min-w-[64px] py-3 gap-1">
          <div className="mb-1">
            <Image src="/black.webp" alt="AI Colab" width={30} height={30} className="dark:hidden opacity-90 h-auto" priority />
            <Image src="/white.webp" alt="AI Colab" width={30} height={30} className="hidden dark:block opacity-90 h-auto" priority />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-lg cursor-pointer"
                onClick={onToggleCollapse}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>

          {collapsedIcons}

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full cursor-pointer p-0" data-guide="profile-menu">
                <Avatar className="w-8 h-8 border border-border/50">
                  {user?.profileImage && <AvatarImage src={user.profileImage} alt="Profile" className="object-cover" />}
                  <AvatarFallback className="bg-accent-soft text-accent-ink text-xs font-semibold">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-[200px] z-[9500]" style={{ zIndex: 9500 }}>
              <div className="px-2 py-1.5 border-b border-border/50 mb-1">
                <span className="font-medium text-sm">{user?.firstName} {user?.lastName}</span>
                {user?.email && <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>}
              </div>
              <DropdownMenuItem onClick={toggleTheme} className="gap-2 cursor-pointer">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </DropdownMenuItem>
              {variant === "chat" ? (
                <DropdownMenuItem onClick={() => {
                  handleClose();
                  if (typeof window !== "undefined") {
                    localStorage.setItem("last_chat_path", window.location.pathname);
                  }
                  router.push("/profile");
                }} className="gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" /> Settings
                </DropdownMenuItem>
              ) : !isAdminArea ? (
                <DropdownMenuItem
                  onClick={() => {
                    handleClose();
                    try {
                      localStorage.removeItem("pending_new_chat_context_ids");
                      localStorage.removeItem("pending_new_chat_folder_id");
                    } catch {
                      // ignore localStorage issues
                    }
                    if (typeof window !== "undefined") {
                      const lastPath = localStorage.getItem("last_chat_path") || "/home";
                      router.push(lastPath);
                    } else {
                      router.push("/home");
                    }
                  }}
                  className="gap-2 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" /> Go to Chat
                </DropdownMenuItem>
              ) : null}
              {isAdmin && !isAdminArea && (
                <DropdownMenuItem onClick={() => { handleClose(); router.push("/admin"); }} className="gap-2 cursor-pointer">
                  <ShieldCheck className="w-4 h-4" /> Admin Panel
                </DropdownMenuItem>
              )}
              {!isAdminArea && (
                <DropdownMenuItem onClick={() => { handleClose(); router.push("/support"); }} className="gap-2 cursor-pointer">
                  <LifeBuoy className="w-4 h-4" /> Help & Support
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="w-4 h-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground w-full">
      {!hideHeader && <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <Image src="/black.webp" alt="AI Colab" width={70} height={28} className="dark:hidden opacity-90 h-auto" priority />
          <Image src="/white.webp" alt="AI Colab" width={70} height={28} className="hidden dark:block opacity-90 h-auto" priority />
        </div>
        <div className="flex items-center gap-1">
          {onMobileClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-md cursor-pointer md:hidden"
              onClick={onMobileClose}
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-md cursor-pointer hidden md:flex"
              onClick={onToggleCollapse}
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>}

      {children}

      <div className="p-3 border-t border-border" data-guide="sidebar-user-menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2.5 h-auto py-2 px-2 text-sm cursor-pointer hover:bg-sidebar-accent rounded-lg overflow-hidden" data-guide="profile-menu">
              <Avatar className="w-8 h-8">
                {user?.profileImage && <AvatarImage src={user.profileImage} alt="Profile" className="object-cover" />}
                <AvatarFallback className="bg-accent-soft text-accent-ink text-xs font-semibold">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="truncate w-full text-left font-medium text-sm leading-tight">{user?.firstName} {user?.lastName}</span>
                <span className="truncate w-full text-left text-xs font-normal text-faint leading-tight mt-0.5">
                  {planName ? `${planName} plan` : user?.email}
                </span>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 ml-auto text-faint flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[240px] z-[9500]" style={{ zIndex: 9500 }}>
            <DropdownMenuItem onClick={toggleTheme} className="gap-2 cursor-pointer">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </DropdownMenuItem>
            {variant === "chat" ? (
              <DropdownMenuItem onClick={() => { 
                handleClose(); 
                if (typeof window !== "undefined") {
                  localStorage.setItem("last_chat_path", window.location.pathname);
                }
                router.push("/profile"); 
              }} className="gap-2 cursor-pointer">
                <Settings className="w-4 h-4" /> Settings
              </DropdownMenuItem>
            ) : !isAdminArea ? (
              <DropdownMenuItem
                onClick={() => {
                  handleClose();
                  try {
                    localStorage.removeItem("pending_new_chat_context_ids");
                    localStorage.removeItem("pending_new_chat_folder_id");
                  } catch {
                    // ignore localStorage issues
                  }
                  if (typeof window !== "undefined") {
                    const lastPath = localStorage.getItem("last_chat_path") || "/home";
                    router.push(lastPath);
                  } else {
                    router.push("/home");
                  }
                }}
                className="gap-2 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" /> Go to Chat
              </DropdownMenuItem>
            ) : null}
            {isAdmin && !isAdminArea && (
              <DropdownMenuItem onClick={() => { handleClose(); router.push("/admin"); }} className="gap-2 cursor-pointer">
                <ShieldCheck className="w-4 h-4" /> Admin Panel
              </DropdownMenuItem>
            )}
            {!isAdminArea && (
              <DropdownMenuItem onClick={() => { handleClose(); router.push("/support"); }} className="gap-2 cursor-pointer">
                <LifeBuoy className="w-4 h-4" /> Help & Support
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="w-4 h-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
