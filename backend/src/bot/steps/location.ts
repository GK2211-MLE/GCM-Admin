import type { ConversationState } from '../../shared/index.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { locations } from '../../db/schema.js';

export async function handleLocation(state: ConversationState, input: string): Promise<string> {
  const locs = await db
    .select()
    .from(locations)
    .where(eq(locations.tenantId, state.tenantId));

  if (locs.length === 0) {
    return 'No store locations are available right now. Please try again later.';
  }

  const index = parseInt(input, 10) - 1;

  if (isNaN(index) || index < 0 || index >= locs.length) {
    let text = 'Please select a location by number:\n\n';
    locs.forEach((loc, i) => {
      text += `${i + 1}. ${loc.name}\n   ${loc.address}\n`;
    });
    return text;
  }

  const selected = locs[index];
  state.locationId = selected.id;
  state.step = 'select_category';

  return `Great! You selected: ${selected.name}

Now pick a category:\n
1. Chicken
2. Mutton & Goat
3. Seafood
4. Farm Fresh Eggs
5. Ready to Cook
6. Marinades

Type the number to browse products.`;
}
