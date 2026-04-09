import type { ConversationState } from '../../shared/index.js';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { products } from '../../db/schema.js';
import { formatCents, CATEGORIES } from '../../shared/index.js';

const PAGE_SIZE = 5;

export async function handleBrowse(state: ConversationState, input: string): Promise<string> {
  if (!state.category) {
    state.step = 'select_category';
    return 'Please select a category first.';
  }

  // Navigation commands
  if (input === 'back' || input === 'b') {
    state.step = 'select_category';
    state.category = undefined;
    const { handleCategory } = await import('./category.js');
    return handleCategory(state, 'show');
  }

  if (input === 'cart' || input === 'c') {
    if (state.cart.length === 0) return 'Your cart is empty. Select a product first!';
    state.step = 'view_cart';
    const { showCart } = await import('./cart.js');
    return showCart(state, 'view');
  }

  if (input === 'next' || input === 'n') {
    state.browsePage = (state.browsePage ?? 0) + 1;
  } else if (input === 'prev' || input === 'p') {
    state.browsePage = Math.max(0, (state.browsePage ?? 0) - 1);
  }

  const allProducts = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, state.tenantId),
        eq(products.category, state.category),
        eq(products.active, true),
        eq(products.inStock, true),
      ),
    )
    .orderBy(asc(products.sortOrder));

  if (allProducts.length === 0) {
    state.step = 'select_category';
    return 'No products available in this category. Pick another category.';
  }

  const page = state.browsePage ?? 0;
  const start = page * PAGE_SIZE;
  const pageProducts = allProducts.slice(start, start + PAGE_SIZE);

  // If user selected a product number
  const productIndex = parseInt(input, 10);
  if (!isNaN(productIndex) && productIndex >= 1 && productIndex <= pageProducts.length && input !== 'show') {
    const selected = pageProducts[productIndex - 1];
    state.selectedProductId = selected.id;
    state.step = 'select_quantity';

    return `${selected.name} - ${formatCents(selected.pricePerUnit)}/${selected.unit}
${selected.description}

How many would you like? Type a number (e.g., 1, 2, 0.5):`;
  }

  // Show products list
  const catInfo = CATEGORIES[state.category as keyof typeof CATEGORIES];
  let text = `${catInfo?.icon ?? ''} ${catInfo?.label ?? state.category}\n\n`;

  pageProducts.forEach((p, i) => {
    text += `${i + 1}. ${p.name} - ${formatCents(p.pricePerUnit)}/${p.unit}\n`;
  });

  text += '\n';
  if (start + PAGE_SIZE < allProducts.length) text += 'Type "next" for more | ';
  if (page > 0) text += 'Type "prev" to go back | ';
  text += 'Type "back" for categories | Type "cart" to view cart';

  return text;
}
