import type { ConversationState } from '../../shared/index.js';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema.js';

export async function handleWelcome(state: ConversationState, phone: string): Promise<string> {
  // Get the first tenant (single-tenant for now)
  const [tenant] = await db.select().from(tenants).limit(1);

  if (!tenant) {
    return 'Sorry, our store is not set up yet. Please try again later.';
  }

  state.tenantId = tenant.id;
  state.step = 'select_location';

  return `Welcome to Farm2Cook! Fresh meat & seafood delivered to your door.

Please select a store location to continue. Type the number:

(We'll show you available locations next)

Type "1" for our locations list.`;
}
