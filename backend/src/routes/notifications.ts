import type { FastifyInstance } from 'fastify';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications — list all + unread count
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);

    const [rows, [{ unread }]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(eq(notifications.tenantId, tenantId))
        .orderBy(desc(notifications.createdAt))
        .limit(50),
      db
        .select({ unread: count() })
        .from(notifications)
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false))),
    ]);

    return { notifications: rows, unreadCount: Number(unread) };
  });

  // PUT /notifications — mark single or all as read
  app.put('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const body = request.body as { id?: string; markAll?: boolean };

    if (body.markAll) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));
    } else if (body.id) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, body.id), eq(notifications.tenantId, tenantId)));
    }

    return { success: true };
  });

  // DELETE /notifications/read — clear all read notifications
  app.delete('/read', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    await db
      .delete(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, true)));
    return { success: true };
  });
}
