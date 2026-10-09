"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsCard, SettingsHeader } from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { subscriptionService, planService, paymentService, creditWalletService } from "@/lib/services";
import { openSubscriptionCheckout, openPaymentCheckout } from "@/lib/cashfree";
import { getPlanFeatureLines } from "@/lib/planFeatures";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SubscriptionPage() {
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<any>(null);
  const [pendingSubscription, setPendingSubscription] = useState<any>(null);
  const [freePlanTaken, setFreePlanTaken] = useState(false);
  const [pendingExpiresAt, setPendingExpiresAt] = useState<string | null>(null);
  const [pendingAuthLink, setPendingAuthLink] = useState<string | null>(null);
  const [pendingSubscriptionSessionId, setPendingSubscriptionSessionId] = useState<string | null>(null);
  const [pendingCountdownMs, setPendingCountdownMs] = useState<number | null>(null);
  const [autoCancellingPending, setAutoCancellingPending] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [cancellingPendingPayment, setCancellingPendingPayment] = useState(false);
  const [subscribingPlanId, setSubscribingPlanId] = useState<number | null>(null);
  const isSubscribingRef = useRef(false);
  const [planToConfirm, setPlanToConfirm] = useState<any | null>(null);
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [autoPayUpdating, setAutoPayUpdating] = useState(false);
  const autoStartedPlanIdsRef = useRef<Set<number>>(new Set());
  const isUsableAuthLink = (url: string | null | undefined) =>
    Boolean(url) && !String(url).includes("/subscriptions/checkout/timer");
  const markCheckoutFlowStart = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("subscription_checkout_in_progress", "1");
  };

  const fetchData = useCallback(async () => {
    try {
      const [subRes, planRes] = await Promise.all([
        subscriptionService.getCurrent().catch(() => null),
        planService.list({ isActive: "true" }),
      ]);
      console.debug("[SubscriptionPage] fetchData responses", {
        subRes: subRes?.data,
        planCount: planRes?.data?.data?.data?.length ?? 0,
      });
      const subData = subRes?.data?.data;
      if (subData && typeof subData === "object" && "subscription" in subData) {
        setSubscription((subData as any).subscription ?? null);
        setPendingSubscription((subData as any).pendingSubscription ?? null);
        setFreePlanTaken(Boolean((subData as any).freePlanTaken));
        setPendingExpiresAt((subData as any).pendingExpiresAt ?? null);
        setPendingSubscriptionSessionId((subData as any).pendingSubscriptionSessionId ?? null);
        if ((subData as any).pendingAuthLink && isUsableAuthLink((subData as any).pendingAuthLink)) {
          setPendingAuthLink((subData as any).pendingAuthLink);
          if (typeof window !== "undefined") {
            localStorage.setItem("pending_subscription_auth_link", (subData as any).pendingAuthLink);
          }
        } else if (typeof window !== "undefined") {
          localStorage.removeItem("pending_subscription_auth_link");
          setPendingAuthLink(null);
        }
      } else {
        setSubscription(subData ?? null);
        setPendingSubscription(null);
        setFreePlanTaken(false);
        setPendingExpiresAt(null);
        setPendingSubscriptionSessionId(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("pending_subscription_auth_link");
          setPendingAuthLink(null);
        }
      }
      const fetchedPlans = planRes.data.data?.data || [];
      setPlans(fetchedPlans.filter((plan: any) => plan?.isActive !== false));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    // Live rate, not hardcoded — same CreditPricingConfig.gstPercent the
    // backend actually charges with, so this popup never quietly drifts
    // from what Cashfree really bills.
    creditWalletService
      .getPricing()
      .then((res: any) => {
        const pct = res?.data?.data?.gstPercent;
        if (typeof pct === "number" && Number.isFinite(pct)) setGstPercent(pct);
      })
      .catch(() => { /* keep the 18% fallback */ });
  }, []);
  useEffect(() => {
    if (!pendingExpiresAt) {
      setPendingCountdownMs(null);
      return;
    }

    const updateCountdown = () => {
      const expiresMs = new Date(pendingExpiresAt).getTime();
      const remaining = Math.max(0, expiresMs - Date.now());
      setPendingCountdownMs(remaining);
    };

    updateCountdown();
    const id = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(id);
  }, [pendingExpiresAt]);

  useEffect(() => {
    if (!pendingSubscription || pendingCountdownMs === null || pendingCountdownMs > 0 || autoCancellingPending) return;

    const autoCancelExpiredPending = async () => {
      setAutoCancellingPending(true);
      try {
        // Cancel only PENDING so we don't accidentally cancel an ACTIVE subscription
        // after payment has completed.
        await subscriptionService.cancelPending();
        if (typeof window !== "undefined") {
          localStorage.removeItem("pending_subscription_auth_link");
        }
        setPendingAuthLink(null);
        toast.info("Pending payment expired and was auto-cancelled.");
        await fetchData();
      } catch {
        // Backend also expires old pending subscriptions on /current.
        await fetchData();
      } finally {
        setAutoCancellingPending(false);
      }
    };

    void autoCancelExpiredPending();
  }, [pendingSubscription, pendingCountdownMs, autoCancellingPending, fetchData]);

  // While a payment is pending, poll to pick up webhook updates quickly.
  // This prevents the 15-minute timer from cancelling after the subscription becomes ACTIVE.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pendingSubscription) return;

    const id = window.setInterval(() => {
      void fetchData();
    }, 10_000);

    return () => window.clearInterval(id);
  }, [pendingSubscription?.id, fetchData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("pending_subscription_auth_link");
    if (isUsableAuthLink(stored)) {
      setPendingAuthLink(stored);
    } else {
      localStorage.removeItem("pending_subscription_auth_link");
      setPendingAuthLink(null);
    }
  }, []);

  const handleCancel = async () => {
    if (cancellingSubscription) return;
    setCancellingSubscription(true);
    try {
      await subscriptionService.cancel();
      toast.success("Subscription cancelled");
      fetchData();
    } catch { toast.error("Failed to cancel"); } finally {
      setCancellingSubscription(false);
    }
  };

  const handleSubscribe = async (planId: number) => {
    if (isSubscribingRef.current) return;
    isSubscribingRef.current = true;
    setSubscribingPlanId(planId);
    try {
      console.debug("[SubscriptionPage] handleSubscribe request", { planId });
      const selectedPlan = plans.find((p: any) => p.id === planId);
      const isPaidPlan = Number(selectedPlan?.monthlyPrice ?? 0) > 0;

      const rawCycle = searchParams.get("billingCycle") || "MONTHLY";
      const cycle = rawCycle.toUpperCase() === "YEARLY" ? "YEARLY" : "MONTHLY";

      if (isPaidPlan) {
        const payRes = await paymentService.createSubscribeOneTime({
          planId,
          billingCycle: cycle,
        });
        const paymentSessionId = payRes?.data?.data?.payment_session_id;
        if (!paymentSessionId) {
          toast.error("Could not start payment. Try again.");
          return;
        }
        markCheckoutFlowStart();
        await openPaymentCheckout(paymentSessionId);
        await fetchData();
        return;
      }

      const res = await subscriptionService.create({
        planId,
        billingCycle: cycle,
      });
      console.debug("[SubscriptionPage] handleSubscribe response", res?.data);

      const auth_link = res?.data?.data?.auth_link;
      const subscriptionSessionId = res?.data?.data?.subscription_session_id;

      if (isUsableAuthLink(auth_link)) {
        console.debug("[SubscriptionPage] redirecting with auth_link", { auth_link });
        markCheckoutFlowStart();
        if (typeof window !== "undefined") {
          localStorage.setItem("pending_subscription_auth_link", auth_link);
          setPendingAuthLink(auth_link);
        }
        toast.success("Redirecting to Cashfree authorization...");
        window.location.href = auth_link;
        return;
      }

      if (isPaidPlan) {
        console.debug("[SubscriptionPage] paid plan but no auth_link", { planId, isPaidPlan });
        toast.info("Subscription initiated. Use Continue payment to complete authorization.");
        await fetchData();
        return;
      }

      // Free plan activates immediately (no Cashfree redirect).
      if (typeof window !== "undefined") {
        localStorage.removeItem("pending_subscription_auth_link");
        setPendingAuthLink(null);
      }
      toast.success("Subscribed successfully!");
      fetchData();
    } catch (err: any) {
      console.debug("[SubscriptionPage] handleSubscribe error", err?.response?.data || err);
      toast.error(err?.response?.data?.message || "Failed to subscribe");
    }
    finally {
      isSubscribingRef.current = false;
      setSubscribingPlanId(null);
    }
  };

  useEffect(() => {
    if (loading) return;
    const rawPlanId = searchParams.get("planId");
    if (!rawPlanId) return;
    const parsedPlanId = Number(rawPlanId);
    if (!Number.isFinite(parsedPlanId) || parsedPlanId <= 0) return;
    if (subscribingPlanId !== null) return;
    if (autoStartedPlanIdsRef.current.has(parsedPlanId)) return;

    const selectedPlan = plans.find((p: any) => p.id === parsedPlanId);
    if (!selectedPlan) return;

    const isCurrentPlan = !!subscription && subscription.planId === parsedPlanId;
    if (isCurrentPlan) return;

    const isFreePlan = Number(selectedPlan.monthlyPrice ?? 0) === 0;
    if (isFreePlan && freePlanTaken) return;

    // Open the price/feature confirmation popup rather than charging
    // immediately — a deep link from the marketing page shouldn't skip the
    // "here's what you're about to pay, including GST" step.
    autoStartedPlanIdsRef.current.add(parsedPlanId);
    setPlanToConfirm(selectedPlan);
  }, [
    loading,
    searchParams,
    subscribingPlanId,
    plans,
    subscription,
    freePlanTaken,
  ]);

  const handleContinuePending = () => {
    console.debug("[SubscriptionPage] handleContinuePending", {
      pendingAuthLink,
      hasLink: Boolean(pendingAuthLink),
    });
    if (pendingSubscriptionSessionId) {
      markCheckoutFlowStart();
      void openSubscriptionCheckout(pendingSubscriptionSessionId);
      return;
    }
    if (!isUsableAuthLink(pendingAuthLink)) {
      toast.error("No valid pending payment link found");
      return;
    }
    markCheckoutFlowStart();
    window.location.href = pendingAuthLink as string;
  };

  const handleCancelOlderPayment = async () => {
    if (cancellingPendingPayment || autoCancellingPending) return;
    setCancellingPendingPayment(true);
    try {
      await subscriptionService.cancelPending();
      if (typeof window !== "undefined") {
        localStorage.removeItem("pending_subscription_auth_link");
      }
      setPendingAuthLink(null);
      toast.success("Older pending payment cancelled");
      await fetchData();
    } catch (err: any) {
      console.debug("[SubscriptionPage] handleCancelOlderPayment error", err?.response?.data || err);
      toast.error(err?.response?.data?.message || "Failed to cancel pending payment");
    } finally {
      setCancellingPendingPayment(false);
    }
  };

  const handleEnableAutoPay = async () => {
    if (!subscription?.planId || isSubscribingRef.current) return;
    isSubscribingRef.current = true;
    setSubscribingPlanId(subscription.planId);
    try {
      const res = await subscriptionService.enableAutoPay({
        planId: subscription.planId,
        billingCycle: String(subscription.billingCycle || "MONTHLY"),
      });
      const subscriptionSessionId = res?.data?.data?.subscription_session_id;
      const authLink = res?.data?.data?.auth_link;
      markCheckoutFlowStart();
      if (typeof window !== "undefined") {
        sessionStorage.setItem("autopay_toggle_flow", "1");
      }
      if (subscriptionSessionId) {
        await openSubscriptionCheckout(subscriptionSessionId);
      } else if (isUsableAuthLink(authLink)) {
        window.location.href = authLink as string;
      } else {
        toast.info("AutoPay setup started. Continue from subscription page.");
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to enable AutoPay");
    } finally {
      isSubscribingRef.current = false;
      setSubscribingPlanId(null);
    }
  };

  const handleToggleAutoPay = async (checked: boolean) => {
    if (!subscription || autoPayUpdating) return;
    setAutoPayUpdating(true);
    try {
      if (checked) {
        await handleEnableAutoPay();
        return;
      }
      await subscriptionService.disableAutoPay();
      toast.success("AutoPay turned off");
      await fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update AutoPay");
    } finally {
      setAutoPayUpdating(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasAutoPayFlow = sessionStorage.getItem("autopay_toggle_flow") === "1";
    if (!wasAutoPayFlow || !subscription) return;
    if (subscription.autoRenew) {
      toast.success("AutoPay turned on");
      sessionStorage.removeItem("autopay_toggle_flow");
    }
  }, [subscription?.id, subscription?.autoRenew]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const pendingCountdownLabel = (() => {
    if (pendingCountdownMs === null) return null;
    const totalSeconds = Math.max(0, Math.floor(pendingCountdownMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  })();

  return (
    <div>
      <SettingsHeader title="Subscription" description="Manage your plan and billing." />

      {(() => {
        if (!planToConfirm) return null;
        const basePrice = Number(planToConfirm.monthlyPrice ?? 0);
        const isFree = basePrice === 0;
        const gstAmount = isFree ? 0 : Number(((basePrice * gstPercent) / 100).toFixed(2));
        const totalAmount = isFree ? 0 : Number((basePrice + gstAmount).toFixed(2));
        const currentMonthlyPrice = Number(subscription?.plan?.monthlyPrice ?? 0);
        const currentIsFree = currentMonthlyPrice === 0;
        const isUpgradeFromFree = Boolean(subscription) && currentIsFree && basePrice > currentMonthlyPrice;
        const { included, excluded } = getPlanFeatureLines(planToConfirm);

        return (
          <AlertDialog open onOpenChange={(open) => !open && setPlanToConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{planToConfirm.name} plan</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4 text-left">
                    <ul className="space-y-1.5">
                      {included.map((line: string) => (
                        <li key={line} className="flex items-center gap-2 text-sm text-foreground">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          {line}
                        </li>
                      ))}
                      {excluded.map((line: string) => (
                        <li key={line} className="flex items-center gap-2 text-sm text-muted-foreground/60">
                          <X className="w-3.5 h-3.5 shrink-0" />
                          {line}
                        </li>
                      ))}
                    </ul>

                    <div className="rounded-lg border border-border/50 p-3 space-y-1.5 text-sm">
                      {isFree ? (
                        <div className="flex items-center justify-between font-semibold text-foreground">
                          <span>Total</span>
                          <span>Free</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>Plan price</span>
                            <span>₹{basePrice.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>GST ({gstPercent}%)</span>
                            <span>₹{gstAmount.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between font-semibold text-foreground pt-1.5 border-t border-border/50">
                            <span>Total to pay</span>
                            <span>₹{totalAmount.toLocaleString("en-IN")}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {isUpgradeFromFree && (
                      <p className="text-xs text-muted-foreground">
                        You still have remaining tokens in your current plan. If you continue, those tokens will carry over and be added to your new plan&apos;s tokens.
                      </p>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={subscribingPlanId !== null}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const planId = planToConfirm.id;
                    setPlanToConfirm(null);
                    void handleSubscribe(planId);
                  }}
                  disabled={subscribingPlanId !== null}
                >
                  {isFree ? "Confirm" : "Proceed to Pay"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {subscription ? (
        <SettingsCard className="mb-6 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{subscription.plan?.name}</h2>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    subscription.status === "ACTIVE" ? "bg-ok/15 text-ok" : "bg-sunken text-muted-foreground"
                  }`}
                >
                  {String(subscription.status).charAt(0) + String(subscription.status).slice(1).toLowerCase()}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {Number(subscription.plan?.monthlyPrice ?? 0) > 0
                  ? `₹${Number(subscription.plan.monthlyPrice).toLocaleString("en-IN")}/month + GST · `
                  : ""}
                Billed {String(subscription.billingCycle || "monthly").toLowerCase()}
              </p>
            </div>
            {subscription.expiresAt && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Expires on</p>
                <p className="text-sm font-semibold">
                  {new Date(subscription.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            )}
          </div>

          {Number(subscription?.plan?.monthlyPrice ?? 0) > 0 && subscription.status === "ACTIVE" && (
            <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
              <div>
                <p className="text-sm font-medium">AutoPay for renewals</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Turn AutoPay on or off anytime. Your current cycle stays active either way.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="text-xs text-muted-foreground">{subscription.autoRenew ? "On" : "Off"}</span>
                <Switch
                  checked={Boolean(subscription.autoRenew)}
                  onCheckedChange={handleToggleAutoPay}
                  disabled={autoPayUpdating || subscribingPlanId !== null}
                />
              </div>
            </div>
          )}

          {subscription.status === "ACTIVE" && (
            <div className="border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancellingSubscription}
                className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-destructive hover:underline disabled:opacity-60"
              >
                {cancellingSubscription && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Cancel subscription
              </button>
            </div>
          )}
        </SettingsCard>
      ) : (
        <SettingsCard className="mb-6 px-5 py-4">
          <p className="text-sm text-muted-foreground">No active plan.</p>
        </SettingsCard>
      )}

      {pendingSubscription && (
        <SettingsCard className="mb-6 space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">{pendingSubscription.plan?.name} plan</h2>
              <p className="text-xs text-muted-foreground">{String(pendingSubscription.billingCycle).toLowerCase()} billing</p>
            </div>
            <span className="rounded-md bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">Pending</span>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Payment authorization pending
              </p>
              <p className="text-xs text-amber-700/90 dark:text-amber-300/90 mt-0.5">
                A small mandate authorization may happen and be refunded. Your plan amount is charged right after authorization is confirmed.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleContinuePending}
                disabled={subscribingPlanId !== null}
              >
                Continue payment
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancelOlderPayment}
                disabled={cancellingPendingPayment || autoCancellingPending}
              >
                {cancellingPendingPayment || autoCancellingPending ? "Cancelling..." : "Cancel payment"}
              </Button>
            </div>
            {pendingExpiresAt && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/25 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Expires around {new Date(pendingExpiresAt).toLocaleString()}
                </p>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {pendingCountdownLabel ?? "--:--"} left
                </p>
              </div>
            )}
          </div>
        </SettingsCard>
      )}

      <h2 className="text-base font-semibold">Plans</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Prices are per month, plus GST.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[...plans]
          .sort((x: any, y: any) => Number(x.monthlyPrice ?? 0) - Number(y.monthlyPrice ?? 0))
          .map((plan: any) => {
            const isCurrentPlan = !!subscription && subscription.planId === plan.id;
            const isFreePlan = Number(plan.monthlyPrice) === 0;
            const isAlreadyTakenFree = isFreePlan && freePlanTaken && !isCurrentPlan;
            const hasCurrentPlan = Boolean(subscription);
            const { included, excluded } = getPlanFeatureLines(plan);
            const price = Number(plan.monthlyPrice ?? 0);

            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl border bg-surface p-5 ${
                  isCurrentPlan ? "border-primary shadow-cl" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{plan.name}</h3>
                  {isCurrentPlan && (
                    <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">Current</span>
                  )}
                </div>
                <p className="mt-3">
                  <span className="text-[28px] font-semibold tracking-tight">₹{price.toLocaleString("en-IN")}</span>
                  <span className="ml-1 text-xs text-muted-foreground">/mo</span>
                </p>

                {isCurrentPlan ? (
                  <button disabled className="mt-4 h-10 w-full cursor-default rounded-xl bg-sunken text-sm font-medium text-muted-foreground">
                    Your current plan
                  </button>
                ) : isAlreadyTakenFree ? (
                  <button disabled className="mt-4 h-10 w-full cursor-default rounded-xl bg-sunken text-sm font-medium text-muted-foreground">
                    Already used
                  </button>
                ) : (
                  <Button
                    className="mt-4 h-10 w-full rounded-xl"
                    disabled={subscribingPlanId !== null}
                    onClick={() => setPlanToConfirm(plan)}
                  >
                    {subscribingPlanId === plan.id
                      ? "Starting..."
                      : isFreePlan
                        ? "Start free"
                        : hasCurrentPlan
                          ? `Switch to ${plan.name}`
                          : "Pay now"}
                  </Button>
                )}

                <div className="mt-4 space-y-2 border-t border-border pt-4 text-[13px]">
                  {included.map((line: string) => (
                    <p key={line} className="flex items-center gap-2.5">
                      <Check className="h-3.5 w-3.5 shrink-0 text-ok" />
                      {line}
                    </p>
                  ))}
                  {excluded.map((line: string) => (
                    <p key={line} className="flex items-center gap-2.5 text-faint">
                      <X className="h-3.5 w-3.5 shrink-0" />
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
