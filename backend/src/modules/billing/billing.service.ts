import crypto from "crypto";
import dayjs from "dayjs";
import { Prisma, PaymentType, WebhookEventStatus } from "@prisma/client";
import prisma from "@root/prisma.js";
import {
  getPaginationOptions,
  formatPaginationResponse,
} from "@/utils/paginationUtils.js";
import { buildPrismaQuery } from "prisma-qb";

interface CreatePaymentAndInvoiceParams {
  userId: number;
  walletId?: number | null;
  subscriptionId?: number | null;
  type: PaymentType;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  providerSubscriptionId?: string | null;
  amount: number;
  /** Tax breakdown of `amount`, when known — see the matching comment on Payment in schema.prisma. */
  baseAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
  currency?: string;
  metadata?: any;
}

class BillingService {
  /**
   * Records a webhook delivery for idempotency/audit. The payloadHash unique
   * constraint makes duplicate deliveries fail fast instead of being reprocessed.
   */
  async recordWebhookEvent(params: {
    provider?: string;
    eventType: string;
    timestamp: string | undefined;
    rawBody: string;
  }): Promise<{ event: { id: number } | null; duplicate: boolean }> {
    const payloadHash = crypto
      .createHash("sha256")
      .update(String(params.timestamp ?? "") + params.rawBody)
      .digest("hex");

    try {
      const event = await prisma.billingWebhookEvent.create({
        data: {
          provider: params.provider ?? "CASHFREE",
          eventType: params.eventType,
          payloadHash,
          rawBody: params.rawBody,
          status: "RECEIVED",
        },
      });
      return { event, duplicate: false };
    } catch (error: any) {
      if (error?.code === "P2002") {
        return { event: null, duplicate: true };
      }
      throw error;
    }
  }

  async markWebhookEvent(
    eventId: number | undefined | null,
    status: WebhookEventStatus,
    errorMessage?: string,
  ) {
    if (!eventId) return;
    await prisma.billingWebhookEvent.update({
      where: { id: eventId },
      data: { status, errorMessage, processedAt: new Date() },
    });
  }

  /**
   * Upserts a COMPLETED Payment (keyed on provider+providerPaymentId so
   * re-processing the same webhook is a no-op) and creates its Invoice row.
   * Must be called inside the caller's existing $transaction.
   */
  async createPaymentAndInvoice(
    tx: Prisma.TransactionClient,
    params: CreatePaymentAndInvoiceParams,
  ): Promise<number> {
    const currency = params.currency ?? "INR";

    // One-time flow pre-creates a PENDING Payment (keyed by providerOrderId) at
    // checkout time, before providerPaymentId is known. Recurring flow has no
    // such row and providerPaymentId is always known up front, so it's safe to
    // key the lookup on the unique (provider, providerPaymentId) pair there.
    const existing = params.providerOrderId
      ? await tx.payment.findFirst({ where: { provider: "CASHFREE", providerOrderId: params.providerOrderId } })
      : params.providerPaymentId
        ? await tx.payment.findUnique({
            where: { provider_providerPaymentId: { provider: "CASHFREE", providerPaymentId: params.providerPaymentId } },
          })
        : null;

    const payment = existing
      ? await tx.payment.update({
          where: { id: existing.id },
          data: {
            status: "COMPLETED",
            amount: params.amount,
            baseAmount: params.baseAmount ?? existing.baseAmount,
            taxPercent: params.taxPercent ?? existing.taxPercent,
            taxAmount: params.taxAmount ?? existing.taxAmount,
            currency,
            providerPaymentId: params.providerPaymentId ?? existing.providerPaymentId,
            providerSubscriptionId: params.providerSubscriptionId ?? existing.providerSubscriptionId,
            walletId: params.walletId ?? existing.walletId,
          },
        })
      : await tx.payment.create({
          data: {
            userId: params.userId,
            walletId: params.walletId ?? undefined,
            subscriptionId: params.subscriptionId ?? undefined,
            type: params.type,
            provider: "CASHFREE",
            providerOrderId: params.providerOrderId ?? undefined,
            providerPaymentId: params.providerPaymentId ?? undefined,
            providerSubscriptionId: params.providerSubscriptionId ?? undefined,
            amount: params.amount,
            baseAmount: params.baseAmount ?? undefined,
            taxPercent: params.taxPercent ?? undefined,
            taxAmount: params.taxAmount ?? undefined,
            currency,
            status: "COMPLETED",
            metadata: params.metadata ?? undefined,
          },
        });

    const existingInvoice = await tx.invoice.findUnique({
      where: { paymentId: payment.id },
    });
    if (existingInvoice) {
      return payment.id;
    }

    const invoiceNumber = `INV-${dayjs().format("YYYYMM")}-${String(payment.id).padStart(6, "0")}`;
    await tx.invoice.create({
      data: {
        paymentId: payment.id,
        userId: params.userId,
        invoiceNumber,
        amount: params.amount,
        currency,
        status: "PENDING",
      },
    });

    return payment.id;
  }

  async markPaymentFailed(params: {
    userId: number;
    type: PaymentType;
    subscriptionId?: number | null;
    providerOrderId?: string | null;
    providerPaymentId?: string | null;
    amount: number;
    currency?: string;
  }) {
    const existing = params.providerOrderId
      ? await prisma.payment.findFirst({ where: { provider: "CASHFREE", providerOrderId: params.providerOrderId } })
      : params.providerPaymentId
        ? await prisma.payment.findUnique({
            where: { provider_providerPaymentId: { provider: "CASHFREE", providerPaymentId: params.providerPaymentId } },
          })
        : null;

    if (existing) {
      await prisma.payment.update({ where: { id: existing.id }, data: { status: "FAILED" } });
      return;
    }

    await prisma.payment.create({
      data: {
        userId: params.userId,
        subscriptionId: params.subscriptionId ?? undefined,
        type: params.type,
        provider: "CASHFREE",
        providerOrderId: params.providerOrderId ?? undefined,
        providerPaymentId: params.providerPaymentId ?? undefined,
        amount: params.amount,
        currency: params.currency ?? "INR",
        status: "FAILED",
      },
    });
  }

  async getInvoices(query: any, userId: number) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 10);

    const { where: qbWhere, orderBy } = buildPrismaQuery({
      query,
      searchFields: [{ field: "invoiceNumber", model: "invoice" }],
      filterFields: [{ key: "status", field: "status", type: "string" }],
      sortFields: [{ key: "createdAt", field: "createdAt" }],
      defaultSort: { key: "createdAt", order: "desc" },
      allowedQueryKeys: ["page", "pageSize"],
    });

    const where: any = { ...qbWhere, userId };

    const [invoices, totalRecords] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { payment: { select: { type: true, providerOrderId: true } } },
      }),
      prisma.invoice.count({ where }),
    ]);

    return formatPaginationResponse(invoices, totalRecords, page, pageSize);
  }
}

export default BillingService;
