import type { FastifyInstance } from 'fastify';
import { eq, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { wishlistItems, products, appUsers } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function adminWishlistRoutes(app: FastifyInstance) {
  // GET / — list all wishlist items with product + customer info
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { page = '1', limit = '50' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const rows = await db
      .select({
        id: wishlistItems.id,
        createdAt: wishlistItems.createdAt,
        productId: products.id,
        productName: products.name,
        productImage: products.imageUrl,
        productPrice: products.pricePerUnit,
        customerName: appUsers.displayName,
        customerEmail: appUsers.email,
      })
      .from(wishlistItems)
      .leftJoin(products, eq(wishlistItems.productId, products.id))
      .leftJoin(appUsers, eq(wishlistItems.userId, appUsers.id))
      .where(eq(products.tenantId, tenantId))
      .orderBy(desc(wishlistItems.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(wishlistItems)
      .leftJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(products.tenantId, tenantId));

    return {
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        pages: Math.ceil(Number(total) / limitNum),
      },
    };
  });

  // GET /top — most-wishlisted products
  app.get('/top', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);

    const rows = await db
      .select({
        productId: products.id,
        productName: products.name,
        productImage: products.imageUrl,
        productPrice: products.pricePerUnit,
        wishlistCount: count(wishlistItems.id),
      })
      .from(wishlistItems)
      .leftJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(products.tenantId, tenantId))
      .groupBy(products.id, products.name, products.imageUrl, products.pricePerUnit)
      .orderBy(desc(count(wishlistItems.id)))
      .limit(10);

    return { data: rows };
  });
}
