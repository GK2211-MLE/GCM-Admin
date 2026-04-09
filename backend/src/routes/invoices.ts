import type { FastifyInstance } from 'fastify';
import { eq, and, desc, count, gte, lte, ilike, or, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, customers, appUsers } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { invoiceFilterSchema, formatCents } from '../shared/index.js';
import { generateInvoiceHtml, sendInvoiceEmail } from '../services/invoice.js';

export async function invoiceRoutes(app: FastifyInstance) {
  // List invoices (paid orders)
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const filters = invoiceFilterSchema.parse(request.query);
    const offset = (filters.page - 1) * filters.limit;

    const conditions = [
      eq(orders.tenantId, tenantId),
      eq(orders.paymentStatus, 'paid'),
      ne(orders.status, 'cancelled'),
    ];

    if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
    if (filters.search) {
      conditions.push(
        or(
          ilike(orders.orderCode, `%${filters.search}%`),
          ilike(customers.name, `%${filters.search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    // When searching by customer name we need the join in the count query too
    const baseQuery = db
      .select({
        id: orders.id,
        orderCode: orders.orderCode,
        customerId: orders.customerId,
        appUserId: orders.appUserId,
        subtotal: orders.subtotal,
        tax: orders.tax,
        deliveryFee: orders.deliveryFee,
        total: orders.total,
        paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        appUserName: appUsers.name,
        appUserPhone: appUsers.phone,
        appUserEmail: appUsers.email,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(appUsers, eq(orders.appUserId, appUsers.id));

    const countQuery = db
      .select({ total: count() })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(appUsers, eq(orders.appUserId, appUsers.id));

    const [rows, [{ total }]] = await Promise.all([
      baseQuery
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(filters.limit)
        .offset(offset),
      countQuery.where(where),
    ]);

    const invoices = rows.map((row) => ({
      invoiceNumber: `INV-${row.orderCode}`,
      orderId: row.id,
      orderCode: row.orderCode,
      customerName: row.customerName || row.appUserName || 'Unknown',
      customerPhone: row.customerPhone || row.appUserPhone || '',
      customerEmail: row.customerEmail || row.appUserEmail || '',
      subtotal: row.subtotal,
      tax: row.tax,
      deliveryFee: row.deliveryFee,
      total: row.total,
      paymentMethod: row.paymentMethod,
      createdAt: row.createdAt,
    }));

    return { invoices, total };
  });

  // Single invoice detail
  app.get('/:orderId', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { orderId } = request.params as { orderId: string };

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId), eq(orders.paymentStatus, 'paid')))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Invoice not found' });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let customer: { name: string | null; phone: string; email: string | null } | undefined;
    if (order.customerId) {
      customer = (await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0];
    } else if (order.appUserId) {
      const [u] = await db.select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, order.appUserId)).limit(1);
      if (u) customer = u;
    }

    const taxRate = order.subtotal > 0 ? order.tax / order.subtotal : 0;

    return {
      invoice: {
        invoiceNumber: `INV-${order.orderCode}`,
        orderId: order.id,
        orderCode: order.orderCode,
        customerName: customer?.name || 'Unknown',
        customerPhone: customer?.phone || '',
        customerEmail: customer?.email || '',
        subtotal: order.subtotal,
        tax: order.tax,
        deliveryFee: order.deliveryFee,
        total: order.total,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        taxRate: Math.round(taxRate * 10000) / 10000,
        items: items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      },
    };
  });

  // Print-friendly HTML invoice
  app.get('/:orderId/html', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { orderId } = request.params as { orderId: string };

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId), eq(orders.paymentStatus, 'paid')))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Invoice not found' });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let customer: { name: string | null; phone: string | null; email: string | null } = { name: null, phone: null, email: null };
    if (order.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
      if (c) customer = c;
    } else if (order.appUserId) {
      const [u] = await db.select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, order.appUserId)).limit(1);
      if (u) customer = u;
    }

    const html = generateInvoiceHtml(order, items, customer);
    reply.header('Content-Type', 'text/html');
    return html;
  });

  // Send invoice email to customer
  app.post('/:orderId/send-email', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { orderId } = request.params as { orderId: string };

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId), eq(orders.paymentStatus, 'paid')))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Invoice not found' });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let customer: { name: string | null; phone: string | null; email: string | null } = { name: null, phone: null, email: null };
    if (order.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
      if (c) customer = c;
    } else if (order.appUserId) {
      const [u] = await db.select({ name: appUsers.name, phone: appUsers.phone, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, order.appUserId)).limit(1);
      if (u) customer = u;
    }

    if (!customer.email) return reply.code(422).send({ error: 'Customer has no email address' });

    await sendInvoiceEmail(order, items, customer);
    return { success: true };
  });
}
