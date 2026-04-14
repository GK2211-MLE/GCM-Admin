import type { FastifyInstance } from 'fastify';
import { eq, and, asc, desc, ilike, or, sql, lte, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { products, storeInventory, productLocations } from '../db/schema.js';
import { authGuard, getLocationScope } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import {
  inventoryFilterSchema,
  updateStockSchema,
  updateThresholdSchema,
} from '../shared/index.js';

export async function inventoryRoutes(app: FastifyInstance) {
  // ── GET / — Inventory list with filtering, sorting, pagination, and optional store ──
  //
  // Per-location scoping: a non-admin caller is force-pinned to their assigned
  // location and can never enter the "global inventory" branch (which would
  // expose tenant-wide stock numbers across stores).
  app.get('/', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const filters = inventoryFilterSchema.parse(request.query);
    const queryLocationId = (request.query as { locationId?: string }).locationId;
    const locationId = scope ?? queryLocationId;

    // ── Per-store inventory mode ──
    if (locationId) {
      // Product visibility: only show products tagged to this location OR
      // products with no location tags (catalog-wide).
      const visibilityFilter = sql`(
        NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id})
        OR EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id} AND pl.location_id = ${locationId})
      )`;

      const conditions = [
        eq(products.tenantId, tenantId),
        eq(storeInventory.locationId, locationId),
        visibilityFilter,
      ];

      if (filters.search) {
        const term = `%${filters.search}%`;
        conditions.push(or(ilike(products.name, term), ilike(products.category, term))!);
      }
      if (filters.category) {
        conditions.push(eq(products.category, filters.category));
      }
      if (filters.stockStatus === 'out_of_stock') {
        conditions.push(eq(storeInventory.stockQuantity, 0));
      } else if (filters.stockStatus === 'low_stock') {
        conditions.push(gt(storeInventory.stockQuantity, 0));
        conditions.push(lte(storeInventory.stockQuantity, storeInventory.lowStockThreshold));
      } else if (filters.stockStatus === 'in_stock') {
        conditions.push(gt(storeInventory.stockQuantity, storeInventory.lowStockThreshold));
      }

      const where = and(...conditions);
      const offset = (filters.page - 1) * filters.limit;

      const items = await db.select({
        id: products.id,
        tenantId: products.tenantId,
        name: products.name,
        description: products.description,
        category: products.category,
        unit: products.unit,
        pricePerUnit: products.pricePerUnit,
        weightKg: products.weightKg,
        imageUrl: products.imageUrl,
        active: products.active,
        inStock: products.inStock,
        stockQuantity: storeInventory.stockQuantity,
        lowStockThreshold: storeInventory.lowStockThreshold,
        sortOrder: products.sortOrder,
        createdAt: products.createdAt,
        updatedAt: storeInventory.updatedAt,
      }).from(storeInventory)
        .innerJoin(products, eq(storeInventory.productId, products.id))
        .where(where)
        .orderBy(asc(products.name))
        .limit(filters.limit)
        .offset(offset);

      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeInventory)
        .innerJoin(products, eq(storeInventory.productId, products.id))
        .where(where);

      // Summary for this store (also filtered by product_locations visibility)
      const storeCondition = and(
        eq(storeInventory.locationId, locationId),
        eq(products.tenantId, tenantId),
        sql`(
          NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id})
          OR EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id} AND pl.location_id = ${locationId})
        )`,
      );
      const [summaryRow] = await db
        .select({
          totalProducts: sql<number>`count(*)::int`,
          inStock: sql<number>`count(*) filter (where ${storeInventory.stockQuantity} > ${storeInventory.lowStockThreshold})::int`,
          lowStock: sql<number>`count(*) filter (where ${storeInventory.stockQuantity} > 0 and ${storeInventory.stockQuantity} <= ${storeInventory.lowStockThreshold})::int`,
          outOfStock: sql<number>`count(*) filter (where ${storeInventory.stockQuantity} = 0)::int`,
        })
        .from(storeInventory)
        .innerJoin(products, eq(storeInventory.productId, products.id))
        .where(storeCondition);

      return {
        items: items.map((item) => ({
          ...item,
          stockStatus: item.stockQuantity === 0 ? 'out_of_stock'
            : item.stockQuantity <= item.lowStockThreshold ? 'low_stock' : 'in_stock',
        })),
        total,
        summary: summaryRow,
      };
    }

    // ── Global inventory mode (original logic) ──
    const conditions = [eq(products.tenantId, tenantId)];

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(ilike(products.name, term), ilike(products.description, term), ilike(products.category, term))!);
    }
    if (filters.category) {
      conditions.push(eq(products.category, filters.category));
    }
    if (filters.stockStatus === 'out_of_stock') {
      conditions.push(eq(products.stockQuantity, 0));
    } else if (filters.stockStatus === 'low_stock') {
      conditions.push(gt(products.stockQuantity, 0));
      conditions.push(lte(products.stockQuantity, products.lowStockThreshold));
    } else if (filters.stockStatus === 'in_stock') {
      conditions.push(gt(products.stockQuantity, products.lowStockThreshold));
    }

    const where = and(...conditions);
    const offset = (filters.page - 1) * filters.limit;

    const items = await db.select().from(products).where(where).orderBy(asc(products.name)).limit(filters.limit).offset(offset);
    const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` }).from(products).where(where);

    const [summaryRow] = await db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        inStock: sql<number>`count(*) filter (where stock_quantity > low_stock_threshold)::int`,
        lowStock: sql<number>`count(*) filter (where stock_quantity > 0 and stock_quantity <= low_stock_threshold)::int`,
        outOfStock: sql<number>`count(*) filter (where stock_quantity = 0)::int`,
      })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    return {
      items: items.map((item) => ({
        ...item,
        stockStatus: item.stockQuantity === 0 ? 'out_of_stock'
          : item.stockQuantity <= item.lowStockThreshold ? 'low_stock' : 'in_stock',
      })),
      total,
      summary: summaryRow,
    };
  });

  // ── GET /summary ──
  app.get('/summary', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;

    // For non-admin: aggregate over store_inventory rows for this store only.
    if (scope) {
      const [stats] = await db
        .select({
          totalProducts: sql<number>`count(*)::int`,
          activeProducts: sql<number>`count(*) filter (where ${products.active} = true)::int`,
          inStock: sql<number>`count(*) filter (where ${storeInventory.stockQuantity} > ${storeInventory.lowStockThreshold})::int`,
          lowStock: sql<number>`count(*) filter (where ${storeInventory.stockQuantity} > 0 and ${storeInventory.stockQuantity} <= ${storeInventory.lowStockThreshold})::int`,
          outOfStock: sql<number>`count(*) filter (where ${storeInventory.stockQuantity} = 0)::int`,
          totalCategories: sql<number>`count(distinct ${products.category})::int`,
          totalValue: sql<number>`coalesce(sum(${storeInventory.stockQuantity} * ${products.pricePerUnit}), 0)::int`,
        })
        .from(storeInventory)
        .innerJoin(products, eq(storeInventory.productId, products.id))
        .where(and(
          eq(products.tenantId, tenantId),
          eq(storeInventory.locationId, scope),
          sql`(
            NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id})
            OR EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = ${products.id} AND pl.location_id = ${scope})
          )`,
        ));
      return stats;
    }

    const [stats] = await db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        activeProducts: sql<number>`count(*) filter (where active = true)::int`,
        inStock: sql<number>`count(*) filter (where stock_quantity > low_stock_threshold)::int`,
        lowStock: sql<number>`count(*) filter (where stock_quantity > 0 and stock_quantity <= low_stock_threshold)::int`,
        outOfStock: sql<number>`count(*) filter (where stock_quantity = 0)::int`,
        totalCategories: sql<number>`count(distinct category)::int`,
        totalValue: sql<number>`coalesce(sum(stock_quantity * price_per_unit), 0)::int`,
      })
      .from(products)
      .where(eq(products.tenantId, tenantId));
    return stats;
  });

  // ── PATCH /:productId/stock — Update stock (supports per-store) ──
  app.patch('/:productId/stock', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { productId } = request.params as { productId: string };
    const body = request.body as { stockQuantity?: number; adjustment?: number; locationId?: string };
    const data = updateStockSchema.parse(body);
    // Force the location for non-admin callers; reject any attempt to write
    // to a different store.
    let { locationId } = body;
    if (scope) {
      if (locationId && locationId !== scope) {
        return reply.code(403).send({ error: 'Cannot update stock for a different location' });
      }
      locationId = scope;
    }

    const [existing] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Product not found' });

    if (locationId) {
      // Per-store update
      const [inv] = await db.select().from(storeInventory)
        .where(and(eq(storeInventory.locationId, locationId), eq(storeInventory.productId, productId))).limit(1);

      let newQty: number;
      if (data.stockQuantity !== undefined) {
        newQty = data.stockQuantity;
      } else {
        newQty = Math.max(0, (inv?.stockQuantity ?? 0) + (data.adjustment ?? 0));
      }

      if (inv) {
        await db.update(storeInventory).set({ stockQuantity: newQty, updatedAt: new Date() })
          .where(eq(storeInventory.id, inv.id));
      } else {
        await db.insert(storeInventory).values({ locationId, productId, stockQuantity: newQty });
      }

      return { product: { ...existing, stockQuantity: newQty } };
    }

    // Global update — update product AND all store_inventory entries
    let newQty: number;
    if (data.stockQuantity !== undefined) {
      newQty = data.stockQuantity;
    } else {
      newQty = Math.max(0, existing.stockQuantity + (data.adjustment ?? 0));
    }

    const [product] = await db.update(products).set({
      stockQuantity: newQty, inStock: newQty > 0, updatedAt: new Date(),
    }).where(eq(products.id, productId)).returning();

    // Also update all store inventory entries for this product
    await db.update(storeInventory).set({ stockQuantity: newQty, updatedAt: new Date() })
      .where(eq(storeInventory.productId, productId));

    return { product };
  });

  // ── PATCH /:productId/threshold — Update low stock threshold (supports per-store) ──
  app.patch('/:productId/threshold', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const scope = getLocationScope(request, reply);
    if (reply.sent) return;
    const { productId } = request.params as { productId: string };
    const body = request.body as { lowStockThreshold: number; locationId?: string };
    const data = updateThresholdSchema.parse(body);
    let { locationId } = body;
    if (scope) {
      if (locationId && locationId !== scope) {
        return reply.code(403).send({ error: 'Cannot update threshold for a different location' });
      }
      locationId = scope;
    }

    if (locationId) {
      await db.update(storeInventory).set({ lowStockThreshold: data.lowStockThreshold, updatedAt: new Date() })
        .where(and(eq(storeInventory.locationId, locationId), eq(storeInventory.productId, productId)));
      return { success: true };
    }

    const [product] = await db.update(products).set({
      lowStockThreshold: data.lowStockThreshold, updatedAt: new Date(),
    }).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).returning();

    if (!product) return reply.code(404).send({ error: 'Product not found' });

    // Also update all store inventory entries
    await db.update(storeInventory).set({ lowStockThreshold: data.lowStockThreshold, updatedAt: new Date() })
      .where(eq(storeInventory.productId, productId));

    return { product };
  });
}
