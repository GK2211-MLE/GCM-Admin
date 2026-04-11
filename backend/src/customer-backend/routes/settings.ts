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

    // Defaults must match checkout.ts so the frontend, backend checkout, and Stripe
    // all see the same numbers. deliveryFee + freeDeliveryThreshold returned in DOLLARS
    // because that's what the frontend constants file uses (TAX_RATE is decimal,
    // DEFAULT_DELIVERY_FEE is dollars). taxRate is decimal (e.g. 0.085 for 8.5%).
    return {
      taxRate: tenant.taxRate,
      deliveryFee: (settings.deliveryFee as number | undefined) ?? 5.99,
      freeDeliveryThreshold: (settings.freeDeliveryThreshold as number | undefined) ?? 75,
    };
  });
}
