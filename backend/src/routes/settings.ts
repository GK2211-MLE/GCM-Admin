import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { updateSettingsSchema } from '../shared/index.js';

export async function settingsRoutes(app: FastifyInstance) {
  // Get tenant settings
  app.get('/', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });
    return { settings: tenant };
  });

  // Update tenant settings (managers and owners)
  app.put('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const data = updateSettingsSchema.parse(request.body);

    const [tenant] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    return { settings: tenant };
  });
}
