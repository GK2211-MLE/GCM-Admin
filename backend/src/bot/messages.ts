import type { CartItem } from '../shared/index.js';
import { formatCents } from '../shared/index.js';

export function formatCart(cart: CartItem[]): string {
  if (cart.length === 0) return 'Your cart is empty.';

  let text = 'Your Cart:\n';
  let subtotal = 0;

  cart.forEach((item, i) => {
    const itemTotal = item.unitPrice * item.quantity;
    subtotal += itemTotal;
    text += `${i + 1}. ${item.name} x${item.quantity} - ${formatCents(itemTotal)}\n`;
  });

  text += `\nSubtotal: ${formatCents(subtotal)}`;
  return text;
}

export function formatOrderSummary(
  cart: CartItem[],
  deliveryMethod: string,
  deliveryAddress?: string,
  customerName?: string,
): string {
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  let text = 'Order Summary:\n';
  text += `Name: ${customerName ?? 'N/A'}\n`;
  text += `Delivery: ${deliveryMethod === 'delivery' ? 'Home Delivery' : 'Store Pickup'}\n`;
  if (deliveryAddress) text += `Address: ${deliveryAddress}\n`;
  text += '\nItems:\n';

  cart.forEach((item, i) => {
    text += `  ${i + 1}. ${item.name} x${item.quantity} - ${formatCents(item.unitPrice * item.quantity)}\n`;
  });

  text += `\nSubtotal: ${formatCents(subtotal)}`;
  text += `\nTax (5%): ${formatCents(tax)}`;
  text += `\nTotal: ${formatCents(total)}`;

  return text;
}
