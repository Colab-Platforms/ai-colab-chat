import ejs from "ejs";
import dayjs from "dayjs";
import puppeteer from "puppeteer";
import prisma from "@root/prisma.js";
import { uploadToCloudinary } from "@/utils/cloudinary.js";
import { invoiceLogoBase64 } from "@/assets/invoiceLogo.js";
import { sendEmail } from "@/utils/email.js";
import { orgInvoiceTemplate } from "./org.invoice.template.js";
import { GRACE_DAYS } from "./org.billing.math.js";

const fmt = (d: Date) => dayjs(d).format("D MMM YYYY");
const money = (v: unknown) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND_TEXT = {
  INITIAL: "Colab AI Business subscription",
  RENEWAL: "Colab AI Business renewal",
  SEAT_ADD: "Colab AI Business additional seats (prorated)",
} as const;

/**
 * Renders an OrgBill as a PDF tax invoice, uploads it, and stores the URL.
 * Best-effort: never throws a PDF problem must not block billing.
 */
export async function renderOrgBillPdf(billId: number): Promise<Buffer | null> {
  try {
    const bill = await prisma.orgBill.findUnique({
      where: { id: billId },
      include: { organization: true, subscription: true },
    });
    if (!bill) return null;
    const org = bill.organization;
    const addr = (org.billingAddress ?? {}) as Record<string, unknown>;
    const addressLines = Object.values(addr)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => ejs.escapeXML(v));

    const html = ejs.render(orgInvoiceTemplate, {
      logoDataUri: invoiceLogoBase64,
      number: bill.number,
      issuedOn: fmt(bill.createdAt),
      status: bill.status,
      orgName: org.name,
      gstin: org.gstin,
      billingEmail: org.billingEmail,
      addressLines,
      description: KIND_TEXT[bill.kind],
      periodText: `${fmt(bill.periodStart)} – ${fmt(bill.periodEnd)}`,
      seatsText: bill.kind === "SEAT_ADD" ? `+${(bill.meta as any)?.extraSeats ?? bill.seats}` : String(bill.seats),
      currency: bill.currency,
      pricePerSeat: money(bill.pricePerSeat),
      baseAmount: money(bill.baseAmount),
      taxPercent: Number(bill.taxPercent),
      taxAmount: money(bill.taxAmount),
      totalAmount: money(bill.totalAmount),
      paidOn: bill.paidAt ? fmt(bill.paidAt) : "",
      methodText: bill.paymentMethod === "BANK_TRANSFER" ? "bank transfer" : "online payment",
      reference: bill.paymentReference,
      dueOn: fmt(bill.dueDate),
      bankTransfer: bill.subscription.billingMode === "MANUAL_INVOICE",
      graceDays: GRACE_DAYS,
    });

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    let pdf: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      pdf = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
    } finally {
      await browser.close();
    }

    const uploaded = await uploadToCloudinary(pdf, { folder: "org-invoices", resourceType: "raw", format: "pdf" });
    await prisma.orgBill.update({ where: { id: bill.id }, data: { invoiceUrl: uploaded.url } });
    return pdf;
  } catch (error: any) {
    console.error("Org bill PDF failed", { billId, message: error?.message ?? String(error) });
    return null;
  }
}

type Mail = "ISSUED" | "REMINDER" | "OVERDUE" | "PAID" | "EXPIRED";

/** Billing emails go to the org's billing address. Best-effort, never throws. */
export async function sendOrgBillEmail(billId: number, kind: Mail, pdf?: Buffer | null): Promise<void> {
  try {
    const bill = await prisma.orgBill.findUnique({
      where: { id: billId },
      include: { organization: true, subscription: true },
    });
    if (!bill) return;
    const org = bill.organization;
    const frontend = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
    const link = `${frontend}/org/billing`;
    const total = `₹${money(bill.totalAmount)}`;
    const accessEnds = fmt(dayjs(bill.dueDate).add(GRACE_DAYS, "day").toDate());

    const copy: Record<Mail, { subject: string; body: string }> = {
      ISSUED: {
        subject: `Invoice ${bill.number} for ${org.name} ${total}`,
        body: `Your invoice <strong>${bill.number}</strong> for ${total} (incl. GST) is ready. It is due by <strong>${fmt(bill.dueDate)}</strong>.`,
      },
      REMINDER: {
        subject: `Reminder: invoice ${bill.number} is due ${fmt(bill.dueDate)}`,
        body: `Invoice <strong>${bill.number}</strong> (${total}) is due on <strong>${fmt(bill.dueDate)}</strong>. Pay before then to avoid any interruption for your team.`,
      },
      OVERDUE: {
        subject: `Action needed: invoice ${bill.number} is overdue`,
        body: `Invoice <strong>${bill.number}</strong> (${total}) is overdue. Your team keeps access until <strong>${accessEnds}</strong>; after that everyone moves to the Free plan until payment is received.`,
      },
      PAID: {
        subject: `Payment received invoice ${bill.number}`,
        body: `We received your payment of ${total} for invoice <strong>${bill.number}</strong>. Thank you!`,
      },
      EXPIRED: {
        subject: `${org.name}: your Colab AI Business plan has ended`,
        body: `We didn't receive payment for invoice <strong>${bill.number}</strong>, so your team has moved to the Free plan. Pay the invoice to restore access immediately no data was deleted.`,
      },
    };

    const { subject, body } = copy[kind];
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111"><h2 style="margin:0 0 12px">${org.name}</h2><p style="line-height:1.55">${body}</p>${
      kind === "PAID" ? "" : `<p style="margin:24px 0"><a href="${link}" style="background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">View invoice &amp; pay</a></p>`
    }<p style="color:#888;font-size:13px">Colab Platforms · support@colabplatforms.ai</p></div>`;
    const text = body.replace(/<[^>]+>/g, "") + `\n\n${link}`;

    await sendEmail({
      to: org.billingEmail,
      subject,
      text,
      html,
      attachments: pdf ? [{ filename: `${bill.number}.pdf`, content: pdf }] : undefined,
    });
  } catch (error: any) {
    console.error("Org bill email failed", { billId, kind, message: error?.message ?? String(error) });
  }
}

