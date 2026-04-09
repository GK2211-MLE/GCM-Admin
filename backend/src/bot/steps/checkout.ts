import type { ConversationState } from '../../shared/index.js';
import { formatOrderSummary } from '../messages.js';

export async function handleCheckout(state: ConversationState, input: string): Promise<string> {
  switch (state.step) {
    case 'checkout_name': {
      if (input.length < 2) {
        return 'Please enter your name (at least 2 characters):';
      }
      state.customerName = input.charAt(0).toUpperCase() + input.slice(1);
      state.step = 'checkout_delivery';
      return `Thanks, ${state.customerName}!

How would you like to get your order?
1. Store Pickup
2. Home Delivery

Type 1 or 2:`;
    }

    case 'checkout_delivery': {
      if (input === '1' || input === 'pickup') {
        state.deliveryMethod = 'pickup';
        state.step = 'checkout_confirm';
        return formatOrderSummary(state.cart, 'pickup', undefined, state.customerName) +
          '\n\nType "confirm" to place order or "back" to edit cart.';
      }
      if (input === '2' || input === 'delivery') {
        state.deliveryMethod = 'delivery';
        state.step = 'checkout_address';
        return 'Please enter your delivery address:';
      }
      return 'Please type 1 for Store Pickup or 2 for Home Delivery:';
    }

    case 'checkout_address': {
      if (input.length < 5) {
        return 'Please enter a valid delivery address (at least 5 characters):';
      }
      state.deliveryAddress = input;
      state.step = 'checkout_confirm';
      return formatOrderSummary(state.cart, 'delivery', state.deliveryAddress, state.customerName) +
        '\n\nType "confirm" to place order or "back" to edit cart.';
    }

    case 'checkout_confirm': {
      if (input === 'back' || input === 'edit') {
        state.step = 'view_cart';
        const { showCart } = await import('./cart.js');
        return showCart(state, 'view');
      }
      if (input === 'confirm' || input === 'yes' || input === 'y') {
        state.step = 'select_payment';
        return `How would you like to pay?

1. Cash on Delivery
2. Pay at Store
3. Pay on Next Delivery

Type the number:`;
      }
      return 'Type "confirm" to place your order or "back" to edit your cart.';
    }

    default:
      return 'Something went wrong. Type "reset" to start over.';
  }
}
