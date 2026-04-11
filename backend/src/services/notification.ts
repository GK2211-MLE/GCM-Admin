import { db } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { broadcastSSE } from '../routes/sse.js';

/**
 * Create an in-app notification for a tenant.
 *
 * `locationId` ties the notification to a specific store. When set, only
 * users assigned to that store (and admins) will see it. Pass null/undefined
 * for tenant-wide / global notifications.
 */
export async function createNotification(
  tenantId: string,
  type: 'order' | 'payment' | 'inventory',
  title: string,
  message: string,
  link?: string,
  locationId?: string | null,
): Promise<void> {
  const [notif] = await db
    .insert(notifications)
    .values({ tenantId, type, title, message, link, locationId: locationId ?? null })
    .returning();

  // Real-time push via SSE so the badge updates instantly. SSE consumers
  // (admin frontend) filter by location client-side using the locationId
  // field on the payload.
  broadcastSSE(tenantId, { type: 'notification:new', data: notif });
}
