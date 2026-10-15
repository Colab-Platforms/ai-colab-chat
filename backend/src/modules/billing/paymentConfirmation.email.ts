import { sendEmail } from "@/utils/email.js";

export interface PaymentConfirmationData {
  to: string;
  customerName: string;
  invoiceNumber: string;
  planName: string;
  billingCycle: string | null;
  currency: string;
  amount: string;
  baseAmount: string | null;
  taxPercent: string | null;
  taxAmount: string | null;
  validUntil: Date | null;
  invoicePdf: Buffer | null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatMoney = (value: string, currency: string) => {
  const n = Number(value);
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const sendPaymentConfirmationEmail = async (d: PaymentConfirmationData) => {
  const name = escapeHtml(d.customerName);
  const plan = escapeHtml(d.planName);
  const cycle = d.billingCycle ? d.billingCycle.charAt(0) + d.billingCycle.slice(1).toLowerCase() : null;
  const hasTax = d.baseAmount != null && d.taxPercent != null && d.taxAmount != null;
  const validUntil = d.validUntil
    ? new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }).format(d.validUntil)
    : null;

  const rows: Array<[string, string, boolean?]> = [
    ["Plan", cycle ? `${plan} (${cycle})` : plan],
    ["Invoice", `#${escapeHtml(d.invoiceNumber)}`],
  ];
  if (hasTax) {
    rows.push(["Amount", formatMoney(d.baseAmount!, d.currency)]);
    rows.push([`GST (${d.taxPercent}%)`, formatMoney(d.taxAmount!, d.currency)]);
  }
  rows.push(["Total paid", formatMoney(d.amount, d.currency), true]);
  if (validUntil) rows.push(["Valid until", validUntil]);

  const rowsHtml = rows
    .map(
      ([label, value, bold]) =>
        `<tr><td style="padding:6px 0;color:#475569">${label}</td><td style="padding:6px 0;text-align:right;${bold ? "font-weight:700;color:#0f172a" : "color:#0f172a"}">${value}</td></tr>`,
    )
    .join("");

  const attachNote = d.invoicePdf
    ? "Your GST invoice is attached to this email as a PDF."
    : "Your GST invoice will be available shortly from your account's billing section.";

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
    <div style="padding:32px 12px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
        <div style="padding:24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-weight:700;font-size:20px">AI Colab Chat</div>
        <div style="padding:24px">
          <h1 style="margin:0 0 8px;font-size:22px">Payment successful</h1>
          <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.5">Hi ${name}, thanks for your payment. Your ${plan} plan is now active.</p>
          <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-bottom:20px">${rowsHtml}</table>
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">${attachNote}</p>
        </div>
        <div style="padding:16px 24px 24px;color:#64748b;font-size:12px">Questions? Contact support@colabplatforms.ai and mention invoice #${escapeHtml(d.invoiceNumber)}.</div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    "Payment successful",
    "",
    `Hi ${d.customerName}, thanks for your payment. Your ${d.planName} plan is now active.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value.replace(/&amp;/g, "&")}`),
    "",
    attachNote,
  ].join("\n");

  await sendEmail({
    to: d.to,
    subject: `Payment received – Invoice #${d.invoiceNumber} – AI Colab Chat`,
    text,
    html,
    attachments: d.invoicePdf
      ? [{ filename: `invoice-${d.invoiceNumber}.pdf`, content: d.invoicePdf }]
      : undefined,
  });
};
