"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { creditWalletService } from "@/lib/services";

const CREDIT_TOPUP_BASELINE_KEY = "credit_topup_baseline";

export default function CreditTopUpSuccessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isCredited, setIsCredited] = useState(false);
  const [creditsAdded, setCreditsAdded] = useState<number | null>(null);
  const [isFlowAllowed, setIsFlowAllowed] = useState(false);

  useEffect(() => {
    const baseline =
      typeof window !== "undefined" ? sessionStorage.getItem(CREDIT_TOPUP_BASELINE_KEY) : null;
    const hasCashfreeParams =
      typeof window !== "undefined" &&
      (() => {
        const params = new URLSearchParams(window.location.search);
        return ["order_id", "cf_payment_id", "payment_id"].some((key) => params.has(key));
      })();
    const fromCashfreeReferrer =
      typeof document !== "undefined" && /cashfree/i.test(document.referrer || "");
    const canOpenSuccessPage = baseline !== null || hasCashfreeParams || fromCashfreeReferrer;

    if (!canOpenSuccessPage) {
      router.replace("/profile/wallet");
      return;
    }
    setIsFlowAllowed(true);

    const baselineCredits = baseline !== null ? Number(baseline) : 0;

    let mounted = true;
    let intervalId: number | null = null;
    const startedAt = Date.now();
    const POLL_TIMEOUT_MS = 10 * 60_000;
    const POLL_INTERVAL_MS = 2_500;

    const checkBalance = async () => {
      try {
        const res = await creditWalletService.get();
        if (!mounted) return;
        const current = Number(res?.data?.data?.creditsRemaining ?? 0);
        if (current > baselineCredits) {
          setCreditsAdded(current - baselineCredits);
          setIsCredited(true);
          sessionStorage.removeItem(CREDIT_TOPUP_BASELINE_KEY);
          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch {
        // keep polling — a transient failure shouldn't end the flow early
      } finally {
        if (mounted) setLoading(false);
        if (Date.now() - startedAt > POLL_TIMEOUT_MS && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    void checkBalance();
    intervalId = window.setInterval(() => {
      void checkBalance();
    }, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [router]);

  if (!isFlowAllowed) {
    return null;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isCredited) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <Card className="w-full max-w-xl border-border/40 bg-card/90 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Payment is being verified</CardTitle>
            <CardDescription>
              We are still waiting for confirmation from the payment gateway. Please don't refresh or close this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-xl border-border/40 bg-card/90 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <CardTitle className="text-2xl">Credits added</CardTitle>
          <CardDescription>
            {creditsAdded !== null ? `${creditsAdded} video credits` : "Your credits"} were added to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="sm:min-w-40">
            <Link href="/profile/wallet">Back to Wallet</Link>
          </Button>
          <Button asChild variant="outline" className="sm:min-w-40">
            <Link href="/home">Start chat</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
