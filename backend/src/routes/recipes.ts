import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { recipes } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function recipeRoutes(app: FastifyInstance) {
  // List all recipes
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const rows = await db.select().from(recipes)
      .where(eq(recipes.tenantId, tenantId))
      .orderBy(desc(recipes.createdAt));
    return { recipes: rows };
  });

  // Get single recipe
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
