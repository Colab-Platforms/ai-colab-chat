import { toast } from "@/lib/toast";

/** Lazily injects the Cashfree JS SDK script tag once and resolves window.Cashfree. */
export async function loadCashfreeSdk(): Promise<any> {
  if (typeof window === "undefined") return null;
  if ((window as any).Cashfree) return (window as any).Cashfree;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-cashfree-sdk="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Cashfree SDK failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.setAttribute("data-cashfree-sdk", "true");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Cashfree SDK failed to load"));
    document.head.appendChild(script);
  });

  return (window as any).Cashfree ?? null;
}

function getCashfreeMode(): "sandbox" | "production" {
  return String(process.env.NEXT_PUBLIC_CASHFREE_MODE || "production").toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

/** Opens Cashfree's recurring-subscription checkout (mandate authorization). */
export async function openSubscriptionCheckout(sessionId: string): Promise<void> {
  const Cashfree = await loadCashfreeSdk();
  if (!Cashfree) {
    toast.error("Failed to load Cashfree checkout");
    return;
  }

  const cashfree = Cashfree({ mode: getCashfreeMode() });
  const result = await cashfree.subscriptionsCheckout({
    subsSessionId: sessionId,
    // Keep checkout in same tab so browser back returns here.
    redirectTarget: "_self",
  });

  if (result?.error) {
    toast.error(result.error?.message || "Failed to open payment checkout");
  }
}

/** Opens Cashfree's one-time-order checkout — used for plan purchases and credit top-ups alike. */
export async function openPaymentCheckout(paymentSessionId: string): Promise<void> {
  const Cashfree = await loadCashfreeSdk();
  if (!Cashfree) {
    toast.error("Failed to load Cashfree checkout");
    return;
  }

  const cashfree = Cashfree({ mode: getCashfreeMode() });
  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_self",
  });

  if (result?.error) {
    toast.error(result.error?.message || "Failed to open payment checkout");
  }
}
