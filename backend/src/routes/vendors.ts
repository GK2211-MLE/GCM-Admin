import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vendors } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function vendorRoutes(app: FastifyInstance) {
  // List vendors
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const rows = await db.select().from(vendors).where(eq(vendors.tenantId, tenantId));
    return { vendors: rows };
  });

  // Get single vendor
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId)))
      .limit(1);

    if (!vendor) return reply.code(404).send({ error: 'Vendor not found' });
    return { vendor };
  });

  // Create vendor
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { name, contact, phone, email, address } = request.body as {
      name: string;
      contact: string;
      phone: string;
      email?: string;
      address?: string;
    };

    const [vendor] = await db
      .insert(vendors)
      .values({ tenantId, name, contact, phone, email: email ?? null, address: address ?? null })
      .returning();

    return { vendor };
  });

  // Update vendor
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = request.body as Record<string, unknown>;

    const [vendor] = await db
      .update(vendors)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId)))
      .returning();

    if (!vendor) return reply.code(404).send({ error: 'Vendor not found' });
    return { vendor };
  });

  // Delete vendor
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [vendor] = await db
      .delete(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId)))
      .returning();

    if (!vendor) return reply.code(404).send({ error: 'Vendor not found' });
    return { success: true };
  });
}
