import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { orders, orderItems, products, appUsers } from '../../db/schema.js';
import { customerAuthGuard } from '../middleware/auth.js';
import { generateInvoiceHtml, generateInvoicePdf } from '../../services/invoice.js';

export async function customerOrderRoutes(app: FastifyInstance) {
  // ── List my orders ──────────────────────────────────────────
  // Returns each order with its items, AND each item enriched with the
  // product's current imageUrl + slug + unit so the customer order list
  // can render real photo thumbnails (instead of generic cube icons) and
  // link the line items back to the product detail page.
  app.get('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const customerId = request.customer!.id;

    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.appUserId, customerId))
      .orderBy(desc(orders.createdAt));

    if (rows.length === 0) return { orders: [] };

    // 1) All items in one query (in_array on order ids)
    const orderIds = rows.map((o) => o.id);
    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    // 2) All referenced products in one query
    const productIds = Array.from(new Set(allItems.map((i) => i.productId)));
    const productRows = productIds.length
      ? await db
          .select({
            id: products.id,
            slug: products.slug,
            imageUrl: products.imageUrl,
            unit: products.unit,
          })
          .from(products)
          .where(inArray(products.id, productIds))
      : [];
    const productById = new Map(productRows.map((p) => [p.id, p]));

    // 3) Group items by orderId + attach product fields
    const itemsByOrderId = new Map<string, Array<typeof allItems[number] & { imageUrl: string; slug: string; unit: string }>>();
    for (const item of allItems) {
      const product = productById.get(item.productId);
      const enrichedItem = {
        ...item,
        imageUrl: product?.imageUrl ?? '',
        slug: product?.slug ?? '',
        unit: product?.unit ?? '',
      };
      const arr = itemsByOrderId.get(item.orderId) ?? [];
      arr.push(enrichedItem);
      itemsByOrderId.set(item.orderId, arr);
    }

    // 4) Compose final response
    const enriched = rows.map((order) => ({
      ...order,
      items: itemsByOrderId.get(order.id) ?? [],
    }));

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

  // ── Download invoice as PDF ─────────────────────────────────
  // Streams a brand-styled PDF back to the customer for the given order.
  // Scoped to the authenticated customer (orders.appUserId) so a logged-in
  // user can never download someone else's invoice. Limited to paid
  // orders — until payment clears, the receipt is just an order summary,
  // not an invoice. Reuses the same generator the email service uses,
  // so the PDF the customer downloads is byte-for-byte the same as the
  // one we attach to the invoice email.
  app.get('/:id/invoice.pdf', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const customerId = request.customer!.id;
    const { id } = request.params as { id: string };

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
    // Invoice is the record of the original transaction. We let customers
    // download it both for currently-paid orders AND orders that were
    // paid and later refunded — the original receipt is still valid
    // accounting evidence; refunds are a separate event.
    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded') {
      return reply.code(409).send({
        error: 'Invoice is only available after payment is completed.',
      });
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const [customer] = await db
      .select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email })
      .from(appUsers)
      .where(eq(appUsers.id, customerId))
      .limit(1);

    const html = generateInvoiceHtml(order, items, customer ?? { name: null, phone: null, email: null });
    const pdf = await generateInvoicePdf(html);

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="INV-${order.orderCode}.pdf"`)
      .header('Cache-Control', 'no-store');
    return reply.send(pdf);
  });
}
