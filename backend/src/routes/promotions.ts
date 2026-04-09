import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { promotions } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createPromotionSchema, updatePromotionSchema } from '../shared/index.js';

export async function promotionRoutes(app: FastifyInstance) {
  // List promotions
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const rows = await db.select().from(promotions).where(eq(promotions.tenantId, tenantId));
    return { promotions: rows };
  });

  // Get single promotion
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [promo] = await db
      .select()
      .from(promotions)
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)))
      .limit(1);

    if (!promo) return reply.code(404).send({ error: 'Promotion not found' });
    return { promotion: promo };
  });

  // Create promotion
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const data = createPromotionSchema.parse(request.body);

    const [promo] = await db
      .insert(promotions)
      .values({
        ...data,
        tenantId,
        startsAt: new Date(data.startsAt),
        expiresAt: new Date(data.expiresAt),
      })
      .returning();

    return { promotion: promo };
  });

  // Update promotion
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updatePromotionSchema.parse(request.body);

    const updateData: Record<string, unknown> = { ...data };
    if (data.startsAt) updateData.startsAt = new Date(data.startsAt);
    if (data.expiresAt) updateData.expiresAt = new Date(data.expiresAt);

    const [promo] = await db
      .update(promotions)
      .set(updateData)
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)))
      .returning();

    if (!promo) return reply.code(404).send({ error: 'Promotion not found' });
    return { promotion: promo };
  });

  // Delete promotion
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [promo] = await db
      .delete(promotions)
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)))
      .returning();

    if (!promo) return reply.code(404).send({ error: 'Promotion not found' });
    return { success: true };
  });
}
