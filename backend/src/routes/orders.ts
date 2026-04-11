import type { FastifyInstance } from 'fastify';
import { eq, ne, and, desc, asc, sql, gte, lte, ilike, or, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, customers, locations, products, appUsers } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import {
  orderFilterSchema,
  updateOrderStatusSchema,
  bulkStatusUpdateSchema,
  formatCents,
} from '../shared/index.js';
import { broadcastSSE } from './sse.js';
import { createNotification } from '../services/notification.js';

export async function orderRoutes(app: FastifyInstance) {
  // List orders with filters
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const filters = orderFilterSchema.parse(request.query);
    const offset = (filters.page - 1) * filters.limit;

    let conditions = [eq(orders.tenantId, tenantId)];

    if (filters.status) conditions.push(eq(orders.status, filters.status));
    if (filters.locationId) conditions.push(eq(orders.locationId, filters.locationId));
    if (filters.paymentMethod) conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
    if (filters.deliveryMethod) conditions.push(eq(orders.deliveryMethod, filters.deliveryMethod));
    if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
    if (filters.search) {
      conditions.push(
        or(
          ilike(orders.orderCode, `%${filters.search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const orderDir = filters.order === 'asc' ? asc : desc;
    const sortCol =
      filters.sort === 'total' ? orders.total : filters.sort === 'status' ? orders.status : orders.createdAt;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(where)
        .orderBy(orderDir(sortCol))
        .limit(filters.limit)
        .offset(offset),
      db.select({ total: count() }).from(orders).where(where),
    ]);

    // Fetch items and customer info for each order
    const enriched = await Promise.all(
      rows.map(async (order) => {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        let customer: { name: string | null; phone: string; email: string | null } | undefined;
        if (order.customerId) {
          customer = (await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0];
        } else if (order.appUserId) {
          const [appUser] = await db.select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, order.appUserId)).limit(1);
          if (appUser) customer = appUser;
        }
        const location = order.locationId
          ? (await db.select().from(locations).where(eq(locations.id, order.locationId)).limit(1))[0]
          : undefined;
        return { ...order, items, customer, location };
      }),
    );

    return {
      orders: enriched,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        pages: Math.ceil(total / filters.limit),
      },
    };
  });

  // Dashboard summary — full data for rich dashboard
  app.get('/summary', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Core counts
    const [totalOrders] = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));

    const [todayOrders] = await db
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, today)));

    const [revenue] = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));

    const [todayRevenue] = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, today)));

    const [customerCount] = await db
      .select({ count: count() })
      .from(customers)
      .where(eq(customers.tenantId, tenantId));

    const [productCount] = await db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.active, true)));

    // Status breakdown
    const statusCounts = await db
      .select({ status: orders.status, count: count() })
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .groupBy(orders.status);

    // Delivery method breakdown
    const deliveryMethodCounts = await db
      .select({ method: orders.deliveryMethod, count: count() })
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .groupBy(orders.deliveryMethod);

    // Week-over-week growth
    const [thisWeekRevenue] = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)`, count: count() })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, sevenDaysAgo)));

    const [lastWeekRevenue] = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)`, count: count() })
      .from(orders)
      .where(and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, fourteenDaysAgo),
        lte(orders.createdAt, sevenDaysAgo),
      ));

    // Daily revenue for chart (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyRevenue = await db
      .select({
        date: sql<string>`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`,
        revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
        count: count(),
      })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, thirtyDaysAgo)))
      .groupBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`);

    // Top products by order frequency
    const topProducts = await db
      .select({
        productName: orderItems.productName,
        productId: orderItems.productId,
        orderCount: count(),
        totalQty: sql<number>`SUM(${orderItems.quantity})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.tenantId, tenantId))
      .groupBy(orderItems.productId, orderItems.productName)
      .orderBy(desc(count()))
      .limit(5);

    // Recent orders (join both customers and app_users for name resolution)
    const recentOrderRows = await db
      .select({
        id: orders.id,
        orderCode: orders.orderCode,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        deliveryMethod: orders.deliveryMethod,
        customerName: customers.name,
        customerPhone: customers.phone,
        appUserName: appUsers.name,
        appUserPhone: appUsers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(appUsers, eq(orders.appUserId, appUsers.id))
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    const recentOrders = recentOrderRows.map((r) => ({
      id: r.id,
      orderCode: r.orderCode,
      status: r.status,
      total: r.total,
      createdAt: r.createdAt,
      deliveryMethod: r.deliveryMethod,
      customerName: r.customerName || r.appUserName,
      customerPhone: r.customerPhone || r.appUserPhone,
    }));

    // Compute growth percentages
    const calcGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    const statusMap = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));
    const pendingCount = (statusMap['pending_payment'] || 0) + (statusMap['confirmed'] || 0);
    const activeDeliveries = (statusMap['out_for_delivery'] || 0);
    const processingCount = (statusMap['processing'] || 0) + (statusMap['ready'] || 0);

    return {
      // Counts (cast to number — Drizzle/pg returns strings for aggregates)
      totalOrders: Number(totalOrders.count),
      todayOrders: Number(todayOrders.count),
      totalRevenue: Number(revenue.total),
      todayRevenue: Number(todayRevenue.total),
      totalCustomers: Number(customerCount.count),
      totalProducts: Number(productCount.count),
      pendingCount: Number(pendingCount),
      activeDeliveries: Number(activeDeliveries),
      processingCount: Number(processingCount),

      // Growth (week over week)
      revenueGrowth: calcGrowth(Number(thisWeekRevenue.total), Number(lastWeekRevenue.total)),
      ordersGrowth: calcGrowth(Number(thisWeekRevenue.count), Number(lastWeekRevenue.count)),

      // Breakdowns
      statusBreakdown: statusMap,
      deliveryMethodBreakdown: Object.fromEntries(deliveryMethodCounts.map((d) => [d.method, d.count])),

      // Charts
      dailyRevenue: dailyRevenue.map((d) => ({ ...d, revenue: Number(d.revenue), count: Number(d.count) })),
      topProducts: topProducts.map((p) => ({ ...p, orderCount: Number(p.orderCount), totalQty: Number(p.totalQty) })),
      recentOrders,
    };
  });

  // Get single order
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    // Support lookup by UUID id or order code
    const isUuid = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const [order] = await db
      .select()
      .from(orders)
      .where(and(
        isUuid ? eq(orders.id, id) : eq(orders.orderCode, id),
        eq(orders.tenantId, tenantId),
      ))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    let customer: { name: string | null; phone: string; email: string | null } | undefined;
    if (order.customerId) {
      customer = (await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0];
    } else if (order.appUserId) {
      const [appUser] = await db.select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, order.appUserId)).limit(1);
      if (appUser) customer = appUser;
    }
    const location = order.locationId
      ? (await db.select().from(locations).where(eq(locations.id, order.locationId)).limit(1))[0]
      : undefined;

    return { order: { ...order, items, customer, location } };
  });

  // Update order status
  app.patch('/:id/status', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const body = request.body as { status: string; notes?: string; force?: boolean };
    const { status, notes } = updateOrderStatusSchema.parse(request.body);
    const force = body.force === true;

    // Look up the existing order to check current payment state
    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: 'Order not found' });

    // Block confirming/fulfilling Stripe orders that haven't been paid yet,
    // unless the admin explicitly forces it via { force: true }. The Stripe
    // webhook is the only thing that should mark a Stripe order as paid.
    const blockedStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
    const isStripeOrder = existing.paymentMethod === 'stripe';
    if (
      isStripeOrder &&
      existing.paymentStatus !== 'paid' &&
      blockedStatuses.includes(status) &&
      !force
    ) {
      return reply.code(409).send({
        error: 'Cannot fulfill an unpaid Stripe order',
        details: {
          paymentStatus: existing.paymentStatus,
          paymentMethod: existing.paymentMethod,
          hint: 'Wait for the Stripe webhook to confirm payment, or pass {"force": true} to override.',
        },
      });
    }

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (notes) updateData.notes = notes;

    // For non-Stripe payment methods (cash, admin-created), auto-mark as paid
    // when the admin moves the order to a confirmed/fulfilled status. This
    // preserves the existing COD/admin workflow.
    if (status === 'confirmed' && !isStripeOrder) {
      updateData.paymentStatus = 'paid';
    }
    // If admin explicitly forced past the unpaid check, also flip paymentStatus
    // so the order doesn't show as "paid: pending" forever.
    if (force && existing.paymentStatus !== 'paid' && blockedStatuses.includes(status)) {
      updateData.paymentStatus = 'paid';
    }

    const [order] = await db
      .update(orders)
      .set(updateData)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .returning();

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    broadcastSSE(tenantId, { type: 'order:updated', data: order });

    createNotification(
      tenantId,
      'order',
      `Order ${order.orderCode} updated`,
      `Status changed to ${status.replace(/_/g, ' ')}`,
      `/orders/${order.id}`,
    ).catch(console.error);

    return { order };
  });

  // Bulk status update
  app.patch('/bulk/status', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { orderIds, status } = bulkStatusUpdateSchema.parse(request.body);

    const updated = [];
    for (const orderId of orderIds) {
      const [order] = await db
        .update(orders)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
        .returning();
      if (order) updated.push(order);
    }

    broadcastSSE(tenantId, { type: 'orders:bulk-updated', data: { count: updated.length } });

    return { updated: updated.length, orders: updated };
  });

  // CSV export
  app.get('/export/csv', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);

    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt));

    const header = 'Order Code,Status,Payment Method,Payment Status,Delivery Method,Subtotal,Tax,Total,Created At\n';
    const csv =
      header +
      rows
        .map(
          (o) =>
            `${o.orderCode},${o.status},${o.paymentMethod},${o.paymentStatus},${o.deliveryMethod},${formatCents(o.subtotal)},${formatCents(o.tax)},${formatCents(o.total)},${o.createdAt}`,
        )
        .join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename=orders.csv');
    return csv;
  });
}
