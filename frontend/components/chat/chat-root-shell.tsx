"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ChatLayoutView } from "@/components/chat/ChatLayoutView";
import { DocumentPanelProvider } from "@/context/document-panel-context";

/**
 * Keeps a single ChatLayoutView instance for all authenticated chat routes.
 * Without this, `/` (app/page.tsx) and `/c/*` (app/(chat)/layout.tsx) each
 * mounted their own ChatLayoutView, so navigating between them remounted the
 * whole sidebar and reset client state.
 */
export function ChatRootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <>{children}</>;
  }

  if (!user) {
    return <>{children}</>;
  }

  const bareShell =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/share/") ||
    // Public marketing page — never inside the chat layout, signed in or not.
    pathname.startsWith("/business") ||
    pathname.startsWith("/code-preview/") ||
    pathname.startsWith("/admin");

  if (bareShell) {
    return <>{children}</>;
  }

  return (
    <DocumentPanelProvider>
      <ChatLayoutView>{children}</ChatLayoutView>
    </DocumentPanelProvider>
  );
}
