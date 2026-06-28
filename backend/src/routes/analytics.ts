import type { FastifyInstance } from 'fastify';
import { eq, ne, and, sql, gte, lte, lt, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, products, customers, appUsers, locations, storeInventory } from '../db/schema.js';
import { authGuard, getLocationScope } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

/**
 * Resolve a date range from the query's `dateFrom` / `dateTo`.
 * Returns Date objects (already at midnight / end-of-day) or undefined if the
 * field is absent.
 */
function parseDateRange(query: { dateFrom?: string; dateTo?: string }) {
  let from: Date | undefined;
  let to: Date | undefined;
  if (query.dateFrom) {
    from = new Date(query.dateFrom);
    if (isNaN(from.getTime())) from = undefined;
  }
  if (query.dateTo) {
    to = new Date(query.dateTo);
    if (isNaN(to.getTime())) to = undefined;
    else {
      // Include the full end day
      to.setHours(23, 59, 59, 999);
    }
  }
  return { from, to };
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/summary', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { locationId: queryLocationId, dateFrom, dateTo } = request.query as {
      locationId?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    // For non-admin users, force the scope to their assigned location no
    // matter what they pass in the query string.
    const locationId = scope ?? queryLocationId;

    // Date range filter — applied to every query that touches orders.
    const { from: rangeFrom, to: rangeTo } = parseDateRange({ dateFrom, dateTo });

    // Base condition (tenant + optional location + optional date range).
    // `conditions` includes EVERY order regardless of payment status —
    // used for the admin-facing "recent orders" feed and the "orders by
    // status" breakdown so the admin can see pending_payment rows that
    // need attention.
    const tenantCond = eq(orders.tenantId, tenantId);
    const parts: ReturnType<typeof eq>[] = [tenantCond];
    if (locationId) parts.push(eq(orders.locationId, locationId));
    if (rangeFrom) parts.push(gte(orders.createdAt, rangeFrom));
    if (rangeTo) parts.push(lte(orders.createdAt, rangeTo));
    const conditions = parts.length === 1 ? parts[0] : and(...parts)!;

    // `paidConditions` is what every revenue / order-count KPI uses.
    // Without this, customers who hit "Proceed to Checkout" (which
    // creates an orders row with status='pending_payment' for the
    // Stripe PaymentIntent) but never completed payment would inflate
    // every dashboard number — revenue, order count, top products,
    // growth %, daily/monthly trends. Filter to paymentStatus='paid'
    // so the dashboard reflects real money.
    const paidCond = and(
      ...parts,
      eq(orders.paymentStatus, 'paid'),
    )!;

    // KPIs — paid orders only.
    const [kpis] = await db.select({
      totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      totalOrders: sql<number>`count(*)::int`,
      avgOrderValue: sql<number>`coalesce(avg(${orders.total}), 0)::int`,
    }).from(orders).where(paidCond);

    // Abandoned checkouts: customers who hit Proceed to Checkout but
    // never completed payment. Useful for follow-up / remarketing.
    const [abandoned] = await db.select({
      count: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    }).from(orders).where(and(...parts, eq(orders.paymentStatus, 'pending'))!);

    // Customer count — only customers who actually paid.
    const [custCount] = await db.select({
      total: sql<number>`count(distinct ${orders.appUserId})::int`,
    }).from(orders).where(paidCond);

    // Bot customers — when scoped to a location, only count bot customers
    // who have actually paid at that location. Otherwise count all of them.
    let botTotal = 0;
    if (locationId) {
      const [bc] = await db.select({
        total: sql<number>`count(distinct ${orders.customerId})::int`,
      }).from(orders).where(paidCond);
      botTotal = bc?.total ?? 0;
    } else {
      const [bc] = await db.select({
        total: sql<number>`count(*)::int`,
      }).from(customers).where(eq(customers.tenantId, tenantId));
      botTotal = bc?.total ?? 0;
    }

    const totalCustomers = (custCount?.total ?? 0) + botTotal;

    // Growth: this week vs last week
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Growth window conditions also restrict to paid orders.
    const paidStatusCond = eq(orders.paymentStatus, 'paid');
    const thisWeekCond = locationId
      ? and(tenantCond, paidStatusCond, eq(orders.locationId, locationId), gte(orders.createdAt, weekAgo))!
      : and(tenantCond, paidStatusCond, gte(orders.createdAt, weekAgo))!;

    const lastWeekCond = locationId
      ? and(tenantCond, paidStatusCond, eq(orders.locationId, locationId), gte(orders.createdAt, twoWeeksAgo), lt(orders.createdAt, weekAgo))!
      : and(tenantCond, paidStatusCond, gte(orders.createdAt, twoWeeksAgo), lt(orders.createdAt, weekAgo))!;

    const [thisWeek] = await db.select({
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    }).from(orders).where(thisWeekCond);

    const [lastWeek] = await db.select({
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    }).from(orders).where(lastWeekCond);

    const revenueGrowth = lastWeek.revenue > 0
      ? Math.round(((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 100)
      : thisWeek.revenue > 0 ? 100 : 0;

    const ordersGrowth = lastWeek.orders > 0
      ? Math.round(((thisWeek.orders - lastWeek.orders) / lastWeek.orders) * 100)
      : thisWeek.orders > 0 ? 100 : 0;

    // Orders by status. We exclude pending_payment from the breakdown:
    // it's an abandoned-checkout state and the user explicitly asked
    // for no pending_payment row in any admin surface (BUG-006). The
    // dedicated abandonedCheckouts KPI below still tallies them so
    // remarketing has the count it needs.
    const statusRows = await db.select({
      status: orders.status,
      count: sql<number>`count(*)::int`,
    }).from(orders).where(and(conditions, ne(orders.status, 'pending_payment'))!).groupBy(orders.status);

    // Orders by delivery method — paid only (revenue chart drives this UI).
    const deliveryRows = await db.select({
      method: orders.deliveryMethod,
      count: sql<number>`count(*)::int`,
    }).from(orders).where(paidCond).groupBy(orders.deliveryMethod);

    // Orders by payment method — paid only.
    const paymentRows = await db.select({
      method: orders.paymentMethod,
      count: sql<number>`count(*)::int`,
    }).from(orders).where(paidCond).groupBy(orders.paymentMethod);

    // Revenue by day — use the date range if provided, otherwise last 30 days.
    // Paid only: revenue charts must reflect actual money.
    const dailyFrom = rangeFrom ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyParts: ReturnType<typeof eq>[] = [tenantCond, paidStatusCond, gte(orders.createdAt, dailyFrom)];
    if (locationId) dailyParts.push(eq(orders.locationId, locationId));
    if (rangeTo) dailyParts.push(lte(orders.createdAt, rangeTo));
    const dailyCond = and(...dailyParts)!;

    const dailyRevenue = await db.select({
      date: sql<string>`to_char(${orders.createdAt}, 'Mon DD')`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    }).from(orders).where(dailyCond)
      .groupBy(sql`to_char(${orders.createdAt}, 'Mon DD'), date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`);

    // Revenue by month (last 12 months) — paid only.
    const monthlyRevenue = await db.select({
      month: sql<string>`to_char(${orders.createdAt}, 'Mon YY')`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    }).from(orders).where(paidCond)
      .groupBy(sql`to_char(${orders.createdAt}, 'Mon YY'), date_trunc('month', ${orders.createdAt})`)
      .orderBy(sql`date_trunc('month', ${orders.createdAt})`);

    // Top products by revenue — paid only, otherwise abandoned-cart items
    // would inflate the bestseller list.
    const topProducts = await db.select({
      productId: orderItems.productId,
      name: orderItems.productName,
      revenue: sql<number>`coalesce(sum(${orderItems.total}), 0)::int`,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      orderCount: sql<number>`count(distinct ${orderItems.orderId})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(paidCond)
      .groupBy(orderItems.productId, orderItems.productName)
      .orderBy(sql`sum(${orderItems.total}) desc`)
      .limit(15);

    // Recent orders — same rule as the orders list: pending_payment
    // never appears (BUG-006).
    const recentOrders = await db.select({
      id: orders.id,
      orderCode: orders.orderCode,
      total: orders.total,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      deliveryMethod: orders.deliveryMethod,
      createdAt: orders.createdAt,
    }).from(orders).where(and(conditions, ne(orders.status, 'pending_payment'))!).orderBy(desc(orders.createdAt)).limit(10);

    // Order source breakdown — paid only (this row drives revenue charts).
    const sourceRows = await db.select({
      source: orders.source,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    }).from(orders).where(paidCond).groupBy(orders.source);

    return {
      totalRevenue: kpis.totalRevenue / 100,
      totalOrders: kpis.totalOrders,
      totalCustomers,
      avgOrderValue: kpis.totalOrders > 0 ? Math.round(kpis.avgOrderValue / 100) : 0,
      revenueGrowth,
      ordersGrowth,
      // "Added to cart, never paid" — useful for remarketing. Count and
      // potential value (in dollars) of orders stuck at paymentStatus=pending.
      abandonedCheckouts: {
        count: abandoned?.count ?? 0,
        potentialValue: (abandoned?.value ?? 0) / 100,
      },
      ordersByStatus: statusRows.map(r => ({ status: r.status, count: r.count })),
      ordersByDelivery: deliveryRows.map(r => ({ method: r.method, count: r.count })),
      ordersByPayment: paymentRows.map(r => ({ method: r.method, count: r.count })),
      dailyRevenue: dailyRevenue.map(r => ({ date: r.date, revenue: r.revenue / 100, orders: r.orders })),
      revenueByMonth: monthlyRevenue.map(r => ({ month: r.month, revenue: r.revenue / 100, orders: r.orders })),
      topProducts: topProducts.map(r => ({
        productId: r.productId,
        productName: r.name,
        revenue: r.revenue / 100,
        totalQty: r.quantity,
        orderCount: r.orderCount,
      })),
      recentOrders: recentOrders.map(r => ({
        id: r.id, orderCode: r.orderCode, total: r.total / 100,
        status: r.status, paymentMethod: r.paymentMethod,
        deliveryMethod: r.deliveryMethod, createdAt: r.createdAt,
      })),
      ordersBySource: sourceRows.map(r => ({ source: r.source, count: r.count, revenue: r.revenue / 100 })),
    };
  });

  // ── Product drill-down ────────────────────────────────────────
  // Returns daily sales timeline + location breakdown for a single product.
  // Supports the same locationId / dateFrom / dateTo filters as /summary.
  app.get('/product/:productId', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { productId } = request.params as { productId: string };
    const { locationId: queryLocationId, dateFrom, dateTo } = request.query as {
      locationId?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    const locationId = scope ?? queryLocationId;
    const { from: rangeFrom, to: rangeTo } = parseDateRange({ dateFrom, dateTo });

    // Build WHERE clause: tenant + optional location + optional date + product.
    // Restricted to paid orders only — pending_payment shouldn't drive
    // any per-product revenue / volume KPI.
    const parts: ReturnType<typeof eq>[] = [
      eq(orders.tenantId, tenantId),
      eq(orderItems.productId, productId),
      eq(orders.paymentStatus, 'paid'),
    ];
    if (locationId) parts.push(eq(orders.locationId, locationId));
    if (rangeFrom) parts.push(gte(orders.createdAt, rangeFrom));
    if (rangeTo) parts.push(lte(orders.createdAt, rangeTo));
    const cond = and(...parts)!;

    // KPIs for this product
    const [kpis] = await db.select({
      totalRevenue: sql<number>`coalesce(sum(${orderItems.total}), 0)::int`,
      totalQuantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      totalOrders: sql<number>`count(distinct ${orderItems.orderId})::int`,
      avgQuantityPerOrder: sql<number>`coalesce(avg(${orderItems.quantity}), 0)`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(cond);

    // Daily timeline — paid orders only.
    const dailyFrom = rangeFrom ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyParts: ReturnType<typeof eq>[] = [
      eq(orders.tenantId, tenantId),
      eq(orderItems.productId, productId),
      eq(orders.paymentStatus, 'paid'),
      gte(orders.createdAt, dailyFrom),
    ];
    if (locationId) dailyParts.push(eq(orders.locationId, locationId));
    if (rangeTo) dailyParts.push(lte(orders.createdAt, rangeTo));

    const daily = await db.select({
      date: sql<string>`to_char(${orders.createdAt}, 'Mon DD')`,
      rawDate: sql<string>`date(${orders.createdAt})`,
      revenue: sql<number>`coalesce(sum(${orderItems.total}), 0)::int`,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      orders: sql<number>`count(distinct ${orderItems.orderId})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(...dailyParts)!)
      .groupBy(sql`to_char(${orders.createdAt}, 'Mon DD'), date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`);

    // Location breakdown — which stores sold this product most
    const byLocation = await db.select({
      locationId: orders.locationId,
      locationName: locations.name,
      revenue: sql<number>`coalesce(sum(${orderItems.total}), 0)::int`,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      orders: sql<number>`count(distinct ${orderItems.orderId})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(locations, eq(orders.locationId, locations.id))
      .where(and(
        eq(orders.tenantId, tenantId),
        eq(orderItems.productId, productId),
        eq(orders.paymentStatus, 'paid'),
        ...(rangeFrom ? [gte(orders.createdAt, rangeFrom)] : []),
        ...(rangeTo ? [lte(orders.createdAt, rangeTo)] : []),
      )!)
      .groupBy(orders.locationId, locations.name)
      .orderBy(sql`sum(${orderItems.total}) desc`);

    // Product meta
    const [product] = await db.select({
      id: products.id,
      name: products.name,
      imageUrl: products.imageUrl,
      category: products.category,
      pricePerUnit: products.pricePerUnit,
    }).from(products).where(eq(products.id, productId)).limit(1);

    return {
      product: product ?? null,
      totalRevenue: kpis.totalRevenue / 100,
      totalQuantity: kpis.totalQuantity,
      totalOrders: kpis.totalOrders,
      avgQuantityPerOrder: Math.round(Number(kpis.avgQuantityPerOrder) * 10) / 10,
      daily: daily.map(r => ({
        date: r.date,
        revenue: r.revenue / 100,
        quantity: r.quantity,
        orders: r.orders,
      })),
      byLocation: byLocation.map(r => ({
        locationId: r.locationId,
        locationName: r.locationName ?? 'Unknown',
        revenue: r.revenue / 100,
        quantity: r.quantity,
        orders: r.orders,
      })),
    };
  });
}
