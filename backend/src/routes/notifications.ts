import type { FastifyInstance } from 'fastify';
import { eq, and, desc, count, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { authGuard, getLocationScope } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications — list all + unread count
  // Per-location scoping: a store_manager/staff sees notifications that are
  // (a) tagged with their location OR (b) untagged (global, e.g. inventory
  // alerts that apply to everyone). Admin sees everything.
  app.get('/', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;

    const baseCond = scope
      ? and(
          eq(notifications.tenantId, tenantId),
          or(eq(notifications.locationId, scope), isNull(notifications.locationId))!,
        )!
      : eq(notifications.tenantId, tenantId);

    const unreadCond = scope
      ? and(
          eq(notifications.tenantId, tenantId),
          or(eq(notifications.locationId, scope), isNull(notifications.locationId))!,
          eq(notifications.isRead, false),
        )!
      : and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false))!;

    const [rows, [{ unread }]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(baseCond)
        .orderBy(desc(notifications.createdAt))
        .limit(50),
      db.select({ unread: count() }).from(notifications).where(unreadCond),
    ]);

    return { notifications: rows, unreadCount: Number(unread) };
  });

  // PUT /notifications — mark single or all as read
  app.put('/', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const body = request.body as { id?: string; markAll?: boolean };

    if (body.markAll) {
      const cond = scope
        ? and(
            eq(notifications.tenantId, tenantId),
            or(eq(notifications.locationId, scope), isNull(notifications.locationId))!,
            eq(notifications.isRead, false),
          )!
        : and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false))!;
      await db.update(notifications).set({ isRead: true }).where(cond);
    } else if (body.id) {
      // Allow updating an individual notification only if it falls in scope.
      const cond = scope
        ? and(
            eq(notifications.id, body.id),
            eq(notifications.tenantId, tenantId),
            or(eq(notifications.locationId, scope), isNull(notifications.locationId))!,
          )!
        : and(eq(notifications.id, body.id), eq(notifications.tenantId, tenantId))!;
      await db.update(notifications).set({ isRead: true }).where(cond);
    }

    return { success: true };
  });

  // DELETE /notifications/read — clear all read notifications
  app.delete('/read', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;

    const cond = scope
      ? and(
          eq(notifications.tenantId, tenantId),
          or(eq(notifications.locationId, scope), isNull(notifications.locationId))!,
          eq(notifications.isRead, true),
        )!
      : and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, true))!;
    await db.delete(notifications).where(cond);
    return { success: true };
  });
}
