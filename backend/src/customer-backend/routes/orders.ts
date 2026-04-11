import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
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

  // ── Personalized recommendations ────────────────────────────
  // Returns:
  //   - recentlyOrdered: distinct products from this customer's most recent orders
  //   - mostOrdered:    products this customer has bought most often (by total qty)
  // Both lists hydrate the product fields the storefront cards already render.
  app.get('/personalized', { preHandler: [customerAuthGuard] }, async (request) => {
    const customerId = request.customer!.id;

    // Pull this customer's order ids (cap at last 50 — plenty for personalization)
    const myOrders = await db
      .select({ id: orders.id, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.appUserId, customerId))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    if (myOrders.length === 0) {
      return { recentlyOrdered: [], mostOrdered: [] };
    }

    const orderIds = myOrders.map((o) => o.id);

    // All items from those orders
    const items = await db
      .select({
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        orderId: orderItems.orderId,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    if (items.length === 0) {
      return { recentlyOrdered: [], mostOrdered: [] };
    }

    // Aggregate by productId: total quantity + most recent purchase timestamp
    const orderTimeById = new Map(myOrders.map((o) => [o.id, o.createdAt.getTime()]));
    const stats = new Map<string, { totalQty: number; lastOrderedAt: number }>();
    for (const it of items) {
      const lastFromThis = orderTimeById.get(it.orderId) ?? 0;
      const cur = stats.get(it.productId);
      if (cur) {
        cur.totalQty += it.quantity;
        if (lastFromThis > cur.lastOrderedAt) cur.lastOrderedAt = lastFromThis;
      } else {
        stats.set(it.productId, { totalQty: it.quantity, lastOrderedAt: lastFromThis });
      }
    }

    const productIds = Array.from(stats.keys());

    // Hydrate the product rows (only the fields the storefront card needs)
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        category: products.category,
        unit: products.unit,
        pricePerUnit: products.pricePerUnit,
        imageUrl: products.imageUrl,
        images: products.images,
        inStock: products.inStock,
        active: products.active,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    // Filter out inactive products — don't recommend stuff the admin pulled
    const productById = new Map(productRows.filter((p) => p.active).map((p) => [p.id, p]));

    const recentlyOrdered = Array.from(stats.entries())
      .filter(([id]) => productById.has(id))
      .sort((a, b) => b[1].lastOrderedAt - a[1].lastOrderedAt)
      .slice(0, 8)
      .map(([id, s]) => ({ ...productById.get(id)!, lastOrderedAt: new Date(s.lastOrderedAt).toISOString() }));

    const mostOrdered = Array.from(stats.entries())
      .filter(([id]) => productById.has(id))
      .sort((a, b) => b[1].totalQty - a[1].totalQty)
      .slice(0, 8)
      .map(([id, s]) => ({ ...productById.get(id)!, totalOrdered: s.totalQty }));

    return { recentlyOrdered, mostOrdered };
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
