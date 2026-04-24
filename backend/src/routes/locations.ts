import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  locations,
  orders,
  products,
  notifications,
  adminUsers,
} from '../db/schema.js';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createLocationSchema, updateLocationSchema } from '../shared/index.js';

export async function locationRoutes(app: FastifyInstance) {
  // List all locations including inactive (auth required)
  app.get('/all', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const rows = await db
      .select()
      .from(locations)
      .where(eq(locations.tenantId, tenantId));
    return { locations: rows };
  });

  // Toggle location active status — admin only.
  app.patch('/:id/toggle', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: 'Location not found' });

    const [location] = await db
      .update(locations)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();

    return { location };
  });

  // List active locations (public for bot/app)
  app.get('/', async (request) => {
    const query = request.query as { tenantId?: string };
    const rows = query.tenantId
      ? await db.select().from(locations).where(and(eq(locations.tenantId, query.tenantId), eq(locations.active, true)))
      : await db.select().from(locations).where(eq(locations.active, true));
    return { locations: rows };
  });

  // Get single location
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [location] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
    if (!location) return reply.code(404).send({ error: 'Location not found' });
    return { location };
  });

  // Create location — admin only.
  app.post('/', { preHandler: [adminGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const data = createLocationSchema.parse(request.body);

    const [location] = await db
      .insert(locations)
      .values({ ...data, tenantId })
      .returning();

    return { location };
  });

  // Update location — admin only.
  app.put('/:id', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updateLocationSchema.parse(request.body);

    const [location] = await db
      .update(locations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
      .returning();

    if (!location) return reply.code(404).send({ error: 'Location not found' });
    return { location };
  });

  // Delete location.
  //
  // First attempt a real hard delete. If that fails because an order or
  // other row references the location (FK constraint), fall back to a
  // soft delete (active=false). The response says which path was taken
  // so the admin can show an accurate toast — previously this endpoint
  // always soft-deleted and the admin list (which reads /locations/all)
  // kept showing the row, so delete "didn't work" from the user's seat.
  app.delete('/:id', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    // Verify the row exists in this tenant first
    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: 'Location not found' });

    try {
      await db
        .delete(locations)
        .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)));
      return { success: true, hardDeleted: true };
    } catch (err) {
      // Most likely a foreign-key violation because orders / inventory /
      // etc. reference this location. Fall back to soft delete so the
      // store disappears from customer-facing queries but historical
      // orders still resolve their location.
      const [soft] = await db
        .update(locations)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
        .returning();
      if (!soft) return reply.code(404).send({ error: 'Location not found' });
      return {
        success: true,
        hardDeleted: false,
        reason: 'archived (referenced by existing orders)',
      };
    }
  });

  // Merge one location into another, then hard-delete the source.
  //
  // Admin-only. Used to clean up legacy "Plano", "Irving", etc. rows
  // that were left behind after rebranding to FARM2COOK PLANO /
  // FARM2COOK IRVING etc. Historical orders pointing at the legacy row
  // are re-parented onto the target, along with products, notifications,
  // and any admin_users.assigned_location_id pointing there. Only then
  // does the source row get dropped, so no FK violation, no orphans.
  //
  // product_locations and store_inventory for the source CASCADE-DROP
  // when the source row is deleted — those are location-specific tags /
  // stock counts, and the equivalents for the target already exist.
  app.post(
    '/:id/merge-into/:targetId',
    { preHandler: [adminGuard] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id, targetId } = request.params as { id: string; targetId: string };

      if (id === targetId) {
        return reply.code(400).send({ error: 'Source and target must be different' });
      }

      // Both locations must exist in this tenant
      const [source] = await db
        .select()
        .from(locations)
        .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
        .limit(1);
      const [target] = await db
        .select()
        .from(locations)
        .where(and(eq(locations.id, targetId), eq(locations.tenantId, tenantId)))
        .limit(1);

      if (!source) return reply.code(404).send({ error: 'Source location not found' });
      if (!target) return reply.code(404).send({ error: 'Target location not found' });

      // Repoint every non-cascaded FK onto the target, then drop the source.
      // Drizzle's PG client doesn't expose a transaction wrapper here, so
      // we run these sequentially — worst case on a mid-way failure is a
      // partial merge that can be re-run; the endpoint is idempotent.
      const updatedOrders = await db
        .update(orders)
        .set({ locationId: targetId, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.locationId, id)))
        .returning({ id: orders.id });

      const updatedProducts = await db
        .update(products)
        .set({ locationId: targetId, updatedAt: new Date() })
        .where(and(eq(products.tenantId, tenantId), eq(products.locationId, id)))
        .returning({ id: products.id });

      const updatedNotifications = await db
        .update(notifications)
        .set({ locationId: targetId })
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.locationId, id)))
        .returning({ id: notifications.id });

      const updatedAdminUsers = await db
        .update(adminUsers)
        .set({ assignedLocationId: targetId, updatedAt: new Date() })
        .where(and(
          eq(adminUsers.tenantId, tenantId),
          eq(adminUsers.assignedLocationId, id),
        ))
        .returning({ id: adminUsers.id });

      // Source row is now unreferenced by non-cascade tables. Drop it
      // (product_locations and store_inventory for the source cascade-drop).
      try {
        await db
          .delete(locations)
          .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)));
      } catch (err) {
        app.log.error({ err, id, targetId }, '[locations/merge] source delete failed');
        return reply.code(500).send({
          error: 'Merged references but could not delete source row',
          moved: {
            orders: updatedOrders.length,
            products: updatedProducts.length,
            notifications: updatedNotifications.length,
            adminUsers: updatedAdminUsers.length,
          },
        });
      }

      return {
        success: true,
        source: { id: source.id, name: source.name },
        target: { id: target.id, name: target.name },
        moved: {
          orders: updatedOrders.length,
          products: updatedProducts.length,
          notifications: updatedNotifications.length,
          adminUsers: updatedAdminUsers.length,
        },
      };
    },
  );
}
