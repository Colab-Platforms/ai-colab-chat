"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, hasRole } = useAuth();
  const router = useRouter();
  const isAdmin = hasRole("ADMIN") || hasRole("SUPERADMIN");

  useEffect(() => {
    if (!isLoading && isAdmin) {
      router.replace("/admin");
    }
  }, [isLoading, isAdmin, router]);

  if (isAdmin) {
    return null;
  }

  return children;
}
