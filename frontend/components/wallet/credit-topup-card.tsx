"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Zap } from "lucide-react";
import { creditWalletService } from "@/lib/services";
import { openPaymentCheckout } from "@/lib/cashfree";
import { toast } from "@/lib/toast";

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
    <Card className="border-border/30 bg-card/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" /> Top Up Video Credits
        </CardTitle>
        <CardDescription>Pay as you go — add credits any time, they never expire.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESET_AMOUNTS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={!customAmount && amount === preset ? "default" : "outline"}
              onClick={() => {
                setAmount(preset);
                setCustomAmount("");
              }}
            >
              ₹{preset}
            </Button>
          ))}
          <Input
            type="number"
            min={1}
            placeholder="Custom amount (₹)"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm">
          {estimatedCredits !== null ? (
            <span>
              ₹{effectiveAmount} ≈ <span className="font-semibold">{estimatedCredits} credits</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Enter an amount to see how many credits you'll get</span>
          )}
        </div>

        <Button className="w-full" onClick={handleTopUp} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Pay with Cashfree
        </Button>
      </CardContent>
    </Card>
  );
}
