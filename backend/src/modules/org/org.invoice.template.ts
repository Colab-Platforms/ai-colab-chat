export const orgInvoiceTemplate = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 40px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 28px; width: auto; }
  .brand-name { font-size: 18px; font-weight: bold; }
  .meta { text-align: right; }
  .title { font-size: 22px; font-weight: bold; }
  .meta-line { color: #666; font-size: 12px; margin-top: 3px; }
  .badge { display: inline-block; margin-top: 8px; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: bold; }
  .badge-PAID { background: #e3f6ea; color: #1a7f4b; border: 1px solid #b7e6c8; }
  .badge-DUE { background: #fff4e0; color: #a15c00; border: 1px solid #ffdd9e; }
  .badge-VOID { background: #eee; color: #666; border: 1px solid #ddd; }
  .parties { display: flex; justify-content: space-between; margin-top: 28px; gap: 24px; }
  .party { flex: 1; }
  .label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
  .value { font-size: 13px; line-height: 1.5; }
  .value strong { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 32px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e0e0e0; font-size: 13px; vertical-align: top; }
  th { color: #888; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; }
  .r { text-align: right; }
  .totals { margin-top: 4px; }
  .totals td { border-bottom: none; padding: 6px 8px; }
  .totals .grand td { font-weight: bold; border-top: 1px solid #1a1a1a; padding-top: 12px; }
  .note { margin-top: 24px; padding: 14px 16px; background: #f6f7fb; border: 1px solid #e4e7f0; border-radius: 6px; font-size: 12px; color: #444; line-height: 1.6; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #444; line-height: 1.6; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="<%= logoDataUri %>" alt="Colab Platforms" />
      <span class="brand-name">colabplatforms.ai</span>
    </div>
    <div class="meta">
      <div class="title">TAX INVOICE</div>
      <div class="meta-line">#<%= number %></div>
      <div class="meta-line">Issued <%= issuedOn %></div>
      <div class="badge badge-<%= status %>"><%= status %></div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Billed to</div>
      <div class="value">
        <strong><%= orgName %></strong><br />
        <% if (gstin) { %>GSTIN: <%= gstin %><br /><% } %>
        <%= billingEmail %>
        <% if (addressLines.length) { %><br /><%- addressLines.join("<br />") %><% } %>
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
    <colgroup><col style="width:50%" /><col style="width:12%" /><col style="width:19%" /><col style="width:19%" /></colgroup>
    <thead>
      <tr><th>Description</th><th class="r">Seats</th><th class="r">Per seat / month</th><th class="r">Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <%= description %>
          <div style="color:#888;font-size:11px;margin-top:2px;"><%= periodText %></div>
        </td>
        <td class="r"><%= seatsText %></td>
        <td class="r"><%= currency %> <%= pricePerSeat %></td>
        <td class="r"><%= currency %> <%= baseAmount %></td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <colgroup><col style="width:81%" /><col style="width:19%" /></colgroup>
    <tr><td class="r">Subtotal</td><td class="r"><%= currency %> <%= baseAmount %></td></tr>
    <tr><td class="r">GST (<%= taxPercent %>%)</td><td class="r"><%= currency %> <%= taxAmount %></td></tr>
    <tr class="grand"><td class="r"><%= status === "PAID" ? "Amount paid" : "Amount due" %></td><td class="r"><%= currency %> <%= totalAmount %></td></tr>
  </table>

  <div class="note">
    <% if (status === "PAID") { %>
      Paid on <strong><%= paidOn %></strong> via <%= methodText %><% if (reference) { %> (ref. <%= reference %>)<% } %>.
    <% } else { %>
      Please pay by <strong><%= dueOn %></strong>. You can pay online from <em>Organization &rarr; Billing</em>
      <% if (bankTransfer) { %>or by bank transfer quote <strong><%= number %></strong> as the reference<% } %>.
      Service continues for <%= graceDays %> days after the due date; after that your team moves to the Free plan until payment is received.
    <% } %>
  </div>

  <div class="footer">
    This is a system-generated invoice and does not require a physical signature. For billing queries contact
    support@colabplatforms.ai and quote the invoice number.
  </div>
</body>
</html>
`;
