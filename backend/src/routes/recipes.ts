import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { recipes } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function recipeRoutes(app: FastifyInstance) {
  // List recipes — PUBLIC. Authenticated callers (admin) see drafts too;
  // anonymous callers (customer site) only see published recipes. The
  // customer site doesn't pass a tenantId; in single-tenant deployments
  // this returns the only tenant's recipes which is the desired behavior.
  app.get('/', async (request) => {
    const query = request.query as { tenantId?: string; published?: string };
    const isAdmin = !!request.headers.authorization;
    const conditions = [];
    if (query.tenantId) conditions.push(eq(recipes.tenantId, query.tenantId));
    if (!isAdmin) conditions.push(eq(recipes.isPublished, true));
    if (query.published === 'true') conditions.push(eq(recipes.isPublished, true));

    const rows = conditions.length > 0
      ? await db.select().from(recipes).where(and(...conditions)).orderBy(desc(recipes.createdAt))
      : await db.select().from(recipes).orderBy(desc(recipes.createdAt));
    return { recipes: rows };
  });

  // Get single recipe by slug — PUBLIC. Used by the customer recipes page.
  // Defined BEFORE /:id so the literal "by-slug" prefix isn't captured by
  // the UUID route.
  app.get('/by-slug/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const [recipe] = await db.select().from(recipes)
      .where(and(eq(recipes.slug, slug), eq(recipes.isPublished, true)))
      .limit(1);
    if (!recipe) return reply.code(404).send({ error: 'Recipe not found' });
    return { recipe };
  });

  // Get single recipe by id — admin-only (drafts can be inspected here).
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const [recipe] = await db.select().from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId))).limit(1);
    if (!recipe) return reply.code(404).send({ error: 'Recipe not found' });
    return { recipe };
  });

  // Create recipe
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const body = request.body as Record<string, unknown>;
    const slug = (body.title as string || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [recipe] = await db.insert(recipes).values({
      tenantId,
      title: body.title as string,
      slug,
      description: (body.description as string) || '',
      ingredients: (body.ingredients as string) || '',
      instructions: (body.instructions as string) || '',
      imageUrl: (body.imageUrl as string) || '',
      category: (body.category as string) || '',
      prepTime: (body.prepTime as string) || '',
      cookTime: (body.cookTime as string) || '',
      servings: (body.servings as string) || '',
      isPublished: body.isPublished !== false,
    }).returning();
    return { recipe };
  });

  // Update recipe
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'ingredients', 'instructions', 'imageUrl', 'category', 'prepTime', 'cookTime', 'servings']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.isPublished !== undefined) updates.isPublished = body.isPublished;
    if (body.title) updates.slug = (body.title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [recipe] = await db.update(recipes).set(updates)
      .where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId))).returning();
    if (!recipe) return reply.code(404).send({ error: 'Recipe not found' });
    return { recipe };
  });

  // Delete recipe
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const [recipe] = await db.delete(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId))).returning();
    if (!recipe) return reply.code(404).send({ error: 'Recipe not found' });
    return { success: true };
  });
}
