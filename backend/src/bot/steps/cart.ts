import type { ConversationState } from '../../shared/index.js';
import { formatCart } from '../messages.js';

export async function showCart(state: ConversationState, input: string): Promise<string> {
  if (state.cart.length === 0) {
    state.step = 'select_category';
    return 'Your cart is empty! Let\'s add some items. Pick a category:';
  }

  // Handle cart commands
  if (input === 'clear') {
    state.cart = [];
    state.step = 'select_category';
    return 'Cart cleared! Pick a category to start fresh:';
  }

  // Remove item by number
  if (input.startsWith('remove ') || input.startsWith('r ')) {
    const num = parseInt(input.split(' ')[1], 10);
    if (!isNaN(num) && num >= 1 && num <= state.cart.length) {
      const removed = state.cart.splice(num - 1, 1)[0];
      if (state.cart.length === 0) {
        state.step = 'select_category';
        return `Removed ${removed.name}. Cart is now empty. Pick a category:`;
      }
      return `Removed ${removed.name}.\n\n${formatCart(state.cart)}\n\nType "checkout" to proceed or "add" to keep shopping.`;
    }
    return 'Invalid item number. Type "remove 1" to remove the first item.';
  }

  if (input === 'checkout' || input === 'co') {
    state.step = 'checkout_name';
    return 'Great! Let\'s checkout.\n\nWhat name should we put on the order?';
  }

  if (input === 'add' || input === 'continue' || input === 'back') {
    state.step = 'select_category';
    const { handleCategory } = await import('./category.js');
    return handleCategory(state, 'show');
  }

  // Default: show cart
  let text = formatCart(state.cart);
  text += '\n\nOptions:\n';
  text += '- Type "checkout" to place order\n';
  text += '- Type "add" to keep shopping\n';
  text += '- Type "remove [number]" to remove an item\n';
  text += '- Type "clear" to empty cart';

  return text;
}
