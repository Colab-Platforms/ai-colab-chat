import crypto from "crypto";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";

class PaymentCashfreeService {
  private readonly paymentsBaseUrl: string;

  constructor() {
    const subscriptionsBase =
      process.env.CASHFREE_BASE_URL ?? "https://api.cashfree.com/pg/subscriptions";
    this.paymentsBaseUrl = subscriptionsBase.endsWith("/subscriptions")
      ? subscriptionsBase.slice(0, -"/subscriptions".length)
      : subscriptionsBase;
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

  private getHttpsReturnUrl(returnPath = "/profile/subscription/success"): string | null {
    const candidate =
      process.env.CASHFREE_SUBSCRIPTION_RETURN_URL ||
      process.env.FRONTEND_URL ||
      "";
    const trimmed = String(candidate).trim();
    if (!trimmed.startsWith("https://")) return null;
    if (process.env.CASHFREE_SUBSCRIPTION_RETURN_URL) return trimmed;
    return `${trimmed.replace(/\/+$/, "")}${returnPath}`;
  }

  async createOrder(input: {
    orderId: string;
    orderAmount: number;
    customerId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    /** Where Cashfree redirects after checkout — defaults to the subscription success page. */
    returnPath?: string;
  }) {
    const endpoint = `${this.paymentsBaseUrl}/orders`;
    const returnUrl = this.getHttpsReturnUrl(input.returnPath);

    const payload = {
      order_id: input.orderId,
      order_amount: input.orderAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      ...(returnUrl ? { order_meta: { return_url: returnUrl } } : {}),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text().catch(() => "");
    if (!response.ok) {
      throw new ApiError(
        `Cashfree one-time order create failed: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 300)}` : ""}`,
        STATUS_CODES.SERVER_ERROR,
      );
    }

    let data: any = {};
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      data = {};
    }

    return {
      order_id: data?.order_id ?? input.orderId,
      payment_session_id: data?.payment_session_id ?? null,
    };
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

export default PaymentCashfreeService;

