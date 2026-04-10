import type { FastifyInstance } from 'fastify';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contactMessages } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function contactMessageRoutes(app: FastifyInstance) {
  // GET / — list all contact messages
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { page = '1', limit = '50' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(contactMessages)
        .where(eq(contactMessages.tenantId, tenantId))
        .orderBy(desc(contactMessages.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ total: count() })
        .from(contactMessages)
        .where(eq(contactMessages.tenantId, tenantId)),
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

  // GET /:id — single message
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [row] = await db
      .select()
      .from(contactMessages)
      .where(and(eq(contactMessages.id, id), eq(contactMessages.tenantId, tenantId)));

    if (!row) return reply.code(404).send({ error: 'Message not found' });
    return { data: row };
  });

  // DELETE /:id — delete message
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const result = await db
      .delete(contactMessages)
      .where(and(eq(contactMessages.id, id), eq(contactMessages.tenantId, tenantId)));

    return { success: true };
  });
}
