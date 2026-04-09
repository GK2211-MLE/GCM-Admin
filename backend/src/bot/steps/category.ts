import type { ConversationState } from '../../shared/index.js';
import { CATEGORIES } from '../../shared/index.js';

const categoryKeys = Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>;

export async function handleCategory(state: ConversationState, input: string): Promise<string> {
  // Check for cart shortcut
  if (input === 'cart' || input === 'c') {
    if (state.cart.length === 0) return 'Your cart is empty. Pick a category first!';
    state.step = 'view_cart';
    const { showCart } = await import('./cart.js');
    return showCart(state, 'view');
  }

  const index = parseInt(input, 10) - 1;

  if (isNaN(index) || index < 0 || index >= categoryKeys.length) {
    let text = 'Pick a category:\n\n';
    categoryKeys.forEach((key, i) => {
      const cat = CATEGORIES[key];
      text += `${i + 1}. ${cat.icon} ${cat.label}\n`;
    });
    text += '\nType "cart" to view your cart.';
    return text;
  }

  state.category = categoryKeys[index];
  state.browsePage = 0;
  state.step = 'browse_products';

  const { handleBrowse } = await import('./browse.js');
  return handleBrowse(state, 'show');
}
