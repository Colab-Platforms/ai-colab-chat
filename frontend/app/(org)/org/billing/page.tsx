"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { orgService } from "@/lib/services";
import { openPaymentCheckout } from "@/lib/cashfree";
import { toast } from "@/lib/toast";

interface Bill {
  id: number;
  number: string;
  kind: "INITIAL" | "RENEWAL" | "SEAT_ADD";
  status: "DUE" | "PAID" | "VOID";
  seats: number;
  periodStart: string;
  periodEnd: string;
  baseAmount: string;
  taxAmount: string;
  totalAmount: string;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  meta?: { extraSeats?: number } | null;
}
interface Overview {
  subscription: {
    status: "ACTIVE" | "PENDING" | "EXPIRED";
    billingMode: "CASHFREE" | "MANUAL_INVOICE";
    billingCycle: string;
    seatsPurchased: number;
    minSeats: number;
    pricePerSeat: string;
    currentPeriodEnd: string | null;
    pendingSeatChange: { seats: number; effectiveAt: string } | null;
    overdue: boolean;
    accessEndsAt: string | null;
  };
  seatsInUse: number;
  bills: Bill[];
}
interface Preview {
  direction: "INCREASE" | "DECREASE" | "NONE";
  extraSeats: number;
  remainingDays: number | null;
  amounts: { baseAmount: number; taxPercent: number; taxAmount: number; totalAmount: number } | null;
  effectiveAt: string | null;
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const KIND: Record<Bill["kind"], string> = { INITIAL: "Subscription", RENEWAL: "Renewal", SEAT_ADD: "Extra seats" };
const statusStyle: Record<string, string> = {
  ACTIVE: "bg-ok/15 text-ok",
  PAID: "bg-ok/15 text-ok",
  DUE: "bg-accent-soft text-accent-ink",
  PENDING: "bg-accent-soft text-accent-ink",
  EXPIRED: "bg-sunken text-faint",
};

function BillingContent() {
  const params = useSearchParams();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [seats, setSeats] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await orgService.billing();
      setData(res.data?.data);
      setSeats((cur) => cur || String(res.data?.data?.subscription?.seatsPurchased ?? ""));
    } catch (e) {
      toast.error(errMsg(e, "Failed to load billing"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Back from Cashfree: the webhook may take a moment, so refresh shortly.
  useEffect(() => {
    if (params.get("paid") !== "1") return;
    toast.success("Payment received updating your plan…");
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [params, load]);

  // Live price quote as the seat count changes.
  useEffect(() => {
    const n = Number(seats);
    if (!data || !Number.isInteger(n) || n < 1 || n === data.subscription.seatsPurchased) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      orgService
        .seatPreview(n)
        .then((r) => setPreview(r.data?.data))
        .catch((e) => {
          setPreview(null);
          toast.error(errMsg(e, "Could not price this change"));
        });
    }, 350);
    return () => clearTimeout(t);
  }, [seats, data]);

  const pay = async (bill: Bill) => {
    setPayingId(bill.id);
    try {
      const res = await orgService.payBill(bill.id);
      const sessionId = res.data?.data?.payment_session_id;
      if (!sessionId) throw new Error("No payment session");
      await openPaymentCheckout(sessionId);
    } catch (e) {
      toast.error(errMsg(e, "Could not start payment"));
    } finally {
      setPayingId(null);
    }
  };

  const applySeats = async () => {
    setApplying(true);
    try {
      const res = await orgService.changeSeats(Number(seats));
      const dir = res.data?.data?.direction;
      toast.success(dir === "INCREASE" ? "Invoice created for the extra seats" : dir === "DECREASE" ? "Reduction scheduled for the next renewal" : "Pending change cleared");
      setPreview(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Could not change seats"));
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const { subscription: sub, bills } = data;
  const online = sub.billingMode === "CASHFREE";
  const dueBills = bills.filter((b) => b.status === "DUE");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Per-seat plan, billed {sub.billingCycle.toLowerCase()} plus GST.</p>
      </div>

      {sub.status !== "ACTIVE" && (
        <div className="rounded-xl border border-border bg-accent-soft p-4 text-sm text-accent-ink">
          {sub.status === "EXPIRED"
            ? "Your plan has ended and your team is on the Free plan. Pay the open invoice to restore access immediately."
            : "Your plan starts once the first invoice is paid."}
        </div>
      )}
      {sub.overdue && sub.accessEndsAt && (
        <div className="rounded-xl border border-border bg-accent-soft p-4 text-sm text-accent-ink">
          Your renewal is overdue. Your team keeps access until <b>{day(sub.accessEndsAt)}</b>, then moves to the Free plan.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted-foreground">Plan status</div>
          <div className="mt-1">
            <Badge className={`${statusStyle[sub.status] ?? ""} border-0`}>{sub.status}</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted-foreground">Seats</div>
          <div className="mt-1 text-2xl font-semibold">
            {data.seatsInUse} <span className="text-base font-normal text-muted-foreground">/ {sub.seatsPurchased}</span>
          </div>
          {sub.pendingSeatChange && (
            <div className="text-xs text-muted-foreground">Reducing to {sub.pendingSeatChange.seats} on {day(sub.pendingSeatChange.effectiveAt)}</div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted-foreground">Price per seat / month</div>
          <div className="mt-1 text-2xl font-semibold">{inr(sub.pricePerSeat)}</div>
          <div className="text-xs text-muted-foreground">excl. GST</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted-foreground">Current period ends</div>
          <div className="mt-1 text-2xl font-semibold">{sub.currentPeriodEnd ? day(sub.currentPeriodEnd) : " "}</div>
        </div>
      </div>

      {dueBills.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 text-sm font-semibold">Payment due</div>
          <div className="divide-y divide-border text-sm">
            {dueBills.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <b>{b.number}</b> · {KIND[b.kind]} · {inr(b.totalAmount)} <span className="text-muted-foreground">(incl. GST) due {day(b.dueDate)}</span>
                </div>
                {online ? (
                  <Button size="sm" onClick={() => pay(b)} disabled={payingId === b.id}>
                    {payingId === b.id ? "Opening…" : "Pay now"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Pay by bank transfer quote {b.number}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sub.status === "ACTIVE" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold">Change seats</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adding seats is charged pro rata for the rest of this period. Reducing takes effect at your next renewal (minimum {sub.minSeats}).
          </p>
          <div className="mt-3 flex max-w-sm gap-2">
            <input
              type="number"
              min={sub.minSeats}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className="h-9 w-32 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50"
            />
            <Button onClick={applySeats} disabled={applying || !preview}>
              {applying ? "Working…" : preview?.direction === "INCREASE" ? "Add seats" : preview?.direction === "DECREASE" ? "Schedule reduction" : "Apply"}
            </Button>
          </div>
          {preview?.direction === "INCREASE" && preview.amounts && (
            <p className="mt-3 text-sm">
              +{preview.extraSeats} seat{preview.extraSeats === 1 ? "" : "s"} for the remaining {preview.remainingDays} days:{" "}
              <b>{inr(preview.amounts.totalAmount)}</b>{" "}
              <span className="text-muted-foreground">
                ({inr(preview.amounts.baseAmount)} + {preview.amounts.taxPercent}% GST)
              </span>
            </p>
          )}
          {preview?.direction === "DECREASE" && preview.effectiveAt && (
            <p className="mt-3 text-sm text-muted-foreground">Your seats drop to {seats} on {day(preview.effectiveAt)}. You keep all current seats until then.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Invoices</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">For</th>
                <th className="px-4 py-2.5 font-medium">Period</th>
                <th className="px-4 py-2.5 text-right font-medium">Total (incl. GST)</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-10 px-2" />
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{b.number}</td>
                  <td className="px-4 py-3">
                    {KIND[b.kind]}
                    {b.kind === "SEAT_ADD" && b.meta?.extraSeats ? ` (+${b.meta.extraSeats})` : ` · ${b.seats} seats`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {day(b.periodStart)} – {day(b.periodEnd)}
                  </td>
                  <td className="px-4 py-3 text-right">{inr(b.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${statusStyle[b.status] ?? ""} border-0`}>{b.status}</Badge>
                  </td>
                  <td className="px-2 py-3">
                    {b.invoiceUrl && (
                      <a href={b.invoiceUrl} target="_blank" rel="noreferrer" aria-label="Download invoice" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {bills.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function OrgBillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}
