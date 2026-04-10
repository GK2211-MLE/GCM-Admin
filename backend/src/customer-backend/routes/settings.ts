import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema.js';

export async function settingsRoutes(app: FastifyInstance) {
  // Get public checkout settings (no auth required)
  app.get('/', async (_request, reply) => {
    const [tenant] = await db
      .select({
        taxRate: tenants.taxRate,
        settings: tenants.settings,
      })
      .from(tenants)
      .limit(1);

    if (!tenant) return reply.code(500).send({ error: 'Store not configured' });

    const settings = (tenant.settings ?? {}) as Record<string, unknown>;

    return {
      taxRate: tenant.taxRate,
      deliveryFee: settings.deliveryFee ?? 0,
      freeDeliveryThreshold: settings.freeDeliveryThreshold ?? 0,
    };
  });
}
