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
        // Optional image (used by checkout to render a small thumb next
        // to each available coupon) — empty string if admin never set one.
        imageUrl: promotions.imageUrl,
        popupTitle: promotions.popupTitle,
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
    // Frontend sends subtotal in DOLLARS. Backend stores money values
    // (minOrder, discountValue) in CENTS. Convert to a consistent unit
    // (cents) for the math, then return the discount back in DOLLARS so
    // the frontend can display/subtract it directly.
    const subtotalCents = Math.round(data.subtotal * 100);

    if (subtotalCents < promo.minOrder) {
      return {
        valid: false,
        error: `Minimum order of $${(promo.minOrder / 100).toFixed(2)} required`,
      };
    }

    // Calculate discount in CENTS. Accept both 'percent' (admin UI) and
    // 'percentage' (legacy) — the existing seed uses 'percent'.
    let discountCents = 0;
    const isPercent = promo.discountType === 'percent' || promo.discountType === 'percentage';
    if (isPercent) {
      discountCents = Math.round(subtotalCents * (promo.discountValue / 100));
    } else {
      // Fixed amount — discountValue is already in cents
      discountCents = Math.min(promo.discountValue, subtotalCents);
    }

    return {
      valid: true,
      discount: discountCents / 100, // back to dollars for the frontend
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    };
  });
}
