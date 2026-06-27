/**
 * Good Crazy Meat — Premium branded email templates.
 *
 * Design language:
 *   - Dark red header (#8b1a1a → #cc2b2b gradient) with white logo text
 *   - Warm cream (#fdfaf5) card background
 *   - Green (#2d6a2e) for halal trust, checkmarks, positive states
 *   - Brand red (#cc2b2b) for CTAs, prices, urgency
 *   - Dark text (#1a1a1a) for headings, light (#6b7280) for body
 *   - Serif logo font (Georgia) to convey premium/tradition
 *
 * All templates are inline-styled for maximum email client compatibility.
 * Tested widths: 320px (mobile) to 600px (desktop).
 */

import { formatCents } from '../shared/index.js';

const B = {
  red: '#cc2b2b',
  darkRed: '#8b1a1a',
  green: '#2d6a2e',
  greenLight: '#f4f9f4',
  cream: '#fdfaf5',
  creamDark: '#f4ede0',
  white: '#ffffff',
  dark: '#1a1a1a',
  text: '#374151',
  muted: '#6b7280',
  border: '#e8e0d0',
  borderLight: '#f3f0e8',
};

const YEAR = new Date().getFullYear();

// ── Shared wrapper ──────────────────────────────────────────────

export function brandedEmail(opts: {
  preheader?: string;
  headline: string;
  heroEmoji?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerExtra?: string;
}): string {
  const { preheader, headline, heroEmoji, body, ctaLabel, ctaUrl, footerExtra } = opts;

  const cta = ctaLabel && ctaUrl
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;"><tr><td align="center" style="border-radius:10px;background:${B.red};">
        <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:15px 40px;font-size:13px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,sans-serif;">${ctaLabel}</a>
      </td></tr></table>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${headline}</title></head>
<body style="margin:0;padding:0;background:${B.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:${B.cream};">${preheader}${'&nbsp;'.repeat(80)}</div>` : ''}
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${B.cream};">
<tr><td align="center" style="padding:24px 16px;">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,${B.darkRed},${B.red});border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="text-align:center;">
        <span style="font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-family:Georgia,'Times New Roman',serif;">GOOD CRAZY MEAT</span>
        <br/><span style="font-size:10px;color:rgba(255,255,255,0.6);letter-spacing:0.2em;text-transform:uppercase;">Premium Beef · Halal Certified</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:${B.white};padding:40px 40px 32px;border-left:1px solid ${B.border};border-right:1px solid ${B.border};">
    ${heroEmoji ? `<div style="text-align:center;margin-bottom:20px;"><span style="font-size:48px;line-height:1;">${heroEmoji}</span></div>` : ''}
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:${B.dark};line-height:1.3;text-align:center;">${headline}</h1>
    ${body}
    ${cta}
  </td></tr>

  <!-- TRUST STRIP -->
  <tr><td style="background:${B.greenLight};border-left:1px solid ${B.border};border-right:1px solid ${B.border};padding:14px 40px;text-align:center;">
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
      <td style="padding:0 8px;font-size:11px;font-weight:700;color:${B.green};letter-spacing:0.06em;">&#10003; Halal Certified</td>
      <td style="padding:0 8px;font-size:11px;color:${B.green};opacity:0.4;">&#9679;</td>
      <td style="padding:0 8px;font-size:11px;font-weight:700;color:${B.green};letter-spacing:0.06em;">No Antibiotics</td>
      <td style="padding:0 8px;font-size:11px;color:${B.green};opacity:0.4;">&#9679;</td>
      <td style="padding:0 8px;font-size:11px;font-weight:700;color:${B.green};letter-spacing:0.06em;">Farm Fresh</td>
    </tr></table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:${B.dark};border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
    <span style="font-size:16px;font-weight:800;color:rgba(255,255,255,0.3);font-family:Georgia,serif;letter-spacing:-0.3px;">GOOD CRAZY MEAT</span>
    <p style="margin:10px 0 0;font-size:11px;color:rgba(255,255,255,0.35);">
      820 W Spring Creek Pkwy, Ste 302, Plano TX 75023<br/>
      &copy; ${YEAR} Good Crazy Meat. All rights reserved.
    </p>
    ${footerExtra ? `<p style="margin:10px 0 0;font-size:10px;color:rgba(255,255,255,0.25);">${footerExtra}</p>` : ''}
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Helpers ──────────────────────────────────────────────────────

function card(content: string): string {
  return `<div style="background:${B.cream};border:1px solid ${B.border};border-radius:12px;padding:20px 24px;margin:20px 0;">${content}</div>`;
}

function statBox(label: string, value: string, color = B.dark): string {
  return `<td style="text-align:center;padding:8px 4px;">
    <div style="font-size:20px;font-weight:800;color:${color};line-height:1.2;">${value}</div>
    <div style="font-size:9px;font-weight:700;color:${B.muted};text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">${label}</div>
  </td>`;
}

function divider(): string {
  return `<div style="height:1px;background:${B.borderLight};margin:24px 0;"></div>`;
}

// ── 1. WELCOME EMAIL ────────────────────────────────────────────

export function welcomeEmail(name: string, siteUrl: string): string {
  const first = name.split(' ')[0] || 'there';
  const features = [
    { icon: '&#127830;', title: 'Premium Cuts', desc: 'Hand-selected goat, chicken, lamb, beef, and seafood' },
    { icon: '&#128666;', title: 'Fast Delivery', desc: 'Farm to your doorstep in under 24 hours' },
    { icon: '&#9989;', title: 'Halal Certified', desc: 'Every product meets strict halal standards' },
    { icon: '&#10052;', title: 'Cold Chain', desc: 'Temperature-controlled from farm to fork' },
  ];

  const featureRows = features.map((f) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:40px;">
        <div style="width:36px;height:36px;border-radius:10px;background:${B.cream};text-align:center;line-height:36px;font-size:18px;">${f.icon}</div>
      </td>
      <td style="padding:10px 0 10px 14px;vertical-align:top;">
        <div style="font-size:14px;font-weight:700;color:${B.dark};">${f.title}</div>
        <div style="font-size:13px;color:${B.muted};line-height:1.5;margin-top:2px;">${f.desc}</div>
      </td>
    </tr>
  `).join('');

  return brandedEmail({
    preheader: `Welcome to Farm2Cook, ${first}! Premium halal meats delivered fresh.`,
    heroEmoji: '&#128075;',
    headline: `Welcome, ${first}!`,
    body: `
      <p style="margin:0 0 24px;font-size:15px;color:${B.text};line-height:1.7;text-align:center;">
        You're now part of the Farm2Cook family. We deliver premium,<br/>
        halal-certified fresh meats straight from our partner farms.
      </p>
      ${card(`<table cellpadding="0" cellspacing="0" border="0" width="100%">${featureRows}</table>`)}
      <p style="margin:20px 0 0;font-size:13px;color:${B.muted};line-height:1.6;text-align:center;">
        Browse our selection and place your first order — we think you'll taste the difference.
      </p>
    `,
    ctaLabel: 'Start Shopping',
    ctaUrl: `${siteUrl}/shop`,
  });
}

// ── 2. ORDER CONFIRMATION ───────────────────────────────────────

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
  const first = name.split(' ')[0] || 'there';
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const payLabel = order.paymentMethod === 'stripe' ? 'Card' :
    order.paymentMethod === 'cod' ? 'Cash on Delivery' :
    order.paymentMethod === 'test_bypass' ? 'Test' : order.paymentMethod;
  const isDelivery = order.deliveryMethod !== 'pickup';

  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${B.borderLight};vertical-align:middle;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:52px;vertical-align:middle;">
            ${item.imageUrl
              ? `<img src="${item.imageUrl}" alt="" width="48" height="48" style="width:48px;height:48px;border-radius:10px;object-fit:cover;display:block;" />`
              : `<div style="width:48px;height:48px;border-radius:10px;background:${B.creamDark};"></div>`
            }
          </td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="font-size:14px;font-weight:700;color:${B.dark};">${item.productName}</div>
            <div style="font-size:12px;color:${B.muted};margin-top:2px;">Qty: ${item.quantity} &times; ${formatCents(item.unitPrice)}</div>
          </td>
        </tr></table>
      </td>
      <td style="padding:14px 0;border-bottom:1px solid ${B.borderLight};text-align:right;vertical-align:middle;font-size:15px;font-weight:700;color:${B.dark};">${formatCents(item.total)}</td>
    </tr>
  `).join('');

  return brandedEmail({
    preheader: `Order ${order.orderCode} confirmed — ${formatCents(order.total)} total.`,
    heroEmoji: '&#127881;',
    headline: `Order confirmed, ${first}!`,
    body: `
      <p style="margin:0 0 24px;font-size:15px;color:${B.text};line-height:1.7;text-align:center;">
        Thank you for your order! We're getting your premium meats ready.
      </p>

      <!-- Order meta -->
      ${card(`
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          ${statBox('Order', order.orderCode, B.dark)}
          ${statBox('Date', orderDate.split(',')[0], B.dark)}
          ${statBox(isDelivery ? 'Delivery' : 'Pickup', payLabel, B.dark)}
          ${statBox('Total', formatCents(order.total), B.red)}
        </tr></table>
      `)}

      <!-- Items -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;">
        <tr>
          <td style="padding:8px 0;font-size:10px;font-weight:700;color:${B.muted};text-transform:uppercase;letter-spacing:0.1em;border-bottom:2px solid ${B.border};">Items</td>
          <td style="padding:8px 0;font-size:10px;font-weight:700;color:${B.muted};text-transform:uppercase;letter-spacing:0.1em;text-align:right;border-bottom:2px solid ${B.border};">Amount</td>
        </tr>
        ${itemRows}
      </table>

      <!-- Totals -->
      <table cellpadding="0" cellspacing="0" border="0" width="220" style="margin:0 0 0 auto;">
        <tr><td style="padding:4px 0;font-size:13px;color:${B.muted};">Subtotal</td><td style="padding:4px 0;font-size:13px;color:${B.dark};text-align:right;">${formatCents(order.subtotal)}</td></tr>
        ${order.deliveryFee > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:${B.muted};">Delivery</td><td style="padding:4px 0;font-size:13px;color:${B.dark};text-align:right;">${formatCents(order.deliveryFee)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;font-size:13px;color:${B.muted};">Tax</td><td style="padding:4px 0;font-size:13px;color:${B.dark};text-align:right;">${formatCents(order.tax)}</td></tr>
        <tr><td style="padding:12px 0 0;font-size:17px;font-weight:800;color:${B.dark};border-top:2px solid ${B.dark};">Total</td><td style="padding:12px 0 0;font-size:17px;font-weight:800;color:${B.red};text-align:right;border-top:2px solid ${B.dark};">${formatCents(order.total)}</td></tr>
      </table>

      ${order.deliveryAddress ? `
      ${divider()}
      <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="width:24px;vertical-align:top;padding-top:2px;font-size:16px;">&#128205;</td>
        <td style="padding-left:8px;">
          <div style="font-size:10px;font-weight:700;color:${B.muted};text-transform:uppercase;letter-spacing:0.1em;">Delivery Address</div>
          <div style="font-size:14px;color:${B.dark};line-height:1.5;margin-top:4px;">${order.deliveryAddress}</div>
        </td>
      </tr></table>
      ` : ''}
    `,
    ctaLabel: 'Track Your Order',
    ctaUrl: `${siteUrl}/account/orders`,
  });
}

// ── 3. ORDER STATUS UPDATE ──────────────────────────────────────

const STATUS_META: Record<string, { emoji: string; label: string; color: string; message: string }> = {
  confirmed:        { emoji: '&#9989;',    label: 'Order Confirmed',   color: '#3b82f6', message: 'We\'ve confirmed your order and our team is getting it ready.' },
  processing:       { emoji: '&#128296;',  label: 'Being Prepared',    color: '#8b5cf6', message: 'Our butchers are hand-selecting and preparing your premium cuts right now.' },
  ready:            { emoji: '&#128230;',  label: 'Ready for Pickup',  color: '#06b6d4', message: 'Your order is packed and ready! Visit our store to collect it.' },
  out_for_delivery: { emoji: '&#128666;',  label: 'Out for Delivery',  color: '#f97316', message: 'Your order is on its way! Our delivery partner is bringing your fresh meats to your doorstep.' },
  delivered:        { emoji: '&#127881;',  label: 'Delivered!',        color: B.green,   message: 'Your order has been delivered. We hope you enjoy your premium, halal-certified meats!' },
  cancelled:        { emoji: '&#10060;',   label: 'Cancelled',         color: '#ef4444', message: 'We\'re sorry — your order has been cancelled. If you didn\'t request this, please contact us.' },
};

export function orderStatusEmail(
  name: string,
  orderCode: string,
  newStatus: string,
  siteUrl: string,
): string {
  const first = name.split(' ')[0] || 'there';
  const meta = STATUS_META[newStatus] || { emoji: '&#128276;', label: newStatus.replace(/_/g, ' '), color: B.red, message: 'Your order status has been updated.' };
  const isPositive = newStatus !== 'cancelled';

  // Build a simple timeline showing progress
  const steps = ['confirmed', 'processing', 'out_for_delivery', 'delivered'];
  const currentIdx = steps.indexOf(newStatus);
  const timelineHtml = newStatus !== 'cancelled' ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
      <tr>
        ${steps.map((s, i) => {
          const done = i <= currentIdx;
          const label = s === 'confirmed' ? 'Confirmed' : s === 'processing' ? 'Preparing' : s === 'out_for_delivery' ? 'On the Way' : 'Delivered';
          return `<td style="text-align:center;width:25%;padding:0 2px;">
            <div style="width:28px;height:28px;border-radius:50%;margin:0 auto 6px;line-height:28px;font-size:12px;font-weight:800;color:${done ? '#fff' : B.muted};background:${done ? B.green : B.borderLight};">${done ? '&#10003;' : i + 1}</div>
            <div style="font-size:9px;font-weight:700;color:${done ? B.green : B.muted};text-transform:uppercase;letter-spacing:0.06em;">${label}</div>
          </td>`;
        }).join('')}
      </tr>
    </table>
  ` : '';

  return brandedEmail({
    preheader: `Your order ${orderCode} — ${meta.label}`,
    heroEmoji: meta.emoji,
    headline: isPositive ? `Great news, ${first}!` : `Update on your order, ${first}`,
    body: `
      <p style="margin:0 0 8px;font-size:15px;color:${B.text};line-height:1.7;text-align:center;">
        Your order <strong style="color:${B.dark};font-weight:800;">${orderCode}</strong>
      </p>

      <!-- Status badge -->
      <div style="text-align:center;margin:16px 0;">
        <span style="display:inline-block;background:${meta.color}12;border:2px solid ${meta.color}30;border-radius:12px;padding:12px 28px;">
          <span style="font-size:18px;font-weight:800;color:${meta.color};">${meta.label}</span>
        </span>
      </div>

      ${timelineHtml}

      <p style="margin:0 0 8px;font-size:14px;color:${B.text};line-height:1.7;text-align:center;">
        ${meta.message}
      </p>

      ${newStatus === 'delivered' ? `
      ${divider()}
      <p style="margin:0;font-size:14px;color:${B.text};line-height:1.7;text-align:center;">
        <strong style="color:${B.dark};">Loved your order?</strong> Leave a review or reorder your favourites with just a few taps.
      </p>
      ` : ''}
    `,
    ctaLabel: newStatus === 'delivered' ? 'Reorder Now' : 'View Order Details',
    ctaUrl: `${siteUrl}/account/orders`,
  });
}

// ── 4. NEWSLETTER WELCOME ───────────────────────────────────────

export function newsletterWelcomeEmail(email: string, siteUrl: string): string {
  const perks = [
    { icon: '&#127873;', text: 'Exclusive subscriber-only discounts and early access to sales' },
    { icon: '&#127860;', text: 'Halal meat recipes from our kitchen — seasonal favourites and weeknight staples' },
    { icon: '&#128205;', text: 'New store openings and delivery expansion announcements' },
    { icon: '&#11088;', text: 'First look at new premium cuts and limited-edition products' },
  ];

  const perkRows = perks.map((p) => `
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:32px;font-size:18px;line-height:1;">${p.icon}</td>
      <td style="padding:8px 0 8px 12px;font-size:14px;color:${B.dark};line-height:1.6;">${p.text}</td>
    </tr>
  `).join('');

  return brandedEmail({
    preheader: `You're in! Welcome to the Farm2Cook family.`,
    heroEmoji: '&#128140;',
    headline: `You're subscribed!`,
    body: `
      <p style="margin:0 0 24px;font-size:15px;color:${B.text};line-height:1.7;text-align:center;">
        Thank you for joining our newsletter. Here's what you'll get:
      </p>
      ${card(`<table cellpadding="0" cellspacing="0" border="0" width="100%">${perkRows}</table>`)}
      <p style="margin:20px 0 0;font-size:13px;color:${B.muted};line-height:1.6;text-align:center;">
        We only send the good stuff — no spam, ever.
      </p>
    `,
    ctaLabel: 'Shop Now',
    ctaUrl: `${siteUrl}/shop`,
    footerExtra: `You're receiving this because ${email} subscribed. <a href="${siteUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Unsubscribe</a>`,
  });
}
