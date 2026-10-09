"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/auth-context";

const getSafeRedirectPath = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }
  return value;
};

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeGoogleLogin } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const hasHandledCallback = useRef(false);

  const token = searchParams.get("token");
  const errorCode = searchParams.get("error");
  const errorMessage = searchParams.get("message");
  const isNewUser = searchParams.get("newUser") === "1";
  const redirectPath = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );

  useEffect(() => {
    const completeLogin = async () => {
      if (hasHandledCallback.current) {
        return;
      }

      const processedKey = token ? `google_oauth_processed:${token}` : null;
      if (processedKey && sessionStorage.getItem(processedKey) === "1") {
        hasHandledCallback.current = true;
        router.replace(redirectPath);
        return;
      }

      if (errorCode) {
        toast.error(errorMessage || "Google sign-in failed. Please try again.");
        router.replace("/login");
        return;
      }

      if (!token) {
        toast.error("Google sign-in did not return a token.");
        router.replace("/login");
        return;
      }

      try {
        hasHandledCallback.current = true;
        if (processedKey) {
          sessionStorage.setItem(processedKey, "1");
        }

        if (isNewUser) {
          localStorage.setItem("signup_free_plan_prompt_pending", "1");
          localStorage.removeItem("signup_free_plan_prompt_seen");
        }

        const { isAdmin } = await completeGoogleLogin(token);
        toast.success("Signed in with Google successfully");
        router.replace(isAdmin ? "/admin" : redirectPath);
      } catch {
        toast.error("Unable to complete Google sign-in");
        router.replace("/login");
      } finally {
        setIsProcessing(false);
      }
    };

    void completeLogin();
  }, [completeGoogleLogin, errorCode, errorMessage, isNewUser, redirectPath, router, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-background/90 backdrop-blur-sm p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-landing-primary/10 text-landing-primary">
          <Loader2 className={`h-7 w-7 ${isProcessing ? "animate-spin" : ""}`} />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Completing sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We are securely finishing your Google authentication.
        </p>
      </div>
    </div>
  );
}
