import type { FastifyInstance } from 'fastify';
import { eq, and, desc, avg, count } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { productReviews, appUsers } from '../../db/schema.js';
import { customerAuthGuard } from '../middleware/auth.js';
import { reviewSchema } from '../validation/schemas.js';

export async function reviewRoutes(app: FastifyInstance) {
  // List reviews for a product (PUBLIC)
  app.get('/', async (request) => {
    const { product_id } = request.query as { product_id: string };

    if (!product_id) {
      return { reviews: [], avg_rating: 0, total: 0 };
    }

    const reviews = await db
      .select({
        id: productReviews.id,
        productId: productReviews.productId,
        userId: productReviews.userId,
        rating: productReviews.rating,
        title: productReviews.title,
        body: productReviews.body,
        isVerified: productReviews.isVerified,
        createdAt: productReviews.createdAt,
        userName: appUsers.displayName,
      })
      .from(productReviews)
      .innerJoin(appUsers, eq(productReviews.userId, appUsers.id))
      .where(eq(productReviews.productId, product_id))
      .orderBy(desc(productReviews.createdAt));

    // Get aggregate stats
    const [stats] = await db
      .select({
        avg_rating: avg(productReviews.rating),
        total: count(),
      })
      .from(productReviews)
      .where(eq(productReviews.productId, product_id));

    return {
      reviews,
      avg_rating: stats?.avg_rating ? parseFloat(String(stats.avg_rating)) : 0,
      total: stats?.total ?? 0,
    };
  });

  // Submit review (upsert — one review per user per product)
  app.post('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const userId = request.customer!.id;
    const data = reviewSchema.parse(request.body);

    // Check if user already reviewed this product
    const [existing] = await db
      .select()
      .from(productReviews)
      .where(and(eq(productReviews.userId, userId), eq(productReviews.productId, data.product_id)))
      .limit(1);

    if (existing) {
      // Update existing review
      const [review] = await db
        .update(productReviews)
        .set({
          rating: data.rating,
          title: data.title ?? null,
          body: data.body ?? null,
        })
        .where(eq(productReviews.id, existing.id))
        .returning();

      return { review, updated: true };
    }

    // Create new review
    const [review] = await db
      .insert(productReviews)
      .values({
        productId: data.product_id,
        userId,
        rating: data.rating,
        title: data.title ?? null,
        body: data.body ?? null,
      })
      .returning();

    return { review, updated: false };
  });
}
