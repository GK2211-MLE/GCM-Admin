import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or, gte, lte, sql, sum, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, customers, appUsers } from '../db/schema.js';
import { authGuard, getLocationScope } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createPaymentIntent, createRefund } from '../services/stripe.js';
import { broadcastSSE } from './sse.js';
import { sendInvoiceEmail } from '../services/invoice.js';
import { createNotification } from '../services/notification.js';
import { paymentFilterSchema, refundSchema } from '../shared/validation.js';

export async function paymentRoutes(app: FastifyInstance) {
  // ── List payment transactions (paginated) ──────────────────
  app.get('/', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const filters = paymentFilterSchema.parse(request.query);
    const { page, limit, paymentMethod, paymentStatus, dateFrom, dateTo, search } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(orders.tenantId, tenantId)];
    if (scope) conditions.push(eq(orders.locationId, scope));

    if (paymentMethod) {
      conditions.push(eq(orders.paymentMethod, paymentMethod));
    }
    if (paymentStatus) {
      conditions.push(eq(orders.paymentStatus, paymentStatus));
    }
    if (dateFrom) {
      conditions.push(gte(orders.createdAt, new Date(dateFrom)));
    }
    if (dateTo) {
      // Include the full end day
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(orders.createdAt, endDate));
    }
    if (search) {
      conditions.push(
        or(
          ilike(orders.orderCode, `%${search}%`),
          ilike(customers.name, `%${search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const [totalResult] = await db
      .select({ count: count() })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(appUsers, eq(orders.appUserId, appUsers.id))
      .where(where);

    const rows = await db
      .select({
        id: orders.id,
        orderCode: orders.orderCode,
        customerName: customers.name,
        customerPhone: customers.phone,
        appUserName: appUsers.name,
        appUserPhone: appUsers.phone,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        amount: orders.total,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(appUsers, eq(orders.appUserId, appUsers.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      payments: rows.map((r) => ({
        ...r,
        customerName: r.customerName || r.appUserName || 'Unknown',
        customerPhone: r.customerPhone || r.appUserPhone || '',
      })),
      total: totalResult?.count ?? 0,
    };
  });

  // ── Payment summary stats ──────────────────────────────────
  app.get('/summary', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;

    const summaryWhere = scope
      ? and(eq(orders.tenantId, tenantId), eq(orders.locationId, scope))!
      : eq(orders.tenantId, tenantId);

    const [result] = await db
      .select({
        totalCollected: sum(
          sql`CASE WHEN ${orders.paymentStatus} = 'paid' THEN ${orders.total} ELSE 0 END`,
        ),
        totalPending: sum(
          sql`CASE WHEN ${orders.paymentStatus} = 'pending' THEN ${orders.total} ELSE 0 END`,
        ),
        totalFailed: count(
          sql`CASE WHEN ${orders.paymentStatus} = 'failed' THEN 1 ELSE NULL END`,
        ),
        totalRefunded: sum(
          sql`CASE WHEN ${orders.paymentStatus} = 'refunded' THEN ${orders.total} ELSE 0 END`,
        ),
      })
      .from(orders)
      .where(summaryWhere);

    return {
      totalCollected: Number(result?.totalCollected ?? 0),
      totalPending: Number(result?.totalPending ?? 0),
      totalFailed: Number(result?.totalFailed ?? 0),
      totalRefunded: Number(result?.totalRefunded ?? 0),
    };
  });

  // ── Create payment intent for an order ─────────────────────
  app.post('/create-intent', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { orderId } = request.body as { orderId: string };

    const conds = [eq(orders.id, orderId), eq(orders.tenantId, tenantId)];
    if (scope) conds.push(eq(orders.locationId, scope));
    const [order] = await db
      .select()
      .from(orders)
      .where(and(...conds))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    const intent = await createPaymentIntent(order.total, order.orderCode);
    if (!intent) {
      return reply.code(500).send({ error: 'Failed to create payment intent' });
    }

    // Save stripe payment intent ID
    await db
      .update(orders)
      .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  });

  // ── Mark order as paid (for COD/store payments) ────────────
  app.post('/mark-paid', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { orderId } = request.body as { orderId: string };

    const conds = [eq(orders.id, orderId), eq(orders.tenantId, tenantId)];
    if (scope) conds.push(eq(orders.locationId, scope));
    const [order] = await db
      .update(orders)
      .set({ paymentStatus: 'paid', status: 'confirmed', updatedAt: new Date() })
      .where(and(...conds))
      .returning();

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    broadcastSSE(tenantId, { type: 'order:updated', data: order });

    createNotification(
      tenantId,
      'payment',
      `Payment received`,
      `Order ${order.orderCode} has been marked as paid`,
      `/payments`,
      order.locationId,
    ).catch(console.error);

    // Auto-send invoice email
    try {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      let customer: { name: string | null; phone: string | null; email: string | null } = { name: null, phone: null, email: null };
      if (order.customerId) {
        const [c] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
        if (c) customer = c;
      } else if (order.appUserId) {
        const [u] = await db.select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, order.appUserId)).limit(1);
        if (u) customer = u;
      }
      await sendInvoiceEmail(order, items, customer);
    } catch (err) {
      console.error('Failed to send invoice email:', err);
    }

    return { order };
  });

  // ── Process refund ─────────────────────────────────────────
  app.post('/:orderId/refund', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { orderId } = request.params as { orderId: string };
    const { reason } = refundSchema.parse(request.body);

    const conds = [eq(orders.id, orderId), eq(orders.tenantId, tenantId)];
    if (scope) conds.push(eq(orders.locationId, scope));
    const [order] = await db
      .select()
      .from(orders)
      .where(and(...conds))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    // If Stripe payment, attempt refund via Stripe
    if (order.stripePaymentIntentId) {
      try {
        await createRefund(order.stripePaymentIntentId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Stripe refund failed';
        return reply.code(500).send({ error: message });
      }
    }

    // Update order payment status and optionally append reason to notes
    const updatedNotes = reason
      ? [order.notes, `Refund reason: ${reason}`].filter(Boolean).join('\n')
      : order.notes;

    const [updated] = await db
      .update(orders)
      .set({ paymentStatus: 'refunded', notes: updatedNotes, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();

    broadcastSSE(tenantId, { type: 'order:updated', data: updated });

    return { success: true };
  });
}
