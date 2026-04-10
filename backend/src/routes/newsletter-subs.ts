import type { FastifyInstance } from 'fastify';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { newsletterSubs } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function newsletterRoutes(app: FastifyInstance) {
  // GET / — list all subscribers
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { page = '1', limit = '100' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(newsletterSubs)
        .where(eq(newsletterSubs.tenantId, tenantId))
        .orderBy(desc(newsletterSubs.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ total: count() })
        .from(newsletterSubs)
        .where(eq(newsletterSubs.tenantId, tenantId)),
    ]);

    return {
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        pages: Math.ceil(Number(total) / limitNum),
      },
    };
  });

  // GET /export — CSV export
  app.get('/export', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const rows = await db
      .select()
      .from(newsletterSubs)
      .where(eq(newsletterSubs.tenantId, tenantId))
      .orderBy(desc(newsletterSubs.createdAt));

    const csv = ['email,subscribed_at']
      .concat(rows.map((r) => `${r.email},${r.createdAt.toISOString()}`))
      .join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"');
    return csv;
  });

  // DELETE /:id — remove subscriber
  app.delete('/:id', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    await db
      .delete(newsletterSubs)
      .where(and(eq(newsletterSubs.id, id), eq(newsletterSubs.tenantId, tenantId)));

    return { success: true };
  });
}
