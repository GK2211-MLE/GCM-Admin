import type { ConversationState } from '../../shared/index.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { orders } from '../../db/schema.js';

export async function handleRating(state: ConversationState, input: string): Promise<string> {
  if (input === 'skip' || input === 's') {
    state.step = 'done';
    return 'No problem! Thank you for ordering with Farm2Cook. Type "hi" to start a new order.';
  }

  const rating = parseInt(input, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return 'Please rate 1-5 stars, or type "skip":';
  }

  if (state.orderId) {
    await db
      .update(orders)
      .set({ rating, updatedAt: new Date() })
      .where(eq(orders.id, state.orderId));
  }

  state.step = 'done';

  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  return `Thank you for your ${stars} rating!

We appreciate your feedback. Type "hi" to start a new order.`;
}
