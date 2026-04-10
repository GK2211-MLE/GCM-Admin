import type { FastifyInstance } from 'fastify';
import { eq, and, gte, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { promotions, tenants } from '../../db/schema.js';
import { couponValidateSchema } from '../validation/schemas.js';

export async function couponRoutes(app: FastifyInstance) {
  // List active promotions (PUBLIC)
  app.get('/available', async () => {
    // Get tenant for filtering
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenant) return { promotions: [] };

    const now = new Date();

    const rows = await db
      .select({
        id: promotions.id,
        code: promotions.code,
        description: promotions.description,
        discountType: promotions.discountType,
        discountValue: promotions.discountValue,
        minOrder: promotions.minOrder,
        startsAt: promotions.startsAt,
        expiresAt: promotions.expiresAt,
      })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenant.id),
          eq(promotions.active, true),
          lte(promotions.startsAt, now),
          gte(promotions.expiresAt, now),
          sql`(${promotions.maxUses} = 0 OR ${promotions.usedCount} < ${promotions.maxUses})`,
        ),
      );

    return { promotions: rows };
  });

  // Validate coupon code
  app.post('/validate', async (request) => {
    const data = couponValidateSchema.parse(request.body);

    // Get tenant
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenant) return { valid: false, error: 'Store not configured' };

    const now = new Date();

    const [promo] = await db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenant.id),
          eq(promotions.code, data.code),
        ),
      )
      .limit(1);

    if (!promo) return { valid: false, error: 'Coupon not found' };
    if (!promo.active) return { valid: false, error: 'Coupon is no longer active' };
    if (now < promo.startsAt) return { valid: false, error: 'Coupon is not yet active' };
    if (now > promo.expiresAt) return { valid: false, error: 'Coupon has expired' };
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return { valid: false, error: 'Coupon has reached maximum uses' };
    }
    if (data.subtotal < promo.minOrder) {
      return {
        valid: false,
        error: `Minimum order of $${(promo.minOrder / 100).toFixed(2)} required`,
      };
    }

    // Calculate discount
    let discount = 0;
    if (promo.discountType === 'percentage') {
      discount = Math.round(data.subtotal * (promo.discountValue / 100));
    } else {
      // fixed amount
      discount = Math.min(promo.discountValue, data.subtotal);
    }

    return {
      valid: true,
      discount,
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    };
  });
}
