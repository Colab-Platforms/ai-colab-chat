"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";

/**
 * Backup for the inline homepage script. If a session appears only after
 * the profile request (token stored, user object not yet cached), send the
 * same destinations as app/page.tsx did before: admins to /admin, everyone
 * else to /home, keeping the query string.
 */
export function HomeSessionRedirect() {
  const { user, isLoading, hasRole } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading || !user) return;
    if (hasRole("ADMIN") || hasRole("SUPERADMIN")) {
      router.replace("/admin");
      return;
    }
    const query = searchParams.toString();
    router.replace(query ? `/home?${query}` : "/home");
  }, [isLoading, user, hasRole, router, searchParams]);

  return null;
}
