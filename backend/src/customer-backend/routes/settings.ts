import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema.js';

export async function settingsRoutes(app: FastifyInstance) {
  // Get public checkout settings (no auth required).
  //
  // The admin saves delivery/tax/pickup settings to the `config` JSONB
  // column (via PUT /api/settings). The values in config are stored in
  // CENTS for monetary amounts (defaultDeliveryFee, freeDeliveryThreshold,
  // minOrderAmount). We convert to DOLLARS here for the customer frontend.
  app.get('/', async (_request, reply) => {
    const [tenant] = await db
      .select({
        taxRate: tenants.taxRate,
        config: tenants.config,
        settings: tenants.settings,
      })
      .from(tenants)
      .limit(1);

    if (!tenant) return reply.code(500).send({ error: 'Store not configured' });

    // Read from config (where admin writes) with fallback to settings (legacy)
    const cfg = (tenant.config ?? {}) as Record<string, unknown>;
    const legacy = (tenant.settings ?? {}) as Record<string, unknown>;

    const deliveryFeeCents = (cfg.defaultDeliveryFee as number | undefined)
      ?? (legacy.deliveryFee as number | undefined);
    const thresholdCents = (cfg.freeDeliveryThreshold as number | undefined)
      ?? (legacy.freeDeliveryThreshold as number | undefined);
    const minOrderCents = (cfg.minOrderAmount as number | undefined) ?? 0;

    return {
      taxRate: tenant.taxRate,
      // Convert cents → dollars for the frontend
      deliveryFee: deliveryFeeCents ? deliveryFeeCents / 100 : 5.99,
      freeDeliveryThreshold: thresholdCents ? thresholdCents / 100 : 75,
      minOrderAmount: minOrderCents / 100,
      // Fulfillment toggles
      pickupEnabled: (cfg.pickupEnabled as boolean | undefined) ?? true,
      deliveryEnabled: (cfg.deliveryEnabled as boolean | undefined) ?? true,
    };
  });
}
