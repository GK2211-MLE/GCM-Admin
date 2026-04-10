import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { orders, orderItems, products } from '../../db/schema.js';
import { customerAuthGuard } from '../middleware/auth.js';

export async function customerOrderRoutes(app: FastifyInstance) {
  // ── List my orders ──────────────────────────────────────────
  app.get('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const customerId = request.customer!.id;

    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.appUserId, customerId))
      .orderBy(desc(orders.createdAt));

    // Enrich each order with its items
    const enriched = await Promise.all(
      rows.map(async (order) => {
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        return { ...order, items };
      }),
    );

    return { orders: enriched };
  });

  // ── Get single order detail ─────────────────────────────────
  app.get('/:id', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const customerId = request.customer!.id;
    const { id } = request.params as { id: string };

    // Support lookup by UUID id or order code
    const isUuid = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const [order] = await db
      .select()
      .from(orders)
      .where(and(
        isUuid ? eq(orders.id, id) : eq(orders.orderCode, id),
        eq(orders.appUserId, customerId),
      ))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    // Enrich items with product image if available
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const [product] = await db
          .select({ imageUrl: products.imageUrl, unit: products.unit })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);
        return { ...item, imageUrl: product?.imageUrl ?? '', unit: product?.unit ?? 'kg' };
      }),
    );

    return { order: { ...order, items: enrichedItems } };
  });
}
