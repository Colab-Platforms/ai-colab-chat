import ejs from "ejs";
import puppeteer from "puppeteer";
import prisma from "@root/prisma.js";
import { uploadToCloudinary } from "@/utils/cloudinary.js";
import { invoiceTemplate } from "./invoice.template.js";
import { invoiceLogoBase64 } from "@/assets/invoiceLogo.js";

class InvoiceService {
  /**
   * Renders the invoice PDF and uploads it to Cloudinary, updating the
   * Invoice row's status/url. Best-effort: never throws, since a failure
   * here must not fail the webhook response that triggered it.
   */
  async generateAndUploadInvoice(paymentId: number): Promise<void> {
    const invoice = await prisma.invoice.findUnique({
      where: { paymentId },
      include: {
        payment: { include: { subscription: { include: { plan: true } } } },
        user: true,
      },
    });
    if (!invoice) return;

    try {
      const subscription = invoice.payment.subscription;
      const planName = subscription?.plan?.name ?? "Wallet Top-up";
      const billingCycle = subscription?.billingCycle ?? null;
      const customerName = [invoice.user.firstName, invoice.user.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || invoice.user.email;

      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const nextBillingDate = subscription?.nextBillingDate
        ? dateFormatter.format(subscription.nextBillingDate)
        : null;

      // baseAmount/taxPercent/taxAmount are null for payments predating this
      // split (or for flows that don't add GST on top, e.g. credit top-ups) —
      // the template falls back to a single-line total in that case rather
      // than showing a fabricated $0 tax row.
      const baseAmount = invoice.payment.baseAmount;
      const taxPercent = invoice.payment.taxPercent;
      const taxAmount = invoice.payment.taxAmount;
      const hasTaxBreakdown = baseAmount != null && taxPercent != null && taxAmount != null;

      const html = ejs.render(invoiceTemplate, {
        logoDataUri: invoiceLogoBase64,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt.toDateString(),
        status: "PAID",
        customerName,
        customerEmail: invoice.user.email,
        planName,
        billingCycle,
        paymentType: invoice.payment.type,
        amount: invoice.amount.toString(),
        hasTaxBreakdown,
        baseAmount: hasTaxBreakdown ? baseAmount!.toString() : null,
        taxPercent: hasTaxBreakdown ? taxPercent!.toString() : null,
        taxAmount: hasTaxBreakdown ? taxAmount!.toString() : null,
        currency: invoice.currency,
        nextBillingDate,
        autoRenew: subscription?.autoRenew ?? false,
      });

      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      let pdfBuffer: Buffer;
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        pdfBuffer = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
      } finally {
        await browser.close();
      }

      const uploaded = await uploadToCloudinary(pdfBuffer, {
        folder: "invoices",
        resourceType: "raw",
        format: "pdf",
      });

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { invoiceUrl: uploaded.url, status: "GENERATED", errorMessage: null },
      });
    } catch (error: any) {
      console.error("Invoice generation failed", { paymentId, message: error?.message ?? String(error) });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "FAILED", errorMessage: error?.message ?? "Invoice generation failed" },
      });
    }
  }
}

export default InvoiceService;
