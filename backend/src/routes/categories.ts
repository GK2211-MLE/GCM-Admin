import type { FastifyInstance } from 'fastify';
import { eq, and, asc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, products } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createCategorySchema, updateCategorySchema } from '../shared/index.js';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export async function categoryRoutes(app: FastifyInstance) {
  // List all categories for tenant (public — used by storefront homepage + bot)
  // Includes a productCount aggregate (joined on products.category = categories.slug)
  // so the customer site can show "Chicken — 9 products" without an N+1 fetch.
  app.get('/', async (request) => {
    const query = request.query as { tenantId?: string };

    let rows;
    if (query.tenantId) {
      rows = await db
        .select({
          id: categories.id,
          tenantId: categories.tenantId,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          imageUrl: categories.imageUrl,
          active: categories.active,
          sortOrder: categories.sortOrder,
          displayOrder: categories.displayOrder,
          createdAt: categories.createdAt,
          updatedAt: categories.updatedAt,
          productCount: sql<number>`(
            SELECT COUNT(*) FROM ${products}
            WHERE ${products.category} = ${categories.slug}
              AND ${products.tenantId} = ${categories.tenantId}
              AND ${products.active} = true
          )`.as('product_count'),
        })
        .from(categories)
        .where(eq(categories.tenantId, query.tenantId))
        .orderBy(asc(categories.sortOrder));
    } else {
      rows = await db
        .select({
          id: categories.id,
          tenantId: categories.tenantId,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          imageUrl: categories.imageUrl,
          active: categories.active,
          sortOrder: categories.sortOrder,
          displayOrder: categories.displayOrder,
          createdAt: categories.createdAt,
          updatedAt: categories.updatedAt,
          productCount: sql<number>`(
            SELECT COUNT(*) FROM ${products}
            WHERE ${products.category} = ${categories.slug}
              AND ${products.tenantId} = ${categories.tenantId}
              AND ${products.active} = true
          )`.as('product_count'),
        })
        .from(categories)
        .orderBy(asc(categories.sortOrder));
    }

    // Coerce productCount to a JS number — pg returns COUNT(*) as a string
    const result = rows.map((r) => ({ ...r, productCount: Number(r.productCount) }));
    return { categories: result };
  });

  // Get single category
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!category) return reply.code(404).send({ error: 'Category not found' });
    return { category };
  });

  // Create category (auth required)
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const data = createCategorySchema.parse(request.body);

    const slug = data.slug || toSlug(data.name);

    const [category] = await db
      .insert(categories)
      .values({ ...data, slug, tenantId })
      .returning();

    return { category };
  });

  // Update category (auth required)
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updateCategorySchema.parse(request.body);

    // If name changed but slug not provided, regenerate slug
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.name && !data.slug) {
      updateData.slug = toSlug(data.name);
    }

    const [category] = await db
      .update(categories)
      .set(updateData)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .returning();

    if (!category) return reply.code(404).send({ error: 'Category not found' });
    return { category };
  });

  // Get product count for a category
  app.get('/:id/products', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [cat] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.tenantId, tenantId))).limit(1);
    if (!cat) return reply.code(404).send({ error: 'Category not found' });

    const [result] = await db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.category, cat.slug), eq(products.tenantId, tenantId)));

    return { count: result?.count ?? 0 };
  });

  // Delete category (auth required) — also clears category from all products using it
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .limit(1);

    if (!category) return reply.code(404).send({ error: 'Category not found' });

    // Clear category from all products that reference this category (by FK or slug)
    await db
      .update(products)
      .set({ category: '', categoryId: null, updatedAt: new Date() })
      .where(and(eq(products.categoryId, id), eq(products.tenantId, tenantId)));

    await db
      .update(products)
      .set({ category: '', updatedAt: new Date() })
      .where(and(eq(products.category, category.slug), eq(products.tenantId, tenantId)));

    // Delete the category
    await db
      .delete(categories)
      .where(eq(categories.id, id));

    return { success: true, productsCleared: true };
  });

  // Toggle active status (auth required)
  app.patch('/:id/toggle', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: 'Category not found' });

    const [category] = await db
      .update(categories)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();

    return { category };
  });
}
