export interface InvoiceTemplateData {
  logoDataUri: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  billingCycle: string | null;
  paymentType: string;
  amount: string;
  hasTaxBreakdown: boolean;
  baseAmount: string | null;
  taxPercent: string | null;
  taxAmount: string | null;
  currency: string;
  nextBillingDate: string | null;
  autoRenew: boolean;
}

export const invoiceTemplate = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #ffffff; margin: 0; padding: 40px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 28px; width: auto; }
  .brand-name { font-size: 18px; font-weight: bold; letter-spacing: -0.01em; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 22px; font-weight: bold; }
  .meta-line { color: #666; font-size: 12px; margin-top: 3px; }
  .status-badge { display: inline-block; margin-top: 8px; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: bold; letter-spacing: 0.03em; }
  .status-PAID { background: #e3f6ea; color: #1a7f4b; border: 1px solid #b7e6c8; }
  .status-PENDING { background: #fff4e0; color: #a15c00; border: 1px solid #ffdd9e; }
  .status-FAILED { background: #fde8e8; color: #b42318; border: 1px solid #f6c1c1; }
  .parties { display: flex; justify-content: space-between; margin-top: 28px; gap: 24px; }
  .party { flex: 1; }
  .label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .value { font-size: 13px; line-height: 1.5; }
  .value strong { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 32px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e0e0e0; font-size: 13px; vertical-align: top; }
  th { color: #888; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
  .col-desc { width: 46%; }
  .col-qty { width: 12%; }
  .col-unit { width: 21%; }
  .col-amount { width: 21%; }
  .totals { width: 100%; margin-top: 4px; }
  .totals td { border-bottom: none; padding: 6px 8px; }
  .totals .totals-label { color: #5b6b98; text-align: right; }
  .totals .totals-value { text-align: right; white-space: nowrap; }
  .totals .total-row td { font-weight: bold; color: #1a1a1a; border-top: 1px solid #1a1a1a; padding-top: 12px; }
  .renewal-note { margin-top: 24px; padding: 14px 16px; background: #f6f7fb; border: 1px solid #e4e7f0; border-radius: 6px; font-size: 12px; color: #444; line-height: 1.6; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; gap: 24px; }
  .footer-address { font-size: 12px; color: #444; line-height: 1.6; }
  .footer-address strong { display: block; font-size: 13px; color: #1a1a1a; margin-bottom: 2px; }
  .footer-note { font-size: 11px; color: #999; text-align: right; max-width: 260px; line-height: 1.6; }
  .thank-you { text-align: center; margin-top: 24px; font-size: 12px; color: #888; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="<%= logoDataUri %>" alt="Colab Platforms" />
      <span class="brand-name">colabplatforms.ai</span>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">INVOICE</div>
      <div class="meta-line">#<%= invoiceNumber %></div>
      <div class="meta-line"><%= invoiceDate %></div>
      <div class="status-badge status-<%= status %>"><%= status %></div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Billed to</div>
      <div class="value">
        <strong><%= customerName %></strong><br />
        <%= customerEmail %>
      </div>
    </div>
    <div class="party" style="text-align: right;">
      <div class="label">From</div>
      <div class="value">
        <strong>Colab Platforms</strong><br />
        B-202, Takshashila, Samant Estate,<br />
        Goregaon East, Mumbai - 400063
      </div>
    </div>
  </div>

  <table>
    <colgroup>
      <col class="col-desc" />
      <col class="col-qty" />
      <col class="col-unit" />
      <col class="col-amount" />
    </colgroup>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align: right;">Qty</th>
        <th style="text-align: right;">Unit price</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <%= planName %>
          <% if (billingCycle) { %> (<%= billingCycle %>)<% } %>
          <div style="color: #888; font-size: 11px; margin-top: 2px;">
            <%= paymentType === "RECURRING" ? "Subscription renewal" : "One-time payment" %>
          </div>
        </td>
        <td style="text-align: right;">1</td>
        <td style="text-align: right;"><%= currency %> <%= hasTaxBreakdown ? baseAmount : amount %></td>
        <td style="text-align: right;"><%= currency %> <%= hasTaxBreakdown ? baseAmount : amount %></td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <colgroup>
      <col style="width: 79%;" />
      <col class="col-amount" />
    </colgroup>
    <tr>
      <td class="totals-label">Subtotal</td>
      <td class="totals-value totals-label"><%= currency %> <%= hasTaxBreakdown ? baseAmount : amount %></td>
    </tr>
    <% if (hasTaxBreakdown) { %>
    <tr>
      <td class="totals-label">GST (<%= taxPercent %>%)</td>
      <td class="totals-value totals-label"><%= currency %> <%= taxAmount %></td>
    </tr>
    <% } %>
    <tr>
      <td class="totals-label">Total</td>
      <td class="totals-value totals-label"><%= currency %> <%= amount %></td>
    </tr>
    <% if (status === "PAID") { %>
    <tr class="total-row">
      <td style="text-align: right;">Amount paid</td>
      <td class="totals-value"><%= currency %> <%= amount %></td>
    </tr>
    <% } %>
  </table>

  <% if (nextBillingDate) { %>
  <div class="renewal-note">
    <% if (autoRenew) { %>
      Your <%= planName %> plan will renew automatically on <strong><%= nextBillingDate %></strong>.
      To avoid any interruption to your service, please ensure your auto-pay mandate remains active
      and your payment method is up to date.
    <% } else { %>
      Your <%= planName %> plan is scheduled to expire on <strong><%= nextBillingDate %></strong>.
      To avoid any interruption to your service, please renew your subscription or enable auto-pay
      before this date.
    <% } %>
  </div>
  <% } %>

  <div class="footer">
    <div class="footer-address">
      <strong>Colab Platforms</strong>
      B-202, Takshashila, Samant Estate,<br />
      Goregaon East, Mumbai - 400063
    </div>
    <div class="footer-note">
      This is a system-generated invoice for your Colab Platforms
      subscription and does not require a physical signature. For billing
      queries, contact support@colabplatforms.ai and reference the invoice
      number above.
    </div>
  </div>

  <div class="thank-you">Thank you for building with Colab Platforms</div>
</body>
</html>
`;
