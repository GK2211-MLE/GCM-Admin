import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or, count, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db/client.js';
import { customers, orders, appUsers } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { paginationSchema, createCustomerSchema } from '../shared/index.js';

export async function customerRoutes(app: FastifyInstance) {
  // List customers (merged from both customers and app_users tables)
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const query = request.query as { page?: string; limit?: string; search?: string };
    const { page, limit } = paginationSchema.parse(query);
    const offset = (page - 1) * limit;

    // Build search filter for both tables
    const searchFilter = query.search
      ? `AND (name ILIKE '%${query.search.replace(/'/g, "''")}%' OR phone ILIKE '%${query.search.replace(/'/g, "''")}%' OR email ILIKE '%${query.search.replace(/'/g, "''")}%')`
      : '';

    // Union both customer sources into a single list (camelCase aliases for frontend)
    const result = await db.execute(sql`
      SELECT * FROM (
        SELECT
          id, tenant_id as "tenantId", name, phone, email, 'bot' as source,
          total_orders as "totalOrders", total_spent as "totalSpent", last_order_at as "lastOrderAt",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM customers
        WHERE tenant_id = ${tenantId}
        UNION ALL
        SELECT
          au.id, au.tenant_id as "tenantId", au.name, au.phone, au.email, 'app' as source,
          COALESCE(os.cnt, 0)::int as "totalOrders",
          COALESCE(os.spent, 0)::int as "totalSpent",
          os.last_at as "lastOrderAt",
          au.created_at as "createdAt", au.updated_at as "updatedAt"
        FROM app_users au
        LEFT JOIN (
          SELECT app_user_id, count(*)::int as cnt, sum(total)::int as spent, max(created_at) as last_at
          FROM orders WHERE app_user_id IS NOT NULL GROUP BY app_user_id
        ) os ON os.app_user_id = au.id
        WHERE au.tenant_id = ${tenantId} AND au.role = 'customer'
      ) combined
      WHERE 1=1 ${sql.raw(searchFilter)}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT count(*)::int as total FROM (
        SELECT id, name, phone, email, created_at FROM customers WHERE tenant_id = ${tenantId}
        UNION ALL
        SELECT id, name, phone, email, created_at FROM app_users WHERE tenant_id = ${tenantId} AND role = 'customer'
      ) combined
      WHERE 1=1 ${sql.raw(searchFilter)}
    `);

    const total = (countResult as any)[0]?.total ?? 0;

    return {
      customers: result as unknown[],
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  });

  // Get single customer with order history
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    // Check customers table first, then app_users
    let customer: Record<string, unknown> | undefined;
    let customerOrders;

    const [botCustomer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
      .limit(1);

    if (botCustomer) {
      customer = botCustomer;
      customerOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.customerId, id))
        .orderBy(desc(orders.createdAt))
        .limit(50);
    } else {
      const [appUser] = await db
        .select()
        .from(appUsers)
        .where(and(eq(appUsers.id, id), eq(appUsers.tenantId, tenantId)))
        .limit(1);

      if (!appUser) return reply.code(404).send({ error: 'Customer not found' });

      customerOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.appUserId, id))
        .orderBy(desc(orders.createdAt))
        .limit(50);

      const totalOrders = customerOrders.length;
      const totalSpent = customerOrders.reduce((sum, o) => sum + o.total, 0);

      customer = {
        id: appUser.id,
        tenantId: appUser.tenantId,
        name: appUser.name,
        phone: appUser.phone,
        email: appUser.email,
        source: 'app',
        totalOrders,
        totalSpent,
        createdAt: appUser.createdAt,
        updatedAt: appUser.updatedAt,
      };
    }

    return { customer, orders: customerOrders };
  });

  // Create customer
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const data = createCustomerSchema.parse(request.body);

    const [customer] = await db
      .insert(customers)
      .values({ ...data, tenantId })
      .returning();

    return { customer };
  });

  // Update customer
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = request.body as Record<string, unknown>;

    const [customer] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
      .returning();

    if (!customer) return reply.code(404).send({ error: 'Customer not found' });
    return { customer };
  });

  // Admin: reset an app_user (customer-website account) password by email.
  // Used when a customer can't access their email and the admin needs to
  // hand them a new password directly. Requires admin auth.
  app.post('/app-users/reset-password', { preHandler: [authGuard] }, async (request, reply) => {
    const body = request.body as { email?: string; newPassword?: string };
    if (!body?.email || !body?.newPassword) {
      return reply.code(400).send({ error: 'email and newPassword are required' });
    }
    if (body.newPassword.length < 6) {
      return reply.code(400).send({ error: 'newPassword must be at least 6 characters' });
    }

    const tenantId = getTenantId(request);
    const emailLower = body.email.trim().toLowerCase();

    const [user] = await db
      .select({ id: appUsers.id, email: appUsers.email })
      .from(appUsers)
      .where(and(eq(appUsers.email, emailLower), eq(appUsers.tenantId, tenantId)))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'No app_user found with that email' });

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await db
      .update(appUsers)
      .set({ passwordHash, refreshToken: null, updatedAt: new Date() })
      .where(eq(appUsers.id, user.id));

    return { success: true, email: user.email };
  });
}
