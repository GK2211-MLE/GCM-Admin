import type { ConversationState } from '../../shared/index.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { products } from '../../db/schema.js';
import { formatCents } from '../../shared/index.js';

export async function handleQuantity(state: ConversationState, input: string): Promise<string> {
  if (!state.selectedProductId) {
    state.step = 'browse_products';
    return 'Please select a product first.';
  }

  if (input === 'back' || input === 'b') {
    state.step = 'browse_products';
    state.selectedProductId = undefined;
    const { handleBrowse } = await import('./browse.js');
    return handleBrowse(state, 'show');
  }

  const qty = parseFloat(input);
  if (isNaN(qty) || qty <= 0 || qty > 50) {
    return 'Please enter a valid quantity (e.g., 1, 2, 0.5). Max 50. Type "back" to go back.';
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, state.selectedProductId))
    .limit(1);

  if (!product) {
    state.step = 'browse_products';
    return 'Product not found. Please select again.';
  }

  // Check if already in cart - update quantity
  const existingIndex = state.cart.findIndex((item) => item.productId === product.id);
  if (existingIndex >= 0) {
    state.cart[existingIndex].quantity += qty;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      unitPrice: product.pricePerUnit,
      unit: product.unit,
    });
  }

  state.selectedProductId = undefined;
  state.step = 'browse_products';

  const itemTotal = product.pricePerUnit * qty;

  return `Added ${qty} ${product.unit} of ${product.name} (${formatCents(itemTotal)}) to your cart!

Cart: ${state.cart.length} item(s)

Continue browsing or type "cart" to checkout.`;
}
