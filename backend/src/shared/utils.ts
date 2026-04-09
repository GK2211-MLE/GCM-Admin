import { ORDER_CODE_PREFIX, TAX_RATE } from './constants.js';

/** Generate a unique order code like F2C-A1B2C3 */
export function generateOrderCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${ORDER_CODE_PREFIX}-${code}`;
}

/** Format cents to dollar string */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Calculate tax from subtotal (in cents) */
export function calculateTax(subtotalCents: number, rate: number = TAX_RATE): number {
  return Math.round(subtotalCents * rate);
}

/** Calculate total = subtotal + tax */
export function calculateTotal(subtotalCents: number, rate: number = TAX_RATE): number {
  return subtotalCents + calculateTax(subtotalCents, rate);
}

/** Format a phone number for display */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

/** Format quantity with unit */
export function formatQty(qty: number, unit: string): string {
  if (unit === 'kg') {
    return qty >= 1 ? `${qty} kg` : `${qty * 1000} g`;
  }
  if (unit === 'dozen') {
    return qty === 1 ? '1 dozen' : `${qty} dozens`;
  }
  if (unit === 'piece' || unit === 'pc') {
    return qty === 1 ? '1 pc' : `${qty} pcs`;
  }
  return `${qty} ${unit}`;
}

/** Human-readable time ago */
export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
