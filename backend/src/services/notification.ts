import { db } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { broadcastSSE } from '../routes/sse.js';

export async function createNotification(
  tenantId: string,
  type: 'order' | 'payment' | 'inventory',
  title: string,
  message: string,
  link?: string,
): Promise<void> {
  const [notif] = await db
    .insert(notifications)
    .values({ tenantId, type, title, message, link })
    .returning();

  // Real-time push via SSE so the badge updates instantly
  broadcastSSE(tenantId, { type: 'notification:new', data: notif });
}
