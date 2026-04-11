import type { FastifyInstance } from 'fastify';
import { eq, and, lte, gte, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { promotions, tenants } from '../../db/schema.js';

/* ────────────────────────────────────────────────────────────────
   Customer-facing popup endpoint.
   Returns the single most-recent active promotion that has been
   marked "show as popup" by an admin AND targets the requested
   portal (web by default, app via ?portal=app).

   Used by the customer storefront's HomepagePopup component (mounted
   only on the homepage, dismissed via sessionStorage). Also safe for
   the mobile app to call with ?portal=app.
   ──────────────────────────────────────────────────────────────── */

export async function popupRoutes(app: FastifyInstance) {
  // Public — no auth required
  app.get('/active', async (request) => {
    const { portal = 'web' } = request.query as { portal?: string };

    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenant) return { popup: null };

    const now = new Date();
    const targetCol = portal === 'app' ? promotions.targetApp : promotions.targetWeb;

    const [popup] = await db
      .select({
        id: promotions.id,
        code: promotions.code,
        description: promotions.description,
        discountType: promotions.discountType,
        discountValue: promotions.discountValue,
        minOrder: promotions.minOrder,
        imageUrl: promotions.imageUrl,
        popupTitle: promotions.popupTitle,
        popupBody: promotions.popupBody,
        startsAt: promotions.startsAt,
        expiresAt: promotions.expiresAt,
      })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenant.id),
          eq(promotions.active, true),
          eq(promotions.showAsPopup, true),
          eq(targetCol, true),
          lte(promotions.startsAt, now),
          gte(promotions.expiresAt, now),
          // Either unlimited uses or under the cap
          sql`(${promotions.maxUses} = 0 OR ${promotions.usedCount} < ${promotions.maxUses})`,
        ),
      )
      .orderBy(desc(promotions.startsAt))
      .limit(1);

    return { popup: popup ?? null };
  });
}
