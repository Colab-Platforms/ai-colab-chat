"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { NewLandingPage } from "@/components/NewLanding/NewLandingPage";

/**
 * Signed-in users no longer see the chat home at "/" — it lives at "/home".
 * Any query string (e.g. ?folderId=) is carried across so old links keep
 * their folder scope.
 */
function AuthedHomeRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/home?${query}` : "/home");
  }, [searchParams, router]);

  return null;
}

export default function Home() {
  const { user, isLoading, hasRole } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const isAdmin = hasRole("ADMIN") || hasRole("SUPERADMIN");

  useEffect(() => {
    if (!isLoading && isAdmin) {
      router.replace("/admin");
    }
  }, [isLoading, isAdmin, router]);

  if (isLoading || isAdmin) {
    const ringBase =
      theme === "dark" ? "border-[#f2bfdc]/25" : "border-landing-primary/20";

    const ringTop =
      theme === "dark" ? "border-t-[#f2bfdc]" : "border-t-landing-primary";

    return (
      <>
        {user && (
          <Suspense fallback={null}>
            <AuthedHomeRedirect />
          </Suspense>
        )}
        <div className="flex min-h-screen items-center justify-center">
          <div className="relative h-9 w-9">
            <div
              className={`absolute inset-0 rounded-full border-2 ${ringBase}`}
            />
            <div
              className={`absolute inset-0 rounded-full border-2 border-transparent ${ringTop} animate-spin`}
            />
          </div>
        </div>
      </>
    );
  }

  return <NewLandingPage />;
}
