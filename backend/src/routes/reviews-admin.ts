import type { FastifyInstance } from 'fastify';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { productReviews, products, appUsers } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function adminReviewRoutes(app: FastifyInstance) {
  // GET / — list all reviews with product + customer info
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { page = '1', limit = '50' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const rows = await db
      .select({
        id: productReviews.id,
        rating: productReviews.rating,
        title: productReviews.title,
        body: productReviews.body,
        isVerified: productReviews.isVerified,
        createdAt: productReviews.createdAt,
        productId: products.id,
        productName: products.name,
        customerName: appUsers.displayName,
        customerEmail: appUsers.email,
      })
      .from(productReviews)
      .leftJoin(products, eq(productReviews.productId, products.id))
      .leftJoin(appUsers, eq(productReviews.userId, appUsers.id))
      .where(eq(products.tenantId, tenantId))
      .orderBy(desc(productReviews.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(productReviews)
      .leftJoin(products, eq(productReviews.productId, products.id))
      .where(eq(products.tenantId, tenantId));

    // Aggregate stats
    const [stats] = await db
      .select({
        avgRating: sql<number>`COALESCE(AVG(${productReviews.rating}), 0)::float`,
        totalReviews: count(),
      })
      .from(productReviews)
      .leftJoin(products, eq(productReviews.productId, products.id))
      .where(eq(products.tenantId, tenantId));

    return {
      data: rows,
      stats: {
        avgRating: Number(stats.avgRating || 0),
        totalReviews: Number(stats.totalReviews || 0),
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        pages: Math.ceil(Number(total) / limitNum),
      },
    };
  });

  // PATCH /:id/verify — toggle verified flag
  app.patch('/:id/verify', { preHandler: [authGuard] }, async (request) => {
    const { id } = request.params as { id: string };
    const { isVerified } = request.body as { isVerified: boolean };

    await db
      .update(productReviews)
      .set({ isVerified })
      .where(eq(productReviews.id, id));

    return { success: true };
  });

  // DELETE /:id — delete review
  app.delete('/:id', { preHandler: [authGuard] }, async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(productReviews).where(eq(productReviews.id, id));
    return { success: true };
  });
}
