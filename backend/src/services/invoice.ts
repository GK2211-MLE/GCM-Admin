import puppeteer from 'puppeteer';
import { formatCents } from '../shared/index.js';
import { sendEmail } from './email.js';

interface InvoiceItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceOrder {
  orderCode: string;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  createdAt: Date;
}

interface InvoiceCustomer {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export function generateInvoiceHtml(
  order: InvoiceOrder,
  items: InvoiceItem[],
  customer: InvoiceCustomer,
): string {
  const invoiceNumber = `INV-${order.orderCode}`;
  const invoiceDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const paymentLabel =
    order.paymentMethod === 'stripe'
      ? 'Card (Stripe)'
      : order.paymentMethod === 'cod'
        ? 'Cash on Delivery'
        : order.paymentMethod === 'pay_at_store'
          ? 'Pay at Store'
          : order.paymentMethod;

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.productName}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCents(item.unitPrice)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCents(item.total)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #16a34a; }
    .brand { font-size: 28px; font-weight: 700; color: #16a34a; }
    .brand-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .invoice-meta { text-align: right; }
    .invoice-meta h2 { font-size: 20px; color: #374151; margin-bottom: 4px; }
    .invoice-meta p { font-size: 13px; color: #6b7280; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px; font-weight: 600; }
    .customer-info p { font-size: 14px; line-height: 1.6; }
    .customer-info .name { font-weight: 600; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; border-bottom: 2px solid #e5e7eb; background: #f9fafb; }
    thead th:nth-child(2) { text-align: center; }
    thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    tbody td { font-size: 14px; }
    .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
    .totals-table { width: 260px; }
    .totals-table tr td { padding: 6px 0; font-size: 14px; }
    .totals-table tr td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    .totals-table .total-row td { padding-top: 10px; border-top: 2px solid #1f2937; font-weight: 700; font-size: 16px; }
    .payment-badge { display: inline-block; background: #f0fdf4; color: #16a34a; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 16px; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Farm2Cook</div>
      <div class="brand-sub">Fresh from farm to your kitchen</div>
    </div>
    <div class="invoice-meta">
      <h2>${invoiceNumber}</h2>
      <p>${invoiceDate}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Bill To</div>
    <div class="customer-info">
      <p class="name">${customer.name || 'Unknown'}</p>
      ${customer.phone ? `<p>${customer.phone}</p>` : ''}
      ${customer.email ? `<p>${customer.email}</p>` : ''}
    </div>
  </div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tr><td>Subtotal</td><td>${formatCents(order.subtotal)}</td></tr>
        <tr><td>Tax</td><td>${formatCents(order.tax)}</td></tr>
        ${order.deliveryFee > 0 ? `<tr><td>Delivery Fee</td><td>${formatCents(order.deliveryFee)}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td>${formatCents(order.total)}</td></tr>
      </table>
    </div>

    <div style="text-align:right;">
      <span class="payment-badge">Paid via ${paymentLabel}</span>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for your order!</p>
    <p style="margin-top:4px;">Farm2Cook</p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:30px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
      Print Invoice
    </button>
  </div>
</body>
</html>`;
}

async function generateInvoicePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function buildEmailBody(
  order: InvoiceOrder,
  items: InvoiceItem[],
  customer: InvoiceCustomer,
): string {
  const invoiceNumber = `INV-${order.orderCode}`;
  const invoiceDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const firstName = customer.name?.split(' ')[0] || 'there';

  const itemList = items
    .map((i) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${i.productName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;text-align:center;">x${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:right;font-weight:600;">${formatCents(i.total)}</td>
    </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:#16a34a;padding:32px 40px;">
      <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Farm2Cook</div>
      <div style="font-size:13px;color:#bbf7d0;margin-top:4px;">Fresh from farm to your kitchen</div>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Your invoice is ready, ${firstName}! 🎉</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
        Thank you for your order. Please find your invoice attached as a PDF. Here's a quick summary of what you ordered.
      </p>

      <!-- Order meta -->
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;">Invoice</div>
          <div style="font-size:15px;font-weight:700;color:#111827;margin-top:2px;">${invoiceNumber}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;">Order</div>
          <div style="font-size:15px;font-weight:700;color:#111827;margin-top:2px;">${order.orderCode}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;">Date</div>
          <div style="font-size:15px;font-weight:700;color:#111827;margin-top:2px;">${invoiceDate}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;">Total Paid</div>
          <div style="font-size:15px;font-weight:700;color:#16a34a;margin-top:2px;">${formatCents(order.total)}</div>
        </div>
      </div>

      <!-- Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;text-align:center;border-bottom:2px solid #e5e7eb;">Qty</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;text-align:right;border-bottom:2px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemList}</tbody>
        <tfoot>
          ${order.deliveryFee > 0 ? `<tr><td colspan="2" style="padding:6px 12px;font-size:13px;color:#6b7280;text-align:right;">Delivery Fee</td><td style="padding:6px 12px;font-size:13px;color:#374151;text-align:right;">${formatCents(order.deliveryFee)}</td></tr>` : ''}
          <tr><td colspan="2" style="padding:6px 12px;font-size:13px;color:#6b7280;text-align:right;">Tax</td><td style="padding:6px 12px;font-size:13px;color:#374151;text-align:right;">${formatCents(order.tax)}</td></tr>
          <tr style="border-top:2px solid #e5e7eb;"><td colspan="2" style="padding:10px 12px;font-size:15px;font-weight:700;color:#111827;text-align:right;">Total</td><td style="padding:10px 12px;font-size:15px;font-weight:700;color:#16a34a;text-align:right;">${formatCents(order.total)}</td></tr>
        </tfoot>
      </table>

      <!-- Reorder CTA -->
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#15803d;">Loved your order? Order again! 🛒</p>
        <p style="margin:0;font-size:14px;color:#4ade80;color:#166534;line-height:1.5;">
          Open the Farm2Cook app to reorder your favourite items with just a tap. Fresh farm produce delivered straight to you.
        </p>
      </div>

      <!-- Support note -->
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
        Questions about your order? Reply to this email or contact us — we're happy to help.
        Please keep the attached PDF for your records.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Farm2Cook. All rights reserved.</p>
      <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Fresh from farm to your kitchen.</p>
    </div>

  </div>
</body>
</html>`;
}

export async function sendInvoiceEmail(
  order: InvoiceOrder,
  items: InvoiceItem[],
  customer: InvoiceCustomer,
): Promise<void> {
  if (!customer.email) return;

  const invoiceHtml = generateInvoiceHtml(order, items, customer);
  const [pdfBuffer, emailBody] = await Promise.all([
    generateInvoicePdf(invoiceHtml),
    Promise.resolve(buildEmailBody(order, items, customer)),
  ]);

  await sendEmail(
    customer.email,
    `Your Invoice ${`INV-${order.orderCode}`} – Farm2Cook`,
    emailBody,
    [
      {
        filename: `INV-${order.orderCode}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  );
}
