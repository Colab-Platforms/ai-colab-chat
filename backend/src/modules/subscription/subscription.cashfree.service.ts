import crypto from "crypto";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { BillingCycle } from "./subscription.types.js";
import {
  CashfreePlanSource,
  applyGst,
  getCashfreePlanId,
  getCashfreePlanIntervalType,
  getCashfreePlanIntervals,
  getCashfreePlanRecurringAmountPaise,
} from "@/utils/cashfreePlan.js";

class SubscriptionCashfreeService {
  private readonly subscriptionsBaseUrl: string;
  private readonly pgBaseUrl: string;
  private static readonly AUTHORIZATION_AMOUNT_INR = Number(
    process.env.CASHFREE_AUTHORIZATION_AMOUNT_INR ?? 1,
  );

  constructor() {
    this.subscriptionsBaseUrl =
      process.env.CASHFREE_BASE_URL ??
      "https://api.cashfree.com/pg/subscriptions";

    this.pgBaseUrl = this.subscriptionsBaseUrl.endsWith("/subscriptions")
      ? this.subscriptionsBaseUrl.slice(0, -"/subscriptions".length)
      : this.subscriptionsBaseUrl;
  }

  private getHeaders() {
    const clientId = process.env.CASHFREE_APP_ID;
    const clientSecret = process.env.CASHFREE_APP_SECRET;
    const apiVersion = process.env.CASHFREE_API_VERSION || "2023-08-01";

    if (!clientId || !clientSecret) {
      throw new ApiError(
        "Cashfree credentials are not configured",
        STATUS_CODES.SERVER_ERROR,
      );
    }

    return {
      "x-api-version": apiVersion,
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "Content-Type": "application/json",
    };
  }

  private debugLog(_label: string, _data?: unknown) {
    // console.log(`[Cashfree][Subscription] ${label}`, data ?? "");
  }

  private toIntervalType(billingCycle: BillingCycle): "MONTH" | "QUARTER" | "YEAR" {
    switch (billingCycle) {
      case "MONTHLY":
        return "MONTH";
      case "QUARTERLY":
        return "QUARTER";
      case "YEARLY":
        return "YEAR";
    }
  }

  private extractAuthLink(data: any): string | null {
    const direct =
      data?.auth_link ??
      data?.authLink ??
      data?.authorization_link ??
      data?.authorizationLink ??
      data?.subscription_data?.auth_link ??
      data?.subscription_data?.authorization_link ??
      data?.subscription_details?.authorization_link ??
      data?.subscription_details?.auth_link ??
      data?.data?.auth_link ??
      data?.data?.authLink ??
      data?.data?.authorization_link ??
      data?.data?.url ??
      null;

    if (direct && this.looksLikeAuthUrl(String(direct))) {
      return String(direct);
    }

    return this.findAuthUrlDeep(data);
  }

  private looksLikeAuthUrl(value: string): boolean {
    const lower = value.toLowerCase();
    const isLocalhost =
      lower.includes("://localhost") ||
      lower.includes("://127.0.0.1") ||
      lower.includes("://0.0.0.0");
    if (isLocalhost) return false;

    const looksLikeCashfreeAuth =
      (lower.startsWith("http://") || lower.startsWith("https://")) &&
      (lower.includes("cfre.in") ||
        lower.includes("cashfree.com/pg/view/") ||
        lower.includes("cashfree.com/subscriptions"));
    if (!looksLikeCashfreeAuth) return false;

    // This URL is returned in pay-auth payload for POST flows and fails when opened directly via GET.
    if (lower.includes("cashfree.com/subscriptions/checkout/timer")) return false;

    return true;
  }

  private extractAuthLinkFromRawText(rawText: string): string | null {
    if (!rawText) return null;
    const decoded = rawText
      .replace(/\\\//g, "/")
      .replace(/\\u0026/g, "&");

    const patterns = [
      /https?:\/\/cfre\.in\/[A-Za-z0-9/_-]+/i,
      /https?:\/\/[^"'\s]*cashfree\.com\/pg\/view\/[^"'\s]+/i,
    ];
    for (const pattern of patterns) {
      const match = decoded.match(pattern);
      if (match && this.looksLikeAuthUrl(match[0])) {
        return match[0];
      }
    }
    return null;
  }

  private extractCheckoutPostAction(data: any): {
    url: string;
    method: string;
    contentType: string;
    payload: unknown;
  } | null {
    const url = data?.data?.url;
    const method = String(data?.data?.method ?? "").toLowerCase();
    const contentType = String(data?.data?.content_type ?? "application/json");
    const payload = data?.data?.payload;

    if (!url || method !== "post" || !payload) return null;
    return {
      url: String(url),
      method,
      contentType,
      payload,
    };
  }

  private async resolveCheckoutRedirectUrl(action: {
    url: string;
    contentType: string;
    payload: unknown;
  }): Promise<string | null> {
    try {
      const response = await fetch(action.url, {
        method: "POST",
        headers: {
          "Content-Type": action.contentType || "application/json",
        },
        body:
          typeof action.payload === "string"
            ? action.payload
            : JSON.stringify(action.payload),
        redirect: "manual",
      });

      const location = response.headers.get("location");
      if (location && this.looksLikeAuthUrl(location)) {
        this.debugLog("resolved checkout redirect location", { location });
        return location;
      }

      const bodyText = await response.text().catch(() => "");
      const fromBody = this.extractAuthLinkFromRawText(bodyText);
      if (fromBody) {
        this.debugLog("resolved checkout redirect from body", { fromBody });
        return fromBody;
      }

      // Some endpoints complete with redirect follow and expose final URL in response.url.
      const followed = await fetch(action.url, {
        method: "POST",
        headers: {
          "Content-Type": action.contentType || "application/json",
        },
        body:
          typeof action.payload === "string"
            ? action.payload
            : JSON.stringify(action.payload),
        redirect: "follow",
      });
      const finalUrl = followed.url;
      if (finalUrl && this.looksLikeAuthUrl(finalUrl)) {
        this.debugLog("resolved checkout redirect from final response.url", { finalUrl });
        return finalUrl;
      }

      const followedBody = await followed.text().catch(() => "");
      const followedFromBody = this.extractAuthLinkFromRawText(followedBody);
      if (followedFromBody) {
        this.debugLog("resolved checkout redirect from followed body", { followedFromBody });
        return followedFromBody;
      }
    } catch (error: any) {
      this.debugLog("resolveCheckoutRedirectUrl error", {
        message: error?.message ?? String(error),
      });
    }

    return null;
  }

  private findAuthUrlDeep(input: any): string | null {
    const seen = new Set<any>();
    const queue: any[] = [input];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || seen.has(node)) continue;
      if (typeof node === "string" && this.looksLikeAuthUrl(node)) {
        return node;
      }
      if (typeof node !== "object") continue;
      seen.add(node);
      for (const value of Object.values(node)) {
        queue.push(value);
      }
    }

    return null;
  }

  private getHttpsReturnUrl(): string | null {
    const candidate =
      process.env.CASHFREE_SUBSCRIPTION_RETURN_URL ||
      process.env.FRONTEND_URL ||
      "";
    const trimmed = String(candidate).trim();
    if (!trimmed.startsWith("https://")) return null;
    if (process.env.CASHFREE_SUBSCRIPTION_RETURN_URL) return trimmed;
    return `${trimmed.replace(/\/+$/, "")}/profile/subscription/success`;
  }

  private getSubscriptionDetailUrls(subscriptionId: string): string[] {
    const urls = new Set<string>();
    urls.add(`${this.subscriptionsBaseUrl}/${subscriptionId}`);
    urls.add(`${this.pgBaseUrl}/subscriptions/${subscriptionId}`);

    if (this.subscriptionsBaseUrl.includes("/api/v2/subscriptions/nonSeamless/subscription")) {
      const legacyBase = this.subscriptionsBaseUrl.replace(
        "/api/v2/subscriptions/nonSeamless/subscription",
        "",
      );
      urls.add(`${legacyBase}/api/v2/subscriptions/${subscriptionId}`);
    }

    return Array.from(urls);
  }

  private extractSubscriptionSessionId(data: any): string | null {
    return (
      data?.subscription_session_id ??
      data?.subscriptionSessionId ??
      data?.data?.subscription_session_id ??
      data?.data?.subscriptionSessionId ??
      null
    );
  }

  async createSubscription(
    user: {
      id: number;
      email: string;
      phoneNumber: string | null;
      firstName?: string | null;
      lastName?: string | null;
    },
    plan: CashfreePlanSource,
    billingCycle: BillingCycle,
    subscriptionIdOverride?: string,
    returnUrlOverride?: string,
    gstPercent: number = 0,
  ) {
    const baseAmount = Number(
      billingCycle === "MONTHLY"
        ? plan.monthlyPrice
        : billingCycle === "QUARTERLY"
          ? plan.quarterlyPrice
          : plan.yearlyPrice,
    );

    // Plan.monthlyPrice/quarterlyPrice/yearlyPrice are stored tax-exclusive —
    // this is the actual amount Cashfree charges the customer, so GST goes
    // on top here, not into the stored plan price. Defaults to 0 (no GST
    // added) only if a caller genuinely has no rate to pass — every real
    // call site should be passing the live CreditPricingConfig.gstPercent.
    const recurringAmount = applyGst(baseAmount, gstPercent);

    if (!Number.isFinite(recurringAmount) || recurringAmount <= 0) {
      throw new ApiError(
        "Invalid Cashfree subscription amount",
        STATUS_CODES.UNPROCESSIBLE_ENTITY,
      );
    }

    const subscriptionId =
      subscriptionIdOverride ?? `sub_${user.id}_${Date.now()}`;
    const normalizedPhone = this.normalizePhone(user.phoneNumber);
    const customerName =
      [user.firstName, user.lastName]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join(" ")
        .trim() || user.email.split("@")[0] || `user_${user.id}`;

    const isLegacySubscriptionEndpoint = this.subscriptionsBaseUrl.includes(
      "/api/v2/subscriptions/nonSeamless/subscription",
    );
    const returnUrl =
      returnUrlOverride && String(returnUrlOverride).startsWith("https://")
        ? String(returnUrlOverride)
        : this.getHttpsReturnUrl();
    const authorizationAmount = Math.min(
      recurringAmount,
      SubscriptionCashfreeService.AUTHORIZATION_AMOUNT_INR,
    );

    const payload = isLegacySubscriptionEndpoint
      ? {
          subscriptionId: subscriptionId,
          customerName,
          customerPhone: normalizedPhone,
          customerEmail: user.email,
          ...(returnUrl ? { returnUrl } : {}),
          authAmount: authorizationAmount,
          planInfo: {
            type: "PERIODIC",
            planName: plan.name,
            maxAmount: recurringAmount,
            maxCycles: 9999,
            intervalType: this.toIntervalType(billingCycle),
            recurringAmount,
            intervals: billingCycle === "QUARTERLY" ? 3 : 1,
          },
          notificationChannels: ["EMAIL"],
        }
      : {
          subscription_id: subscriptionId,
          customer_details: {
            customer_id: `user_${user.id}`,
            customer_name: customerName,
            customer_email: user.email,
            customer_phone: normalizedPhone,
          },
          plan_details: {
            plan_name: plan.name,
            plan_type: "PERIODIC",
            // `plan_amount` is required by subscriptions create API for PERIODIC plans.
            // Keeping `plan_recurring_amount` for backward compatibility across account versions.
            plan_amount: recurringAmount,
            plan_recurring_amount: recurringAmount,
            plan_max_amount: recurringAmount,
            plan_currency: "INR",
            plan_interval_type: this.toIntervalType(billingCycle),
            plan_intervals: billingCycle === "QUARTERLY" ? 3 : 1,
            plan_max_cycles: 9999,
          },
          subscription_meta: {
            ...(returnUrl ? { return_url: returnUrl } : {}),
            notification_channel: ["EMAIL"],
          },
          authorization_details: {
            authorization_amount: authorizationAmount,
            authorization_amount_refund: true,
          },
        };

    this.debugLog("createSubscription request", {
      endpoint: this.subscriptionsBaseUrl,
      subscriptionId,
      billingCycle,
      isLegacySubscriptionEndpoint,
      hasReturnUrl: Boolean(returnUrl),
      payloadPreview: payload,
    });

    const response = await fetch(this.subscriptionsBaseUrl, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    const responseText = await response.text().catch(() => "");
    this.debugLog("createSubscription response", {
      status: response.status,
      ok: response.ok,
      body: responseText.slice(0, 1000),
    });

    if (!response.ok) {
      throw new ApiError(
        `Cashfree subscription create failed: ${response.status}${responseText ? ` - ${responseText.slice(0, 300)}` : ""}`,
        STATUS_CODES.SERVER_ERROR,
      );
    }

    const authLinkFromRawCreate = this.extractAuthLinkFromRawText(responseText);
    let data: any = null;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }
    let authLink = authLinkFromRawCreate ?? this.extractAuthLink(data);
    let subscriptionSessionId = this.extractSubscriptionSessionId(data);
    this.debugLog("createSubscription extracted authLink", { authLink });

    if (!authLink) {
      authLink = await this.getSubscriptionAuthLink(subscriptionId);
    }
    if (!subscriptionSessionId) {
      subscriptionSessionId = await this.getSubscriptionSessionId(subscriptionId);
    }

    return {
      auth_link: authLink,
      subscription_session_id: subscriptionSessionId,
      cashfreeSubscriptionId: subscriptionId,
    };
  }

  private normalizePhone(phoneNumber: string | null | undefined): string {
    const digits = String(phoneNumber ?? "").replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return digits;
    if (digits.length > 15) return digits.slice(-15);
    return "9999999999";
  }

  async getSubscriptionAuthLink(subscriptionId: string): Promise<string | null> {
    const urls = this.getSubscriptionDetailUrls(subscriptionId);
    this.debugLog("getSubscriptionAuthLink started", { subscriptionId, urls });
    let subscriptionSessionId: string | null = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.getHeaders(),
        });

        const bodyText = await response.text().catch(() => "");
        this.debugLog("getSubscriptionAuthLink GET response", {
          url,
          status: response.status,
          ok: response.ok,
          body: bodyText.slice(0, 1000),
        });
        if (!response.ok) continue;
        const authLinkFromRawGet = this.extractAuthLinkFromRawText(bodyText);
        const data = bodyText ? (JSON.parse(bodyText) as any) : {};
        if (!subscriptionSessionId) {
          subscriptionSessionId = this.extractSubscriptionSessionId(data);
        }
        const authLink = authLinkFromRawGet ?? this.extractAuthLink(data);
        if (authLink) {
          this.debugLog("getSubscriptionAuthLink found via GET", { url, authLink });
          return authLink;
        }
      } catch (error: any) {
        this.debugLog("getSubscriptionAuthLink GET error", {
          url,
          message: error?.message ?? String(error),
        });
        // Best effort: try next candidate endpoint.
      }
    }

    // For some PG accounts, auth URL is generated by explicit AUTH creation.
    try {
      const response = await fetch(`${this.pgBaseUrl}/subscriptions/pay`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          subscription_id: subscriptionId,
          ...(subscriptionSessionId ? { subscription_session_id: subscriptionSessionId } : {}),
          payment_id: `auth_${Date.now()}`,
          payment_type: "AUTH",
          payment_method: {
            upi: {
              channel: "link",
            },
          },
        }),
      });

      const bodyText = await response.text().catch(() => "");
      this.debugLog("getSubscriptionAuthLink pay-auth response", {
        endpoint: `${this.pgBaseUrl}/subscriptions/pay`,
        status: response.status,
        ok: response.ok,
        body: bodyText.slice(0, 1000),
      });

      if (response.ok) {
        const authLinkFromRawPay = this.extractAuthLinkFromRawText(bodyText);
        const data = bodyText ? (JSON.parse(bodyText) as any) : {};
        const authLink = authLinkFromRawPay ?? this.extractAuthLink(data);
        if (authLink) {
          this.debugLog("getSubscriptionAuthLink found via pay-auth", { authLink });
          return authLink;
        }

        const checkoutAction = this.extractCheckoutPostAction(data);
        if (checkoutAction) {
          const resolvedLink = await this.resolveCheckoutRedirectUrl(checkoutAction);
          if (resolvedLink) {
            this.debugLog("getSubscriptionAuthLink resolved via pay-auth POST action", {
              resolvedLink,
            });
            return resolvedLink;
          }
        }
      }
    } catch (error: any) {
      this.debugLog("getSubscriptionAuthLink pay-auth error", {
        message: error?.message ?? String(error),
      });
      // Ignore fallback errors and return null below.
    }

    this.debugLog("getSubscriptionAuthLink not found", { subscriptionId });
    return null;
  }

  async getSubscriptionSessionId(subscriptionId: string): Promise<string | null> {
    const urls = this.getSubscriptionDetailUrls(subscriptionId);
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.getHeaders(),
        });
        if (!response.ok) continue;
        const bodyText = await response.text().catch(() => "");
        const data = bodyText ? (JSON.parse(bodyText) as any) : {};
        const sessionId = this.extractSubscriptionSessionId(data);
        if (sessionId) return sessionId;
      } catch {
        // best effort
      }
    }
    return null;
  }

  async syncPlan(plan: CashfreePlanSource, billingCycle: BillingCycle, gstPercent: number) {
    const recurringAmountPaise = getCashfreePlanRecurringAmountPaise(plan, billingCycle, gstPercent);
    if (!Number.isFinite(recurringAmountPaise) || recurringAmountPaise <= 0) {
      // Skip syncing zero/free cycle prices.
      return;
    }

    const planId = getCashfreePlanId(plan, billingCycle, gstPercent);
    const payload = {
      plan_id: planId,
      plan_name: `${plan.name}_${billingCycle}`.slice(0, 40),
      plan_type: "PERIODIC",
      plan_currency: "INR",
      plan_recurring_amount: recurringAmountPaise,
      plan_max_amount: recurringAmountPaise,
      plan_max_cycles: 9999,
      plan_intervals: getCashfreePlanIntervals(billingCycle),
      plan_interval_type: getCashfreePlanIntervalType(billingCycle),
      plan_note: `LocalPlan:${plan.id}:${billingCycle}`.slice(0, 100),
    };

    const response = await fetch(`${this.pgBaseUrl}/plans`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "x-idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) return;

    const bodyText = await response.text().catch(() => "");

    // Treat duplicate plan-id as success (idempotent sync).
    if (response.status === 409 || response.status === 422 || response.status === 400) {
      const lower = bodyText.toLowerCase();
      if (lower.includes("already") || lower.includes("exists") || lower.includes("duplicate")) {
        return;
      }
    }

    // Cashfree may occasionally return transient 5xx for create while persisting the plan.
    // Verify by fetching the plan; if found, treat as success.
    if (response.status >= 500) {
      try {
        const verifyResponse = await fetch(
          `${this.pgBaseUrl}/plans/${encodeURIComponent(planId)}`,
          {
            method: "GET",
            headers: this.getHeaders(),
          },
        );
        if (verifyResponse.ok) {
          this.debugLog("syncPlan recovered after create 5xx; plan exists", {
            planId,
            billingCycle,
            createStatus: response.status,
          });
          return;
        }
      } catch (verifyError: any) {
        this.debugLog("syncPlan verify existing plan failed", {
          planId,
          message: verifyError?.message ?? String(verifyError),
        });
      }
    }

    throw new ApiError(
      `Cashfree plan sync failed: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 300)}` : ""}`,
      STATUS_CODES.SERVER_ERROR,
    );
  }

  async syncAllPlanCycles(plan: CashfreePlanSource, gstPercent: number) {
    await this.syncPlan(plan, "MONTHLY", gstPercent);
    await this.syncPlan(plan, "QUARTERLY", gstPercent);
    await this.syncPlan(plan, "YEARLY", gstPercent);
  }

  async cancelSubscription(subscriptionId: string) {
    const response = await fetch(`${this.subscriptionsBaseUrl}/${subscriptionId}/manage`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        subscription_id: subscriptionId,
        action: "CANCEL",
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error("Cashfree subscription cancel failed", {
        subscriptionId,
        status: response.status,
        body: bodyText.slice(0, 1000),
      });

      // Cashfree returns 400 with code "subscription_status_invalid_for_action"
      // when the subscription is not in a state CANCEL applies to (e.g. never
      // authorized/INITIALIZED, or already CANCELLED/EXPIRED at their end).
      // Either way there is no active mandate left to cancel, so treat it as
      // a no-op success and let the caller mark it cancelled locally instead
      // of failing the request forever.
      const errorCode = (() => {
        try {
          return JSON.parse(bodyText)?.code;
        } catch {
          return null;
        }
      })();
      if (response.status === 400 && errorCode === "subscription_status_invalid_for_action") {
        return;
      }

      throw new ApiError(
        `Cashfree subscription cancel failed: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 300)}` : ""}`,
        STATUS_CODES.SERVER_ERROR,
      );
    }
  }

  async triggerFirstCharge(subscriptionId: string, paymentAmount: number): Promise<boolean> {
    const endpoint = `${this.pgBaseUrl}/subscriptions/pay`;
    const paymentId = `initial_charge_${subscriptionId}`;
    // Cashfree "raise charge" for subscriptions requires payment_amount for CHARGE.
    // `payment_schedule_date` is required for UPI and CARD payment modes (Cashfree docs).
    // Only the date component is considered by Cashfree; time is ignored.

    // UPI AutoPay has cut-off windows where charges are not allowed on the same day.
    // We schedule based on the FAQ cut-off table (IST) to reduce 400s:
    // - 00:00–06:59 -> can be T, but Cashfree often enforces "future date" validation; use T+1.
    // - 07:00–20:59 -> T+1
    // - 21:00–23:59 -> T+2
    const now = new Date();
    const istMs = now.getTime() + 330 * 60 * 1000; // IST = UTC+05:30, fixed offset
    const ist = new Date(istMs);
    const istMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes(); // treat "ist" as UTC clock
    const scheduleDays = istMinutes >= 21 * 60 ? 2 : 1;
    const paymentScheduleDate = new Date(now.getTime() + scheduleDays * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      subscription_id: subscriptionId,
      payment_id: paymentId,
      payment_type: "CHARGE",
      payment_amount: paymentAmount,
      payment_schedule_date: paymentScheduleDate,
    };

    // x-idempotency-key must match the exact request body to avoid idempotency mismatch errors.
    // Hashing the payload ensures: same payload -> same key, different payload -> different key.
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, 40);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text().catch(() => "");
      console.info("[Cashfree][Subscription] triggerFirstCharge attempt", {
        endpoint,
        subscriptionId,
        paymentId,
        paymentType: payload.payment_type,
        paymentAmount: payload.payment_amount,
        paymentScheduleDate: payload.payment_schedule_date,
        status: response.status,
        ok: response.ok,
        bodyPreview: bodyText ? bodyText.slice(0, 250) : "",
      });

      return response.ok;
    } catch (error: any) {
      console.warn("[Cashfree][Subscription] triggerFirstCharge error", {
        subscriptionId,
        paymentId,
        paymentType: payload.payment_type,
        paymentAmount: payload.payment_amount,
        message: error?.message ?? String(error),
      });
      return false;
    }
  }

  verifyWebhookSignature(req: any) {
    const timestamp = req.headers["x-webhook-timestamp"];
    const signature = req.headers["x-webhook-signature"];

    if (!timestamp || !signature) {
      throw new ApiError(
        "Missing Cashfree webhook signature headers",
        STATUS_CODES.UNAUTHORIZED,
      );
    }

    const rawBody =
      (req.rawBody as Buffer | undefined)?.toString("utf8") ??
      JSON.stringify(req.body ?? "");

    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_APP_SECRET;
    if (!webhookSecret) {
      throw new ApiError(
        "Cashfree webhook secret is not configured",
        STATUS_CODES.SERVER_ERROR,
      );
    }

    const computed = crypto
      .createHmac("sha256", String(webhookSecret))
      .update(String(timestamp) + rawBody)
      .digest("base64");

    const computedBuf = Buffer.from(computed, "utf8");
    const signatureBuf = Buffer.from(String(signature), "utf8");
    if (computedBuf.length !== signatureBuf.length) {
      throw new ApiError("Invalid Cashfree webhook signature", STATUS_CODES.UNAUTHORIZED);
    }
    if (!crypto.timingSafeEqual(computedBuf, signatureBuf)) {
      throw new ApiError("Invalid Cashfree webhook signature", STATUS_CODES.UNAUTHORIZED);
    }
  }
}

export default SubscriptionCashfreeService;

