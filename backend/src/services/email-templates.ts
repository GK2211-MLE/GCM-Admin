/**
 * Farm2Cook branded email template system.
 *
 * All customer-facing emails use the same visual shell: dark red header
 * with the logo, warm cream body, green halal trust badge, and a branded
 * footer. Individual builders (welcome, orderConfirmation, statusUpdate,
 * newsletterWelcome) slot their content into the shell via `brandedEmail()`.
 *
 * Design tokens match the customer website:
 *   Brand red:  #cc2b2b
 *   Dark red:   #8b1a1a
 *   Halal green:#2d6a2e
 *   Cream bg:   #fdfaf5
 *   Card bg:    #ffffff
 *   Text dark:  #1a1a1a
 *   Text light: #6b7280
 */

import { formatCents } from '../shared/index.js';

const BRAND = {
  red: '#cc2b2b',
  darkRed: '#8b1a1a',
  green: '#2d6a2e',
  cream: '#fdfaf5',
  white: '#ffffff',
  textDark: '#1a1a1a',
  textLight: '#6b7280',
  border: '#e8e0d0',
};

const LOGO_TEXT = `<span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-family:Georgia,'Times New Roman',serif;">FARM<span style="color:#fbbf24;">2</span>COOK</span>`;

const FOOTER_YEAR = new Date().getFullYear();

// ── Shared wrapper ──────────────────────────────────────────────

export function brandedEmail(options: {
  preheader?: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerExtra?: string;
}): string {
  const { preheader, headline, body, ctaLabel, ctaUrl, footerExtra } = options;

  const ctaBlock = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:28px 0 8px;">
        <a href="${ctaUrl}" style="display:inline-block;background:${BRAND.red};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.03em;text-transform:uppercase;">${ctaLabel}</a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${headline}</title>
${preheader ? `<span style="display:none;font-size:1px;color:#fdfaf5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:${BRAND.red};border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
    ${LOGO_TEXT}
    <div style="font-size:11px;color:#ffffff99;margin-top:6px;letter-spacing:0.12em;text-transform:uppercase;">Premium Fresh Meat Delivery</div>
  </div>

  <!-- Body card -->
  <div style="background:${BRAND.white};padding:36px 40px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:${BRAND.textDark};line-height:1.3;">${headline}</h1>
    ${body}
    ${ctaBlock}
  </div>

  <!-- Halal trust strip -->
  <div style="background:#f4f9f4;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};padding:16px 40px;text-align:center;">
    <span style="font-size:11px;font-weight:700;color:${BRAND.green};letter-spacing:0.1em;text-transform:uppercase;">
      &#10003; Halal Certified &nbsp;&middot;&nbsp; No Antibiotics &nbsp;&middot;&nbsp; Farm Fresh &nbsp;&middot;&nbsp; Cold Chain Delivered
    </span>
  </div>

  <!-- Footer -->
  <div style="background:${BRAND.textDark};border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:#ffffff80;">
      &copy; ${FOOTER_YEAR} Farm2Cook. All rights reserved.
    </p>
    <p style="margin:0;font-size:11px;color:#ffffff50;">
      820 W Spring Creek Pkwy, Ste 302, Plano TX 75023
    </p>
    ${footerExtra ? `<div style="margin-top:12px;font-size:11px;color:#ffffff40;">${footerExtra}</div>` : ''}
  </div>

</div>
</body>
</html>`;
}

// ── Welcome email (after signup) ────────────────────────────────

export function welcomeEmail(name: string, siteUrl: string): string {
  const firstName = name.split(' ')[0] || 'there';
  return brandedEmail({
    preheader: `Welcome to Farm2Cook, ${firstName}! Your premium meat journey starts now.`,
    headline: `Welcome to Farm2Cook, ${firstName}!`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:${BRAND.textLight};line-height:1.7;">
        Thank you for creating your account. You now have access to premium, halal-certified
        fresh meats delivered straight from our partner farms to your kitchen.
      </p>
      <div style="background:${BRAND.cream};border:1px solid ${BRAND.border};border-radius:12px;padding:20px 24px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:${BRAND.textDark};text-transform:uppercase;letter-spacing:0.08em;">What you can do now</p>
        <table style="width:100%;" cellpadding="0" cellspacing="0">
          ${['Browse our premium cuts — Goat, Chicken, Lamb, Beef, Seafood',
             'Save your delivery addresses for faster checkout',
             'Track your orders in real time',
             'Get exclusive deals and seasonal recipes'].map(t => `
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:24px;">
              <span style="color:${BRAND.green};font-size:16px;font-weight:700;">&#10003;</span>
            </td>
            <td style="padding:6px 0;font-size:14px;color:${BRAND.textDark};line-height:1.5;">${t}</td>
          </tr>`).join('')}
        </table>
      </div>
    `,
    ctaLabel: 'Start Shopping',
    ctaUrl: `${siteUrl}/shop`,
  });
}

// ── Order confirmation (after checkout) ─────────────────────────

interface OrderEmailItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  imageUrl?: string;
}

interface OrderEmailData {
  orderCode: string;
  items: OrderEmailItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  deliveryMethod: string;
  deliveryAddress?: string | null;
  paymentMethod: string;
  createdAt: Date | string;
}

export function orderConfirmationEmail(
  name: string,
  order: OrderEmailData,
  siteUrl: string,
): string {
  const firstName = name.split(' ')[0] || 'there';
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:middle;">
        ${item.imageUrl
          ? `<img src="${item.imageUrl}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:12px;" />`
          : `<div style="width:48px;height:48px;border-radius:8px;background:${BRAND.cream};display:inline-block;vertical-align:middle;margin-right:12px;"></div>`
        }
        <span style="font-size:14px;font-weight:600;color:${BRAND.textDark};vertical-align:middle;">${item.productName}</span>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;color:${BRAND.textLight};vertical-align:middle;">&times;${item.quantity}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:14px;font-weight:600;color:${BRAND.textDark};vertical-align:middle;">${formatCents(item.total)}</td>
    </tr>
  `).join('');

  const paymentLabel = order.paymentMethod === 'stripe' ? 'Card' :
    order.paymentMethod === 'cod' ? 'Cash on Delivery' :
    order.paymentMethod === 'test_bypass' ? 'Test' : order.paymentMethod;

  return brandedEmail({
    preheader: `Order ${order.orderCode} confirmed — ${formatCents(order.total)} total.`,
    headline: `Order confirmed, ${firstName}!`,
    body: `
      <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textLight};line-height:1.7;">
        We've received your order and it's being prepared now. Here's your summary.
      </p>

      <!-- Order meta strip -->
      <div style="background:${BRAND.cream};border:1px solid ${BRAND.border};border-radius:12px;padding:16px 20px;margin:0 0 24px;">
        <table style="width:100%;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;">
              <span style="font-size:10px;font-weight:700;color:${BRAND.textLight};text-transform:uppercase;letter-spacing:0.1em;">Order</span><br/>
              <span style="font-size:15px;font-weight:800;color:${BRAND.textDark};">${order.orderCode}</span>
            </td>
            <td style="padding:4px 0;">
              <span style="font-size:10px;font-weight:700;color:${BRAND.textLight};text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
              <span style="font-size:14px;font-weight:600;color:${BRAND.textDark};">${orderDate}</span>
            </td>
            <td style="padding:4px 0;">
              <span style="font-size:10px;font-weight:700;color:${BRAND.textLight};text-transform:uppercase;letter-spacing:0.1em;">${order.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery'}</span><br/>
              <span style="font-size:14px;font-weight:600;color:${BRAND.textDark};">${paymentLabel}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Items table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr>
            <th style="padding:8px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.textLight};font-weight:700;text-align:left;border-bottom:2px solid ${BRAND.border};">Item</th>
            <th style="padding:8px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.textLight};font-weight:700;text-align:center;border-bottom:2px solid ${BRAND.border};">Qty</th>
            <th style="padding:8px 0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.textLight};font-weight:700;text-align:right;border-bottom:2px solid ${BRAND.border};">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Totals -->
      <table style="width:240px;margin-left:auto;margin-bottom:24px;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;font-size:13px;color:${BRAND.textLight};">Subtotal</td><td style="padding:4px 0;font-size:13px;color:${BRAND.textDark};text-align:right;">${formatCents(order.subtotal)}</td></tr>
        ${order.deliveryFee > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:${BRAND.textLight};">Delivery</td><td style="padding:4px 0;font-size:13px;color:${BRAND.textDark};text-align:right;">${formatCents(order.deliveryFee)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;font-size:13px;color:${BRAND.textLight};">Tax</td><td style="padding:4px 0;font-size:13px;color:${BRAND.textDark};text-align:right;">${formatCents(order.tax)}</td></tr>
        <tr><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:${BRAND.textDark};border-top:2px solid ${BRAND.textDark};">Total</td><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:${BRAND.red};text-align:right;border-top:2px solid ${BRAND.textDark};">${formatCents(order.total)}</td></tr>
      </table>

      ${order.deliveryAddress ? `
      <div style="background:${BRAND.cream};border:1px solid ${BRAND.border};border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${BRAND.textLight};text-transform:uppercase;letter-spacing:0.1em;">Delivery Address</p>
        <p style="margin:0;font-size:14px;color:${BRAND.textDark};line-height:1.5;">${order.deliveryAddress}</p>
      </div>
      ` : ''}
    `,
    ctaLabel: 'Track Your Order',
    ctaUrl: `${siteUrl}/account/orders`,
  });
}

// ── Order status update ─────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Order Confirmed',
  processing: 'Being Prepared',
  ready: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  ready: '#06b6d4',
  out_for_delivery: '#f97316',
  delivered: BRAND.green,
  cancelled: '#ef4444',
};

export function orderStatusEmail(
  name: string,
  orderCode: string,
  newStatus: string,
  siteUrl: string,
): string {
  const firstName = name.split(' ')[0] || 'there';
  const statusLabel = STATUS_LABELS[newStatus] || newStatus.replace(/_/g, ' ');
  const statusColor = STATUS_COLORS[newStatus] || BRAND.red;

  const isGoodNews = !['cancelled'].includes(newStatus);

  return brandedEmail({
    preheader: `Your order ${orderCode} is now: ${statusLabel}`,
    headline: isGoodNews ? `Great news, ${firstName}!` : `Update on your order, ${firstName}`,
    body: `
      <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textLight};line-height:1.7;">
        Your order <strong style="color:${BRAND.textDark};">${orderCode}</strong> has been updated.
      </p>

      <div style="background:${BRAND.cream};border:1px solid ${BRAND.border};border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <div style="display:inline-block;background:${statusColor}15;border:2px solid ${statusColor}40;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;margin-bottom:12px;">
          <span style="font-size:24px;">${newStatus === 'delivered' ? '&#10003;' : newStatus === 'cancelled' ? '&#10007;' : '&#9679;'}</span>
        </div>
        <p style="margin:0;font-size:20px;font-weight:800;color:${statusColor};">${statusLabel}</p>
      </div>

      ${newStatus === 'delivered' ? `
      <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textLight};line-height:1.7;">
        Your order has been delivered! We hope you enjoy your fresh, premium meats.
        If you have any feedback, we'd love to hear from you.
      </p>
      ` : newStatus === 'out_for_delivery' ? `
      <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textLight};line-height:1.7;">
        Your order is on its way! Our delivery partner is bringing your fresh meats
        right to your doorstep. Please ensure someone is available to receive the package.
      </p>
      ` : newStatus === 'cancelled' ? `
      <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textLight};line-height:1.7;">
        We're sorry — your order has been cancelled. If you didn't request this or have
        questions, please contact us and we'll sort it out right away.
      </p>
      ` : ''}
    `,
    ctaLabel: 'View Order Details',
    ctaUrl: `${siteUrl}/account/orders`,
  });
}

// ── Newsletter welcome ──────────────────────────────────────────

export function newsletterWelcomeEmail(email: string, siteUrl: string): string {
  return brandedEmail({
    preheader: `You're in! Welcome to the Farm2Cook family.`,
    headline: `You're subscribed!`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:${BRAND.textLight};line-height:1.7;">
        Thank you for subscribing to the Farm2Cook newsletter. You'll be the first to know about:
      </p>
      <div style="background:${BRAND.cream};border:1px solid ${BRAND.border};border-radius:12px;padding:20px 24px;margin:0 0 20px;">
        <table style="width:100%;" cellpadding="0" cellspacing="0">
          ${['New seasonal cuts and limited-time products',
             'Exclusive subscriber-only discounts',
             'Halal meat recipes from our kitchen',
             'Store openings and delivery expansion'].map(t => `
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:24px;">
              <span style="color:${BRAND.red};font-size:14px;">&#9656;</span>
            </td>
            <td style="padding:6px 0;font-size:14px;color:${BRAND.textDark};line-height:1.5;">${t}</td>
          </tr>`).join('')}
        </table>
      </div>
    `,
    ctaLabel: 'Shop Now',
    ctaUrl: `${siteUrl}/shop`,
    footerExtra: `You're receiving this because ${email} subscribed to our newsletter. <a href="${siteUrl}" style="color:#ffffff60;text-decoration:underline;">Unsubscribe</a>`,
  });
}
