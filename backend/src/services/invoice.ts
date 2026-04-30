import puppeteer from 'puppeteer';
import { formatCents } from '../shared/index.js';
import { sendEmail } from './email.js';
import { brandedEmail } from './email-templates.js';
import { FARM2COOK_LOGO_DATA_URL } from '../assets/farm2cook-logo.js';

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
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #cc2b2b; }
    .brand-logo { height: 64px; width: auto; display: block; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 6px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
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
    .payment-badge { display: inline-block; background: #fdf2f2; color: #cc2b2b; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 16px; }
    .totals-table .total-row td { color: #cc2b2b; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; line-height: 1.6; }
    .footer .footer-brand { color: #1a1a1a; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <img src="${FARM2COOK_LOGO_DATA_URL}" alt="FARM2COOK" class="brand-logo" />
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
    <p>Thank you for choosing <span class="footer-brand">Farm2Cook</span>.</p>
    <p style="margin-top:4px;">Questions about this invoice? Email <a href="mailto:hello@farm2cook.com" style="color:#cc2b2b;text-decoration:none;">hello@farm2cook.com</a></p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:30px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#cc2b2b;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
      Print Invoice
    </button>
  </div>
</body>
</html>`;
}

export async function generateInvoicePdf(html: string): Promise<Buffer> {
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
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#1a1a1a;">${i.productName}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center;">&times;${i.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#1a1a1a;text-align:right;">${formatCents(i.total)}</td>
    </tr>`)
    .join('');

  return brandedEmail({
    preheader: `Your invoice ${invoiceNumber} is attached — ${formatCents(order.total)} total.`,
    headline: `Your invoice is ready, ${firstName}!`,
    body: `
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.7;">
        Thank you for your order. Your invoice is attached as a PDF. Here's a quick summary.
      </p>

      <div style="background:#fdfaf5;border:1px solid #e8e0d0;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
        <table style="width:100%;" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:4px 0;"><span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;">Invoice</span><br/><span style="font-size:15px;font-weight:800;color:#1a1a1a;">${invoiceNumber}</span></td>
          <td style="padding:4px 0;"><span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/><span style="font-size:14px;font-weight:600;color:#1a1a1a;">${invoiceDate}</span></td>
          <td style="padding:4px 0;"><span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;">Total</span><br/><span style="font-size:15px;font-weight:800;color:#cc2b2b;">${formatCents(order.total)}</span></td>
        </tr></table>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead><tr>
          <th style="padding:8px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:700;text-align:left;border-bottom:2px solid #e8e0d0;">Item</th>
          <th style="padding:8px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:700;text-align:center;border-bottom:2px solid #e8e0d0;">Qty</th>
          <th style="padding:8px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:700;text-align:right;border-bottom:2px solid #e8e0d0;">Amount</th>
        </tr></thead>
        <tbody>${itemList}</tbody>
        <tfoot>
          ${order.deliveryFee > 0 ? `<tr><td colspan="2" style="padding:4px 0;font-size:13px;color:#6b7280;text-align:right;">Delivery</td><td style="padding:4px 0;font-size:13px;color:#1a1a1a;text-align:right;">${formatCents(order.deliveryFee)}</td></tr>` : ''}
          <tr><td colspan="2" style="padding:4px 0;font-size:13px;color:#6b7280;text-align:right;">Tax</td><td style="padding:4px 0;font-size:13px;color:#1a1a1a;text-align:right;">${formatCents(order.tax)}</td></tr>
          <tr><td colspan="2" style="padding:10px 0 0;font-size:16px;font-weight:800;color:#1a1a1a;text-align:right;border-top:2px solid #1a1a1a;">Total</td><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:#cc2b2b;text-align:right;border-top:2px solid #1a1a1a;">${formatCents(order.total)}</td></tr>
        </tfoot>
      </table>

      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
        Questions? Reply to this email — we're happy to help. Please keep the attached PDF for your records.
      </p>
    `,
    ctaLabel: 'View Your Orders',
    ctaUrl: 'https://customer-akxe.onrender.com/account/orders',
  });
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
