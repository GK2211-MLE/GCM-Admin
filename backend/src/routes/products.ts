import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, ne, and, asc, desc, ilike, or, sql, inArray, isNull, notExists } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { products, categories, productLocations, locations, orders, orderItems, cartItems, storeInventory } from '../db/schema.js';
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

/**
 * Lookup per-location price overrides for a product. Returns a map keyed
 * by locationId; missing keys (or null values) mean "inherit base price".
 */
async function getProductLocationPrices(productId: string): Promise<Record<string, number | null>> {
  const rows = await db
    .select({
      locationId: productLocations.locationId,
      priceOverrideCents: productLocations.priceOverrideCents,
    })
    .from(productLocations)
    .where(eq(productLocations.productId, productId));
  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.locationId] = r.priceOverrideCents;
  return out;
}

/**
 * Replace the product_locations rows for a product.
 * `locationPrices` (optional) maps locationId → price in cents (or null
 * for "inherit base"). Locations not in the map get null too.
 */
async function setProductLocations(
  productId: string,
  locationIds: string[],
  locationPrices?: Record<string, number | null>,
): Promise<void> {
  await db.delete(productLocations).where(eq(productLocations.productId, productId));
  if (locationIds.length === 0) return;
  await db.insert(productLocations).values(
    locationIds.map((locationId) => ({
      productId,
      locationId,
      priceOverrideCents: locationPrices?.[locationId] ?? null,
    })),
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

/**
 * Renumber a single category's products to a tight 1..N sequence,
 * placing `productId` at `position` (1-indexed). Other products keep
 * their relative order. Used by POST and PUT to enforce the rule that
 * sortOrder is unique inside a category and that bumping one entry
 * cascades the rest.
 *
 * If `productId` isn't currently in the category, it's added at the
 * desired position. If it IS in the category it's lifted out and
 * re-inserted at `position`.
 */
async function placeProductAtPosition(
  productId: string,
  position: number,
  category: string,
  tenantId: string,
): Promise<void> {
  if (!category) return;
  const others = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.category, category),
        ne(products.id, productId),
      ),
    )
    .orderBy(asc(products.sortOrder), desc(products.createdAt));

  const totalAfter = others.length + 1;
  const pos = Math.max(1, Math.min(position, totalAfter));
  const ordered: { id: string }[] = [
    ...others.slice(0, pos - 1),
    { id: productId },
    ...others.slice(pos - 1),
  ];

  await Promise.all(
    ordered.map((p, i) =>
      db
        .update(products)
        .set({ sortOrder: i + 1, updatedAt: new Date() })
        .where(eq(products.id, p.id)),
    ),
  );
}

/**
 * Tighten a category's product sortOrder to 1..N preserving current
 * order. Used after a product moves OUT of a category, to close the
 * gap left behind.
 */
async function renumberCategoryProducts(
  category: string,
  tenantId: string,
): Promise<void> {
  if (!category) return;
  const all = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.category, category)))
    .orderBy(asc(products.sortOrder), desc(products.createdAt));

  await Promise.all(
    all.map((p, i) =>
      db
        .update(products)
        .set({ sortOrder: i + 1, updatedAt: new Date() })
        .where(eq(products.id, p.id)),
    ),
  );
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

    // Two-level sort:
    //   1. categories.sortOrder — the order admin set in the Catalog
    //      page. Drives the "All" view: products of the first-listed
    //      category come before products of the second, etc.
    //   2. products.sortOrder — drives the order within each category
    //      (and the order in a single-category page like /shop?category=Lamb).
    //   3. products.createdAt DESC — tiebreaker so the newest SKU wins
    //      when both sortOrders are equal.
    // Joining via products.category (slug) = categories.slug. Products
    // whose category slug doesn't match any categories row (orphaned)
    // sort last because LEFT JOIN nulls become NULL which Postgres
    // sorts last on ASC by default.
    const orderCols = [
      asc(categories.sortOrder),
      asc(products.sortOrder),
      desc(products.createdAt),
    ];
    let qb = conditions.length > 0
      ? db.select({ p: products }).from(products)
          .leftJoin(categories, eq(products.category, categories.slug))
          .where(and(...conditions)).orderBy(...orderCols).$dynamic()
      : db.select({ p: products }).from(products)
          .leftJoin(categories, eq(products.category, categories.slug))
          .orderBy(...orderCols).$dynamic();

    if (parsedLimit !== null && !Number.isNaN(parsedLimit)) {
      qb = qb.limit(parsedLimit);
    }

    const rows = await qb;
    // Unwrap the joined { p } shape back to a flat product array.
    const flatRows = rows.map((r) => r.p);

    // Per-location pricing: when a locationId scope is active, swap the
    // base pricePerUnit for any product that has an override at this
    // store. One batched lookup keyed by productId so the per-product
    // map can be applied in memory. NULL override = inherit base.
    if (effectiveLocationId && flatRows.length > 0) {
      const productIds = flatRows.map((p) => p.id);
      const overrides = await db
        .select({
          productId: productLocations.productId,
          priceOverrideCents: productLocations.priceOverrideCents,
        })
        .from(productLocations)
        .where(and(
          inArray(productLocations.productId, productIds),
          eq(productLocations.locationId, effectiveLocationId),
        ));
      const overrideMap = new Map(
        overrides
          .filter((o) => o.priceOverrideCents != null)
          .map((o) => [o.productId, o.priceOverrideCents as number]),
      );
      if (overrideMap.size > 0) {
        return {
          products: flatRows.map((p) => {
            const ov = overrideMap.get(p.id);
            return ov != null ? { ...p, pricePerUnit: ov } : p;
          }),
        };
      }
    }

    return { products: flatRows };
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
    const locationPrices = await getProductLocationPrices(product.id);

    const forcedScope = tryGetForcedScope(request);
    if (forcedScope) {
      const visible = locationIds.length === 0 || locationIds.includes(forcedScope);
      if (!visible) return reply.code(404).send({ error: 'Product not found' });
    }

    // Detail endpoint always returns the BASE price + the locationPrices
    // map. Admin needs the base price for the edit form; customer-side
    // price swapping happens in the list endpoint when ?locationId=X is
    // passed (see flatRows handling above).
    return { product: { ...product, locationIds, locationPrices } };
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

    // Auto-generate a slug from the product name when the caller didn't
    // supply one. Without this, products land with slug='' (the column
    // default) and the customer site's <a href={`/shop/${product.slug}`}>
    // template resolves to /shop/ — clicking a product just reloads the
    // shop list. Mirrors the same logic in the PUT handler below.
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

    // Strip locationIds + locationPrices from the insert payload — they
    // aren't columns on the products table; they get persisted into the
    // product_locations join below.
    const { locationIds: _ignoreLocationIds, locationPrices: _ignoreLocationPrices, ...productInsert } = data;

    const [product] = await db
      .insert(products)
      .values({
        ...productInsert,
        tenantId,
        categoryId: categoryId ?? null,
        ...(images ? { images } : {}),
        ...(slug ? { slug } : {}),
      })
      .returning();

    await setProductLocations(product.id, locationIdsToWrite, data.locationPrices);

    // Auto-create storeInventory rows so the product appears in per-store inventory
    await syncStoreInventory(product.id, locationIdsToWrite, tenantId, {
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
    });

    // Slot the new product into its category at the requested sortOrder,
    // shifting the rest down by 1. The schema default (999) gets clamped
    // to N+1 = "append at end", so unspecified sortOrder still lands new
    // SKUs at the bottom of the category.
    if (product.category) {
      await placeProductAtPosition(product.id, data.sortOrder, product.category, tenantId);
      const [refreshed] = await db
        .select()
        .from(products)
        .where(eq(products.id, product.id))
        .limit(1);
      const locationPrices = await getProductLocationPrices(product.id);
      return { product: { ...(refreshed ?? product), locationIds: locationIdsToWrite, locationPrices } };
    }

    const locationPrices = await getProductLocationPrices(product.id);
    return { product: { ...product, locationIds: locationIdsToWrite, locationPrices } };
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

    // Strip locationIds + locationPrices from the update payload — they
    // are persisted into product_locations below, not on the products row.
    const { locationIds: _ignoreLocationIds, locationPrices: _ignoreLocationPrices, ...productUpdate } = data;

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
      await setProductLocations(id, newLocationIds, data.locationPrices);

      // Auto-create storeInventory rows for newly added locations
      await syncStoreInventory(id, newLocationIds, tenantId, {
        stockQuantity: product.stockQuantity,
        lowStockThreshold: product.lowStockThreshold,
      });
    } else if (data.locationPrices !== undefined) {
      // Admin only changed per-location prices, not the location set.
      // Re-write the existing rows with the new override map.
      const currentLocs = await getProductLocationIds(id);
      if (currentLocs.length > 0) {
        await setProductLocations(id, currentLocs, data.locationPrices);
      }
    }

    // Auto-shift sortOrder so values stay unique 1..N within each category.
    //   - sortOrder change → re-place this product, others cascade.
    //   - category change → close gap in old category, slot into new one.
    const categoryChanged =
      data.category !== undefined && data.category !== existing.category;
    const sortOrderChanged =
      data.sortOrder !== undefined && data.sortOrder !== existing.sortOrder;

    if (categoryChanged || sortOrderChanged) {
      const targetCategory = product.category;
      const desiredPos = data.sortOrder ?? product.sortOrder ?? 999;
      if (targetCategory) {
        await placeProductAtPosition(id, desiredPos, targetCategory, tenantId);
      }
      if (categoryChanged && existing.category && existing.category !== targetCategory) {
        await renumberCategoryProducts(existing.category, tenantId);
      }
    }

    const [refreshed] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    const finalLocationIds = await getProductLocationIds(id);
    const finalLocationPrices = await getProductLocationPrices(id);
    return { product: { ...(refreshed ?? product), locationIds: finalLocationIds, locationPrices: finalLocationPrices } };
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

    // Verify it exists in this tenant first so we can distinguish 404
    // from FK-violation errors cleanly.
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Product not found' });

    // Active carts blocking the delete are not historical — drop those
    // rows first so a single customer's stale cart doesn't prevent
    // cleanup. Orders, order_items and purchase_order_items ARE
    // historical and we never touch them; if they reference this SKU
    // we fall through to a soft delete below.
    await db.delete(cartItems).where(eq(cartItems.productId, id));

    // FK ON DELETE CASCADE covers product_locations, store_inventory,
    // wishlist_items and product_reviews. Only order_items and
    // purchase_order_items would block a hard delete now.
    try {
      await db
        .delete(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
      return { success: true, hardDeleted: true };
    } catch (err) {
      app.log.warn({ err, id }, '[products/delete] hard-delete blocked, falling back to soft');
      // Soft delete: mark inactive + out of stock so customers can't
      // buy it and admin grids can hide it, while order history stays
      // intact. Matches how location DELETE handles the same case.
      const [soft] = await db
        .update(products)
        .set({ active: false, inStock: false, updatedAt: new Date() })
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .returning();
      if (!soft) return reply.code(404).send({ error: 'Product not found' });
      return {
        success: true,
        hardDeleted: false,
        reason: 'archived (referenced by existing orders)',
      };
    }
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

  // ── Per-store availability toggle ────────────────────────────────────
  // Flips a single product's availability at one specific location, used
  // by the Inventory page row toggle. Handles all 4 transitions cleanly:
  //
  //   - Was catalog-wide (no rows), now turned OFF here:
  //       fork into specific-locations covering ALL OTHER active stores.
  //       Net effect: still available everywhere except this one.
  //   - Was specific-locations including this store, turned OFF here:
  //       just delete the (productId, locationId) row.
  //   - Was specific-locations EXCLUDING this store, turned ON:
  //       insert a (productId, locationId) row.
  //   - Was catalog-wide, turned ON: no-op (already available everywhere).
  app.post(
    '/:id/availability/:locationId',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const { id, locationId } = request.params as { id: string; locationId: string };
      const { available } = request.body as { available: boolean };
      const role = request.user!.role;

      if (role === ROLES.STORE_STAFF) {
        return reply.code(403).send({ error: 'Store staff cannot toggle product availability' });
      }
      if (role !== ROLES.ADMIN) {
        // Non-admin: only allowed to toggle products at their own assigned location.
        const myLoc = request.user!.assignedLocationId;
        if (!myLoc || myLoc !== locationId) {
          return reply.code(403).send({ error: 'Cannot toggle a different location' });
        }
      }

      // Verify the product belongs to this tenant.
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .limit(1);
      if (!product) return reply.code(404).send({ error: 'Product not found' });

      // Verify the location belongs to this tenant.
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
        .limit(1);
      if (!loc) return reply.code(400).send({ error: 'Invalid location for this tenant' });

      const currentLocs = await getProductLocationIds(id);
      const wasCatalogWide = currentLocs.length === 0;
      const wasIncludedHere = currentLocs.includes(locationId);

      if (available) {
        if (wasCatalogWide) {
          // Already available everywhere — nothing to do.
          return { product: { id, locationIds: [] }, changed: false };
        }
        if (wasIncludedHere) {
          return { product: { id, locationIds: currentLocs }, changed: false };
        }
        // Add this location to the existing specific-locations set.
        const next = [...currentLocs, locationId];
        await setProductLocations(id, next);
        // Make sure store_inventory rows reflect the new location set
        // (defaults are 100 stock — same as initial product creation).
        const [base] = await db.select().from(products).where(eq(products.id, id)).limit(1);
        await syncStoreInventory(id, next, tenantId, {
          stockQuantity: base?.stockQuantity ?? 100,
          lowStockThreshold: base?.lowStockThreshold ?? 10,
        });
        return { product: { id, locationIds: next }, changed: true };
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
          // Edge case: only one active location and admin is turning the
          // product off there. We deliberately don't end up with an
          // empty product_locations row set (which would mean
          // "available everywhere" — the opposite of intent). Instead
          // we keep the catalog-wide state and surface a 409 so the
          // admin sees what's happening.
          return reply.code(409).send({
            error: 'Cannot disable a catalog-wide product at the only active location.',
          });
        }
        await setProductLocations(id, next);
        const [base] = await db.select().from(products).where(eq(products.id, id)).limit(1);
        await syncStoreInventory(id, next, tenantId, {
          stockQuantity: base?.stockQuantity ?? 100,
          lowStockThreshold: base?.lowStockThreshold ?? 10,
        });
        return { product: { id, locationIds: next }, changed: true };
      }
      if (!wasIncludedHere) {
        // Already not available here — nothing to do.
        return { product: { id, locationIds: currentLocs }, changed: false };
      }
      // Just drop this location from the existing set.
      const next = currentLocs.filter((lid) => lid !== locationId);
      await setProductLocations(id, next);
      // Don't delete storeInventory row — keep the historical stock
      // count so re-enabling later restores the same number.
      return { product: { id, locationIds: next }, changed: true };
    },
  );
}
