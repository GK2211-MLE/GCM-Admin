import type { FastifyInstance } from 'fastify';
import { eq, ne, and, asc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, products } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createCategorySchema, updateCategorySchema } from '../shared/index.js';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Renumber categories within a tenant to a tight 1..N sequence,
 * placing `categoryId` at `position` (1-indexed). Other categories
 * keep their relative order. Mirrors `placeProductAtPosition` in
 * products.ts so categories also enforce unique sortOrder.
 */
async function placeCategoryAtPosition(
  categoryId: string,
  position: number,
  tenantId: string,
): Promise<void> {
  const others = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), ne(categories.id, categoryId)))
    .orderBy(asc(categories.sortOrder));

  const totalAfter = others.length + 1;
  const pos = Math.max(1, Math.min(position, totalAfter));
  const ordered: { id: string }[] = [
    ...others.slice(0, pos - 1),
    { id: categoryId },
    ...others.slice(pos - 1),
  ];

  await Promise.all(
    ordered.map((c, i) =>
      db
        .update(categories)
        .set({ sortOrder: i + 1, updatedAt: new Date() })
        .where(eq(categories.id, c.id)),
    ),
  );
}

export async function categoryRoutes(app: FastifyInstance) {
  // List all categories for tenant (public — used by storefront homepage + bot)
  // Returns each category with a productCount field aggregating active
  // products joined on products.category = categories.slug.
  //
  // Implementation: two cheap queries + JS merge. Earlier we tried a
  // correlated subquery via Drizzle's sql template, but it returned 0 in
  // production (probably due to how the boolean compare or table aliasing
  // gets serialized). Two queries is bulletproof and at our scale (≤ 20
  // categories, ≤ 200 products) the cost is negligible.
  app.get('/', async (request) => {
    const query = request.query as { tenantId?: string; includeInactive?: string };
    // Default behaviour for the customer-facing site: hide categories the
    // admin has marked inactive. The admin catalog page passes
    // ?includeInactive=1 to see everything.
    const includeInactive =
      query.includeInactive === '1' || query.includeInactive === 'true';

    const baseConds = (extra?: ReturnType<typeof eq>) => {
      const parts: ReturnType<typeof eq>[] = [];
      if (query.tenantId) parts.push(eq(categories.tenantId, query.tenantId));
      if (!includeInactive) parts.push(eq(categories.active, true));
      if (extra) parts.push(extra);
      return parts.length === 0 ? undefined : (parts.length === 1 ? parts[0] : and(...parts));
    };

    const catWhere = baseConds();
    const catRows = catWhere
      ? await db.select().from(categories).where(catWhere).orderBy(asc(categories.sortOrder))
      : await db.select().from(categories).orderBy(asc(categories.sortOrder));

    // Aggregate active product counts grouped by (tenantId, category-slug)
    const countRows = query.tenantId
      ? await db
          .select({
            tenantId: products.tenantId,
            slug: products.category,
            count: count(),
          })
          .from(products)
          .where(and(eq(products.tenantId, query.tenantId), eq(products.active, true)))
          .groupBy(products.tenantId, products.category)
      : await db
          .select({
            tenantId: products.tenantId,
            slug: products.category,
            count: count(),
          })
          .from(products)
          .where(eq(products.active, true))
          .groupBy(products.tenantId, products.category);

    // Build a fast lookup keyed by `${tenantId}:${slug}`
    const countMap = new Map<string, number>();
    for (const r of countRows) {
      countMap.set(`${r.tenantId}:${r.slug}`, Number(r.count));
    }

    const result = catRows.map((c) => ({
      ...c,
      productCount: countMap.get(`${c.tenantId}:${c.slug}`) ?? 0,
    }));

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

    // Slot the new category into the requested sortOrder, shifting the
    // rest down by 1. Schema default (0) lands at the top; admin can
    // override by passing a number.
    await placeCategoryAtPosition(category.id, data.sortOrder, tenantId);

    const [refreshed] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, category.id))
      .limit(1);
    return { category: refreshed ?? category };
  });

  // Update category (auth required)
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updateCategorySchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Category not found' });

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

    // Auto-shift sortOrder so values stay unique 1..N within the tenant.
    if (data.sortOrder !== undefined && data.sortOrder !== existing.sortOrder) {
      await placeCategoryAtPosition(id, data.sortOrder, tenantId);
      const [refreshed] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      return { category: refreshed ?? category };
    }

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
