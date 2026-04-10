import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { wishlistItems, products } from '../../db/schema.js';
import { customerAuthGuard } from '../middleware/auth.js';

export async function wishlistRoutes(app: FastifyInstance) {
  // List wishlist with product details
  app.get('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const userId = request.customer!.id;

    const rows = await db
      .select({
        id: wishlistItems.id,
        productId: wishlistItems.productId,
        createdAt: wishlistItems.createdAt,
        product: {
          id: products.id,
          name: products.name,
          slug: products.slug,
          category: products.category,
          pricePerUnit: products.pricePerUnit,
          unit: products.unit,
          weightKg: products.weightKg,
          imageUrl: products.imageUrl,
          inStock: products.inStock,
          active: products.active,
        },
      })
      .from(wishlistItems)
      .innerJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(wishlistItems.userId, userId));

    return { wishlist: rows };
  });

  // Toggle wishlist item (add if not exists, remove if exists)
  app.post('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const userId = request.customer!.id;
    const { product_id } = request.body as { product_id: string };

    // Check if already in wishlist
    const [existing] = await db
      .select()
      .from(wishlistItems)
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, product_id)))
      .limit(1);

    if (existing) {
      // Remove from wishlist
      await db
        .delete(wishlistItems)
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, product_id)));

      return { action: 'removed', product_id };
    }

    // Add to wishlist
    const [item] = await db
      .insert(wishlistItems)
      .values({ userId, productId: product_id })
      .returning();

    return { action: 'added', item };
  });

  // Remove a single wishlist item by id
  app.delete('/:id', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const userId = request.customer!.id;
    const { id } = request.params as { id: string };

    const [removed] = await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.id, id), eq(wishlistItems.userId, userId)))
      .returning();

    if (!removed) return reply.code(404).send({ error: 'Wishlist item not found' });
    return { success: true };
  });
}
