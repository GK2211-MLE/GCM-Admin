import type { FastifyInstance } from 'fastify';
import { eq, ne, and, asc, count, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, products, categoryLocations, locations } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createCategorySchema, updateCategorySchema, ROLES } from '../shared/index.js';

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
    const query = request.query as { tenantId?: string; includeInactive?: string; locationId?: string };
    // Default behaviour for the customer-facing site: hide categories the
    // admin has marked inactive. The admin catalog page passes
    // ?includeInactive=1 to see everything.
    const includeInactive =
      query.includeInactive === '1' || query.includeInactive === 'true';
    const locationId = query.locationId || null;

    const baseConds = (extra?: ReturnType<typeof eq>) => {
      const parts: ReturnType<typeof eq>[] = [];
      if (query.tenantId) parts.push(eq(categories.tenantId, query.tenantId));
      if (!includeInactive) parts.push(eq(categories.active, true));
      // Per-location category visibility: a category is visible at a
      // location when EITHER it has zero rows in category_locations
      // (catalog-wide default) OR it has a row for this location.
      // Mirrors the product_locations rule.
      if (locationId) {
        parts.push(sql`(
          NOT EXISTS (SELECT 1 FROM category_locations cl WHERE cl.category_id = ${categories.id})
          OR EXISTS (SELECT 1 FROM category_locations cl WHERE cl.category_id = ${categories.id} AND cl.location_id = ${locationId})
        )` as any);
      }
      if (extra) parts.push(extra);
      return parts.length === 0 ? undefined : (parts.length === 1 ? parts[0] : and(...parts));
    };

    const catWhere = baseConds();
    const catRows = catWhere
      ? await db.select().from(categories).where(catWhere).orderBy(asc(categories.sortOrder))
      : await db.select().from(categories).orderBy(asc(categories.sortOrder));

    // Aggregate active product counts grouped by (tenantId, category-slug).
    // When a locationId is in scope, also restrict the count to products
    // that are actually visible at that store — so the customer doesn't
    // see "Lamb (8 products)" pill that returns nothing when clicked.
    const productConds: any[] = [eq(products.active, true)];
    if (query.tenantId) productConds.push(eq(products.tenantId, query.tenantId));
    if (locationId) {
      productConds.push(sql`(
        NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id})
        OR EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id} AND pl.location_id = ${locationId})
      )` as any);
    }
    const countRows = await db
      .select({
        tenantId: products.tenantId,
        slug: products.category,
        count: count(),
      })
      .from(products)
      .where(and(...productConds))
      .groupBy(products.tenantId, products.category);

    // Build a fast lookup keyed by `${tenantId}:${slug}`
    const countMap = new Map<string, number>();
    for (const r of countRows) {
      countMap.set(`${r.tenantId}:${r.slug}`, Number(r.count));
    }

    // Per-category location-availability rows (only meaningful for admin
    // — customer doesn't render anything off this field). One query
    // grouped by categoryId, then merged into each row.
    const allLocRows = catRows.length > 0
      ? await db
          .select({
            categoryId: categoryLocations.categoryId,
            locationId: categoryLocations.locationId,
          })
          .from(categoryLocations)
          .where(inArray(categoryLocations.categoryId, catRows.map((c) => c.id)))
      : [];
    const locByCategory = new Map<string, string[]>();
    for (const r of allLocRows) {
      const arr = locByCategory.get(r.categoryId) ?? [];
      arr.push(r.locationId);
      locByCategory.set(r.categoryId, arr);
    }

    const result = catRows.map((c) => ({
      ...c,
      productCount: countMap.get(`${c.tenantId}:${c.slug}`) ?? 0,
      // Empty array = available everywhere (catalog-wide). Otherwise
      // explicit allow-list of location UUIDs.
      locationIds: locByCategory.get(c.id) ?? [],
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

  // ── Per-store category availability toggle ───────────────────────
  // Mirrors POST /products/:id/availability/:locationId. Same 4-state
  // transition handling via the same catalog-wide ↔ specific-locations
  // semantics. Lets admin hide a whole category at one store while
  // keeping it elsewhere — independent of per-product visibility.
  app.post(
    '/:id/availability/:locationId',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id, locationId } = request.params as { id: string; locationId: string };
      const { available } = request.body as { available: boolean };
      const role = request.user!.role;

      if (role !== ROLES.ADMIN) {
        // Categories are tenant-wide settings; only admin can toggle.
        return reply.code(403).send({ error: 'Only admin can toggle category availability' });
      }

      // Verify category belongs to tenant.
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
        .limit(1);
      if (!cat) return reply.code(404).send({ error: 'Category not found' });

      // Verify location belongs to tenant.
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
        .limit(1);
      if (!loc) return reply.code(400).send({ error: 'Invalid location for this tenant' });

      // Read current state.
      const currentRows = await db
        .select({ locationId: categoryLocations.locationId })
        .from(categoryLocations)
        .where(eq(categoryLocations.categoryId, id));
      const currentLocs = currentRows.map((r) => r.locationId);
      const wasCatalogWide = currentLocs.length === 0;
      const wasIncludedHere = currentLocs.includes(locationId);

      if (available) {
        if (wasCatalogWide || wasIncludedHere) {
          return { categoryId: id, locationIds: currentLocs, changed: false };
        }
        // Add this location to the existing specific-locations set.
        await db.insert(categoryLocations).values({ categoryId: id, locationId });
        return { categoryId: id, locationIds: [...currentLocs, locationId], changed: true };
      }

      // available === false
      if (wasCatalogWide) {
        // Fork: list every active location in this tenant, exclude this one.
        const allActive = await db
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.tenantId, tenantId), eq(locations.active, true)));
        const next = allActive.map((l) => l.id).filter((lid) => lid !== locationId);
        if (next.length === 0) {
          return reply.code(409).send({
            error: 'Cannot disable a catalog-wide category at the only active location.',
          });
        }
        await db.insert(categoryLocations).values(
          next.map((lid) => ({ categoryId: id, locationId: lid })),
        );
        return { categoryId: id, locationIds: next, changed: true };
      }
      if (!wasIncludedHere) {
        return { categoryId: id, locationIds: currentLocs, changed: false };
      }
      // Drop just this row.
      await db
        .delete(categoryLocations)
        .where(and(eq(categoryLocations.categoryId, id), eq(categoryLocations.locationId, locationId)));
      return { categoryId: id, locationIds: currentLocs.filter((l) => l !== locationId), changed: true };
    },
  );

  // GET /:id/locations — return the location-availability set for one
  // category. Admin uses this to render checked/unchecked toggles.
  app.get('/:id/locations', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .limit(1);
    if (!cat) return reply.code(404).send({ error: 'Category not found' });
    const rows = await db
      .select({ locationId: categoryLocations.locationId })
      .from(categoryLocations)
      .where(eq(categoryLocations.categoryId, id));
    return { categoryId: id, locationIds: rows.map((r) => r.locationId) };
  });
}
