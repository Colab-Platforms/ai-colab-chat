"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";
import { creditWalletService } from "@/lib/services";
import { openPaymentCheckout } from "@/lib/cashfree";
import { toast } from "@/lib/toast";
import { SettingsCard } from "@/components/settings/settings-ui";

const PRESET_AMOUNTS = [500, 1000, 2000];

interface CreditTopUpCardProps {
  /** Called right before redirecting to checkout, so the caller can stash a
   * baseline balance for the success page to diff against. */
  onCheckoutStart?: () => void;
}

export function CreditTopUpCard({ onCheckoutStart }: CreditTopUpCardProps) {
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [pricing, setPricing] = useState<{
    costPerCreditInr: number;
    marginPercent: number;
    gstPercent: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    creditWalletService
      .getPricing()
      .then((res) => setPricing(res.data.data))
      .catch(() => {});
  }, []);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;

  // Mirrors calculateTopUpCredits in backend/src/utils/walletUtils.ts exactly
  // — strip GST, take the margin off the top, convert what's left at cost.
  const estimatedCredits = useMemo(() => {
    if (!pricing || !effectiveAmount || effectiveAmount <= 0) return null;
    const preTax = effectiveAmount / (1 + pricing.gstPercent / 100);
    const netOfMargin = preTax * (1 - pricing.marginPercent / 100);
    return Math.floor(netOfMargin / pricing.costPerCreditInr);
  }, [pricing, effectiveAmount]);

  const handleTopUp = async () => {
    if (!effectiveAmount || effectiveAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await creditWalletService.topup(effectiveAmount);
      const sessionId = res.data?.data?.payment_session_id;
      if (!sessionId) {
        toast.error("Failed to start payment");
        return;
      }
      onCheckoutStart?.();
      await openPaymentCheckout(sessionId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to start top-up");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SettingsCard className="grid gap-5 p-5 md:grid-cols-[1fr_minmax(0,22rem)]">
      <div>
        <h2 className="text-base font-semibold">Top up video credits</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Pay as you go. Top-up credits are separate from chat tokens and only used for video generation.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESET_AMOUNTS.map((preset) => {
            const active = !customAmount && amount === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setAmount(preset);
                  setCustomAmount("");
                }}
                className={`h-10 cursor-pointer rounded-xl border px-5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-accent-soft text-accent-ink"
                    : "border-border bg-surface hover:bg-sunken"
                }`}
              >
                ₹{preset.toLocaleString("en-IN")}
              </button>
            );
          })}
          <label className="flex h-10 w-44 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm text-muted-foreground focus-within:border-primary">
            ₹
            <input
              type="number"
              min={1}
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-faint">Top-up credits never expire.</p>
      </div>

      <div className="rounded-2xl bg-sunken p-4">
        <p className="text-xs text-muted-foreground">You&apos;ll get</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">
          {estimatedCredits !== null ? `≈ ${estimatedCredits.toLocaleString()} credits` : "—"}
        </p>
        <Button className="mt-3 h-10 w-full rounded-xl" onClick={handleTopUp} disabled={submitting || !effectiveAmount}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Pay ₹{(effectiveAmount || 0).toLocaleString("en-IN")}
        </Button>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Secure payment via Cashfree
        </p>
      </div>
    </SettingsCard>
  );
}
