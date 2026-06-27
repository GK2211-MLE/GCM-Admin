import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cmsPages } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function cmsRoutes(app: FastifyInstance) {
  // List all pages (admin: all including drafts, scoped to tenant)
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const pages = await db.select().from(cmsPages).where(eq(cmsPages.tenantId, tenantId));
    return { pages };
  });

  // List published pages only — PUBLIC, used by the customer site.
  app.get('/published', async () => {
    const pages = await db.select().from(cmsPages).where(eq(cmsPages.isPublished, true));
    return { pages };
  });

  // Get a single page by slug — PUBLIC. Used by the customer site for
  // about/faq/privacy/terms/returns/shipping etc.
  app.get('/by-slug/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const [page] = await db.select().from(cmsPages)
      .where(and(eq(cmsPages.slug, slug), eq(cmsPages.isPublished, true)))
      .limit(1);
    if (!page) return reply.code(404).send({ error: 'Page not found' });
    return { page };
  });

  // Update page
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const { title, content, isPublished } = request.body as { title?: string; content?: string; isPublished?: boolean };

    const [page] = await db.update(cmsPages).set({
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(isPublished !== undefined ? { isPublished } : {}),
      updatedAt: new Date(),
    }).where(and(eq(cmsPages.id, id), eq(cmsPages.tenantId, tenantId))).returning();

    if (!page) return reply.status(404).send({ error: 'Page not found' });
    return { page };
  });

  // Create page
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { slug, title, content } = request.body as { slug: string; title: string; content: string };
    const [page] = await db.insert(cmsPages).values({ tenantId, slug, title, content }).returning();
    return { page };
  });
}
