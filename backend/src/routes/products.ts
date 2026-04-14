import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, asc, desc, ilike, or, sql, inArray, isNull, notExists } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { products, categories, productLocations, locations, orders, orderItems, storeInventory } from '../db/schema.js';
import { authGuard, getLocationScope } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { config } from '../config.js';
import {
  createProductSchema,
  updateProductSchema,
  ROLES,
  normalizeLegacyRole,
} from '../shared/index.js';

/**
 * Reads the optional bearer token from the request and returns the
 * forced location scope (if the caller is a non-admin admin user).
 *
 * Returns null for admin / unauthenticated callers — meaning "no scope
 * pinning". The customer storefront calls these endpoints anonymously
 * and must keep working, so we never throw on missing/invalid tokens.
 */
function tryGetForcedScope(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const raw = jwt.verify(authHeader.slice(7), config.JWT_SECRET) as {
      role?: string;
      assignedLocationId?: string | null;
    };
    if (!raw.role) return null;
    const role = normalizeLegacyRole(raw.role);
    if (role === ROLES.ADMIN) return null;
    return raw.assignedLocationId ?? null;
  } catch {
    return null;
  }
}

/** Lookup the location IDs a product is currently tagged for. */
async function getProductLocationIds(productId: string): Promise<string[]> {
  const rows = await db
    .select({ locationId: productLocations.locationId })
    .from(productLocations)
    .where(eq(productLocations.productId, productId));
  return rows.map((r) => r.locationId);
}

/** Replace the product_locations rows for a product. */
async function setProductLocations(productId: string, locationIds: string[]): Promise<void> {
  await db.delete(productLocations).where(eq(productLocations.productId, productId));
  if (locationIds.length === 0) return;
  await db.insert(productLocations).values(
    locationIds.map((locationId) => ({ productId, locationId })),
  );
}

/**
 * Sync storeInventory rows for a product to match the given locations.
 *   - Creates missing rows with default stock values.
 *   - Removes rows for locations NOT in the list (so the product disappears
 *     from stores it's no longer tagged to).
 *   - If locationIds is empty (catalog-wide / "All locations"), creates
 *     storeInventory rows for ALL active locations so the product appears
 *     in every store's inventory.
 */
async function syncStoreInventory(
  productId: string,
  locationIds: string[],
  tenantId: string,
  defaults: { stockQuantity: number; lowStockThreshold: number },
): Promise<void> {
  // Resolve target locations: specific stores, or ALL active stores
  let targetLocationIds = locationIds;
  if (targetLocationIds.length === 0) {
    const allLocs = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), eq(locations.active, true)));
    targetLocationIds = allLocs.map((l) => l.id);
  }

  if (targetLocationIds.length === 0) return;

  // Find all existing inventory rows for this product
  const existing = await db
    .select({ id: storeInventory.id, locationId: storeInventory.locationId })
    .from(storeInventory)
    .where(eq(storeInventory.productId, productId));

  const locationSet = new Set(targetLocationIds);
  const existingLocationSet = new Set(existing.map((r) => r.locationId));

  // Remove rows for locations no longer in the list (only when specific stores selected)
  if (locationIds.length > 0) {
    const toRemove = existing.filter((r) => !locationSet.has(r.locationId));
    if (toRemove.length > 0) {
      await db.delete(storeInventory).where(
        inArray(storeInventory.id, toRemove.map((r) => r.id)),
      );
    }
  }

  // Add rows for locations not yet in inventory
  const toAdd = targetLocationIds.filter((id) => !existingLocationSet.has(id));
  if (toAdd.length > 0) {
    await db.insert(storeInventory).values(
      toAdd.map((locationId) => ({
        productId,
        locationId,
        stockQuantity: defaults.stockQuantity,
        lowStockThreshold: defaults.lowStockThreshold,
      })),
    );
  }
}

export async function productRoutes(app: FastifyInstance) {
  // List distinct categories from all products
  app.get('/categories', async () => {
    const rows = await db
      .select({ category: products.category })
      .from(products)
      .groupBy(products.category)
      .orderBy(asc(products.category));
    return { categories: rows.map((r) => r.category) };
  });

  // ── Local Favourites ───────────────────────────────────────────
  // PUBLIC endpoint for the customer homepage "Local Favourites" section.
  //
  // Logic (two-phase):
  //   Phase 2 (data-driven): When `?locationId=X` is passed AND that
  //     location has enough orders, return the top-ordered products at
  //     that location sorted by total quantity sold. This makes the
  //     section genuinely "local" — a Plano customer sees what Plano
  //     actually buys most.
  //   Phase 1 (curated fallback): When there aren't enough location-
  //     specific orders (< 3 distinct products sold), return products
  //     NOT in the top-6 bestsellers so the section surfaces items that
  //     would otherwise get buried. Sorted by sortOrder to let admin
  //     control the curation.
  //
  // Returns up to `?limit=N` products (default 8).
  app.get('/local-favourites', async (request) => {
    const query = request.query as { locationId?: string; limit?: string; excludeIds?: string };
    const limit = Math.max(1, Math.min(20, parseInt(query.limit || '8', 10)));
    const locationId = query.locationId || null;
    // Exclude product IDs already shown in the bestsellers section
    const excludeIds = query.excludeIds
      ? query.excludeIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    // Phase 2: try location-based top sellers
    if (locationId) {
      const topAtLocation = await db
        .select({
          productId: orderItems.productId,
          totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(eq(orders.locationId, locationId))
        .groupBy(orderItems.productId)
        .orderBy(desc(sql`sum(${orderItems.quantity})`))
        .limit(limit + excludeIds.length + 5); // fetch extra to compensate for exclusions

      const topProductIds = topAtLocation
        .map((r) => r.productId)
        .filter((id) => !excludeIds.includes(id))
        .slice(0, limit);

      if (topProductIds.length >= 3) {
        // Enough data — fetch full product rows in the ranked order
        const rows = await db
          .select()
          .from(products)
          .where(
            and(
              inArray(products.id, topProductIds),
              eq(products.active, true),
            ),
          );
        // Re-sort to match the ranked order from the aggregation
        const byId = new Map(rows.map((r) => [r.id, r]));
        const sorted = topProductIds.map((id) => byId.get(id)).filter(Boolean);
        return { products: sorted, source: 'location' };
      }
    }

    // Phase 1: curated fallback — products NOT in the bestsellers
    const conditions: ReturnType<typeof eq>[] = [eq(products.active, true)];
    if (excludeIds.length > 0) {
      conditions.push(sql`${products.id} NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`);
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), desc(products.createdAt))
      .limit(limit);

    return { products: rows, source: 'curated' };
  });

  // List products. PUBLIC endpoint — used by both the admin frontend AND the
  // customer storefront. Per-location filtering rules:
  //
  //   1. If the caller is an authenticated non-admin admin user, force their
  //      assigned location no matter what they pass in the query string. This
  //      stops a Plano store_manager from snooping the Frisco catalog.
  //   2. Otherwise honor `?locationId=X` (used by the customer site after
  //      the shopper picks a store).
  //   3. A product is "available at" a location when EITHER it has a row in
  //      product_locations for that location, OR it has zero rows at all
  //      (the catalog-wide default).
  app.get('/', async (request) => {
    const query = request.query as {
      tenantId?: string;
      category?: string;
      active?: string;
      search?: string;
      limit?: string;
      featured?: string;
      locationId?: string;
    };

    const forcedScope = tryGetForcedScope(request);
    const effectiveLocationId = forcedScope ?? query.locationId ?? null;

    let conditions = [];
    if (query.tenantId) conditions.push(eq(products.tenantId, query.tenantId));
    if (query.category) conditions.push(eq(products.category, query.category));
    if (query.active !== undefined) conditions.push(eq(products.active, query.active === 'true'));
    if (query.featured !== undefined) conditions.push(eq(products.featured, query.featured === 'true'));
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(
        or(
          ilike(products.name, term),
          ilike(products.description, term),
          ilike(products.category, term),
        )!,
      );
    }

    // Location visibility predicate, applied via raw SQL EXISTS so it
    // composes cleanly with the existing where clause.
    if (effectiveLocationId) {
      conditions.push(
        sql`(
          NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id})
          OR EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id} AND pl.location_id = ${effectiveLocationId})
        )`,
      );
    }

    const parsedLimit = query.limit ? Math.max(1, Math.min(200, parseInt(query.limit, 10))) : null;

    let qb = conditions.length > 0
      ? db.select().from(products).where(and(...conditions)).orderBy(asc(products.sortOrder)).$dynamic()
      : db.select().from(products).orderBy(asc(products.sortOrder)).$dynamic();

    if (parsedLimit !== null && !Number.isNaN(parsedLimit)) {
      qb = qb.limit(parsedLimit);
    }

    const rows = await qb;
    return { products: rows };
  });

  // Get single product. Includes the locationIds the product is tagged for
  // (empty array = available at all locations). Same scope rule as the list
  // endpoint: a non-admin admin user gets a 404 for a product that is not
  // visible at their assigned location.
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) return reply.code(404).send({ error: 'Product not found' });

    const locationIds = await getProductLocationIds(product.id);

    const forcedScope = tryGetForcedScope(request);
    if (forcedScope) {
      const visible = locationIds.length === 0 || locationIds.includes(forcedScope);
      if (!visible) return reply.code(404).send({ error: 'Product not found' });
    }

    return { product: { ...product, locationIds } };
  });

  // Create product (admin or store_manager).
  // Non-admin callers can only create products that are pinned to their
  // assigned location and may NOT create catalog-wide products.
  app.post('/', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const data = createProductSchema.parse(request.body);
    const role = request.user!.role;

    if (role === ROLES.STORE_STAFF) {
      return reply.code(403).send({ error: 'Store staff cannot create products' });
    }

    // Resolve the desired location set.
    let locationIdsToWrite: string[];
    if (role === ROLES.ADMIN) {
      // Admin: empty / undefined = "all locations" (no rows). Otherwise
      // verify each ID belongs to this tenant.
      locationIdsToWrite = data.locationIds ?? [];
    } else {
      // store_manager: must include their assigned location and ONLY their
      // assigned location. We silently override whatever the client sent.
      const myLoc = request.user!.assignedLocationId;
      if (!myLoc) {
        return reply.code(403).send({ error: 'Account is not assigned to a location' });
      }
      locationIdsToWrite = [myLoc];
    }

    // Validate every locationId belongs to this tenant.
    if (locationIdsToWrite.length > 0) {
      const validLocs = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.tenantId, tenantId), inArray(locations.id, locationIdsToWrite)));
      if (validLocs.length !== locationIdsToWrite.length) {
        return reply.code(400).send({ error: 'One or more locations are invalid for this tenant' });
      }
    }

    // Auto-resolve categoryId from category slug
    let categoryId: string | undefined;
    if (data.category) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.tenantId, tenantId), ilike(categories.slug, data.category)))
        .limit(1);
      if (cat) categoryId = cat.id;
    }

    const images = data.imageUrl ? [data.imageUrl] : undefined;

    // Strip locationIds from the insert payload — it's not a column on products.
    const { locationIds: _ignoreLocationIds, ...productInsert } = data;

    const [product] = await db
      .insert(products)
      .values({
        ...productInsert,
        tenantId,
        categoryId: categoryId ?? null,
        ...(images ? { images } : {}),
      })
      .returning();

    await setProductLocations(product.id, locationIdsToWrite);

    // Auto-create storeInventory rows so the product appears in per-store inventory
    await syncStoreInventory(product.id, locationIdsToWrite, tenantId, {
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
    });

    return { product: { ...product, locationIds: locationIdsToWrite } };
  });

  // Update product
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updateProductSchema.parse(request.body);
    const role = request.user!.role;

    if (role === ROLES.STORE_STAFF) {
      return reply.code(403).send({ error: 'Store staff cannot edit products' });
    }

    // Verify the product exists and is visible to this caller.
    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Product not found' });

    if (role !== ROLES.ADMIN) {
      const myLoc = request.user!.assignedLocationId;
      if (!myLoc) return reply.code(403).send({ error: 'Account is not assigned to a location' });
      const currentLocs = await getProductLocationIds(id);
      // Non-admin can only edit products that are tagged to their location.
      // Catalog-wide products (no rows) are admin-only territory.
      if (currentLocs.length === 0 || !currentLocs.includes(myLoc)) {
        return reply.code(404).send({ error: 'Product not found' });
      }
    }

    // Resolve new location set if the field was sent.
    let newLocationIds: string[] | null = null;
    if (data.locationIds !== undefined) {
      if (role === ROLES.ADMIN) {
        newLocationIds = data.locationIds;
      } else {
        // store_manager: ignore the client's value, force their location.
        newLocationIds = [request.user!.assignedLocationId!];
      }

      if (newLocationIds.length > 0) {
        const validLocs = await db
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.tenantId, tenantId), inArray(locations.id, newLocationIds)));
        if (validLocs.length !== newLocationIds.length) {
          return reply.code(400).send({ error: 'One or more locations are invalid for this tenant' });
        }
      }
    }

    let categoryId: string | undefined;
    if (data.category) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.tenantId, tenantId), ilike(categories.slug, data.category)))
        .limit(1);
      if (cat) categoryId = cat.id;
    }

    const images = data.imageUrl ? [data.imageUrl] : undefined;

    let slug: string | undefined;
    if (data.slug !== undefined) {
      slug = data.slug.trim() || undefined;
    }
    if (!slug && data.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    const { locationIds: _ignoreLocationIds, ...productUpdate } = data;

    const [product] = await db
      .update(products)
      .set({
        ...productUpdate,
        ...(categoryId ? { categoryId } : {}),
        ...(images ? { images } : {}),
        ...(slug ? { slug } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!product) return reply.code(404).send({ error: 'Product not found' });

    if (newLocationIds !== null) {
      await setProductLocations(id, newLocationIds);

      // Auto-create storeInventory rows for newly added locations
      await syncStoreInventory(id, newLocationIds, tenantId, {
        stockQuantity: product.stockQuantity,
        lowStockThreshold: product.lowStockThreshold,
      });
    }

    const finalLocationIds = await getProductLocationIds(id);
    return { product: { ...product, locationIds: finalLocationIds } };
  });

  // Delete product
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const role = request.user!.role;

    if (role === ROLES.STORE_STAFF) {
      return reply.code(403).send({ error: 'Store staff cannot delete products' });
    }

    if (role !== ROLES.ADMIN) {
      const myLoc = request.user!.assignedLocationId;
      if (!myLoc) return reply.code(403).send({ error: 'Account is not assigned to a location' });
      const currentLocs = await getProductLocationIds(id);
      if (currentLocs.length === 0 || !currentLocs.includes(myLoc)) {
        return reply.code(404).send({ error: 'Product not found' });
      }
      // Store managers cannot hard-delete a SKU outright — that affects the
      // canonical product. Instead they should remove their location from
      // the product's location list. Block the operation explicitly.
      return reply.code(403).send({
        error: 'Store managers cannot delete products. Untag the location instead.',
      });
    }

    // FK ON DELETE CASCADE on product_locations cleans up the join rows.
    const [product] = await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { success: true };
  });

  // Toggle active status
  app.patch('/:id/toggle', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const role = request.user!.role;

    if (role === ROLES.STORE_STAFF) {
      return reply.code(403).send({ error: 'Store staff cannot toggle products' });
    }

    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Product not found' });

    if (role !== ROLES.ADMIN) {
      const myLoc = request.user!.assignedLocationId;
      if (!myLoc) return reply.code(403).send({ error: 'Account is not assigned to a location' });
      const currentLocs = await getProductLocationIds(id);
      if (currentLocs.length === 0 || !currentLocs.includes(myLoc)) {
        return reply.code(404).send({ error: 'Product not found' });
      }
    }

    const [product] = await db
      .update(products)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    return { product };
  });

  // Toggle stock
  app.patch('/:id/stock', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const { inStock } = request.body as { inStock: boolean };
    const role = request.user!.role;

    if (role === ROLES.STORE_STAFF) {
      return reply.code(403).send({ error: 'Store staff cannot toggle stock' });
    }

    if (role !== ROLES.ADMIN) {
      const myLoc = request.user!.assignedLocationId;
      if (!myLoc) return reply.code(403).send({ error: 'Account is not assigned to a location' });
      const currentLocs = await getProductLocationIds(id);
      if (currentLocs.length === 0 || !currentLocs.includes(myLoc)) {
        return reply.code(404).send({ error: 'Product not found' });
      }
    }

    const [product] = await db
      .update(products)
      .set({ inStock, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });
}
