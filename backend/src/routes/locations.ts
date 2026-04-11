import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { locations } from '../db/schema.js';
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

  // Delete location (soft-delete: deactivate, since orders may reference it). Admin only.
  app.delete('/:id', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [location] = await db
      .update(locations)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
      .returning();

    if (!location) return reply.code(404).send({ error: 'Location not found' });
    return { success: true };
  });
}
