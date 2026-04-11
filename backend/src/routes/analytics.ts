import type { FastifyInstance } from 'fastify';
import { eq, and, sql, gte, lt, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, products, customers, appUsers, storeInventory } from '../db/schema.js';
import { authGuard, getLocationScope } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/summary', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { locationId: queryLocationId } = request.query as { locationId?: string };

    // For non-admin users, force the scope to their assigned location no
    // matter what they pass in the query string.
    const locationId = scope ?? queryLocationId;

    // Base condition
    const tenantCond = eq(orders.tenantId, tenantId);
    const conditions = locationId
      ? and(tenantCond, eq(orders.locationId, locationId))!
      : tenantCond;

    // KPIs
    const [kpis] = await db.select({
      totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      totalOrders: sql<number>`count(*)::int`,
      avgOrderValue: sql<number>`coalesce(avg(${orders.total}), 0)::int`,
    }).from(orders).where(conditions);

    // Customer count
    const [custCount] = await db.select({
      total: sql<number>`count(distinct ${orders.appUserId})::int`,
    }).from(orders).where(conditions);

    // Bot customers — when scoped to a location, only count bot customers
    // who have actually ordered at that location. Otherwise count all of them.
    let botTotal = 0;
    if (locationId) {
      const [bc] = await db.select({
        total: sql<number>`count(distinct ${orders.customerId})::int`,
      }).from(orders).where(conditions);
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

    const thisWeekCond = locationId
      ? and(tenantCond, eq(orders.locationId, locationId), gte(orders.createdAt, weekAgo))!
      : and(tenantCond, gte(orders.createdAt, weekAgo))!;

    const lastWeekCond = locationId
      ? and(tenantCond, eq(orders.locationId, locationId), gte(orders.createdAt, twoWeeksAgo), lt(orders.createdAt, weekAgo))!
      : and(tenantCond, gte(orders.createdAt, twoWeeksAgo), lt(orders.createdAt, weekAgo))!;

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

    // Orders by status
    const statusRows = await db.select({
      status: orders.status,
      count: sql<number>`count(*)::int`,
    }).from(orders).where(conditions).groupBy(orders.status);

    // Orders by delivery method
    const deliveryRows = await db.select({
      method: orders.deliveryMethod,
      count: sql<number>`count(*)::int`,
    }).from(orders).where(conditions).groupBy(orders.deliveryMethod);

    // Orders by payment method
    const paymentRows = await db.select({
      method: orders.paymentMethod,
      count: sql<number>`count(*)::int`,
    }).from(orders).where(conditions).groupBy(orders.paymentMethod);

    // Revenue by day (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyCond = locationId
      ? and(tenantCond, eq(orders.locationId, locationId), gte(orders.createdAt, thirtyDaysAgo))!
      : and(tenantCond, gte(orders.createdAt, thirtyDaysAgo))!;

    const dailyRevenue = await db.select({
      date: sql<string>`to_char(${orders.createdAt}, 'Mon DD')`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    }).from(orders).where(dailyCond)
      .groupBy(sql`to_char(${orders.createdAt}, 'Mon DD'), date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`);

    // Revenue by month (last 12 months)
    const monthlyRevenue = await db.select({
      month: sql<string>`to_char(${orders.createdAt}, 'Mon YY')`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    }).from(orders).where(conditions)
      .groupBy(sql`to_char(${orders.createdAt}, 'Mon YY'), date_trunc('month', ${orders.createdAt})`)
      .orderBy(sql`date_trunc('month', ${orders.createdAt})`);

    // Top products by revenue
    const topProducts = await db.select({
      name: orderItems.productName,
      revenue: sql<number>`coalesce(sum(${orderItems.total}), 0)::int`,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(conditions)
      .groupBy(orderItems.productName)
      .orderBy(sql`sum(${orderItems.total}) desc`)
      .limit(10);

    // Recent orders
    const recentOrders = await db.select({
      id: orders.id,
      orderCode: orders.orderCode,
      total: orders.total,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      deliveryMethod: orders.deliveryMethod,
      createdAt: orders.createdAt,
    }).from(orders).where(conditions).orderBy(desc(orders.createdAt)).limit(10);

    // Order source breakdown
    const sourceRows = await db.select({
      source: orders.source,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
    }).from(orders).where(conditions).groupBy(orders.source);

    return {
      totalRevenue: kpis.totalRevenue / 100,
      totalOrders: kpis.totalOrders,
      totalCustomers,
      avgOrderValue: kpis.totalOrders > 0 ? Math.round(kpis.avgOrderValue / 100) : 0,
      revenueGrowth,
      ordersGrowth,
      ordersByStatus: statusRows.map(r => ({ status: r.status, count: r.count })),
      ordersByDelivery: deliveryRows.map(r => ({ method: r.method, count: r.count })),
      ordersByPayment: paymentRows.map(r => ({ method: r.method, count: r.count })),
      dailyRevenue: dailyRevenue.map(r => ({ date: r.date, revenue: r.revenue / 100, orders: r.orders })),
      revenueByMonth: monthlyRevenue.map(r => ({ month: r.month, revenue: r.revenue / 100, orders: r.orders })),
      topProducts: topProducts.map(r => ({ name: r.name, revenue: r.revenue / 100, quantity: r.quantity })),
      recentOrders: recentOrders.map(r => ({
        id: r.id, orderCode: r.orderCode, total: r.total / 100,
        status: r.status, paymentMethod: r.paymentMethod,
        deliveryMethod: r.deliveryMethod, createdAt: r.createdAt,
      })),
      ordersBySource: sourceRows.map(r => ({ source: r.source, count: r.count, revenue: r.revenue / 100 })),
    };
  });
}
