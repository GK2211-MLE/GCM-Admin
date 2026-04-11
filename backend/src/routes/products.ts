import type { FastifyInstance } from 'fastify';
import { eq, and, asc, ilike, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { products, categories } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { createProductSchema, updateProductSchema } from '../shared/index.js';

export async function productRoutes(app: FastifyInstance) {
  // List distinct categories from all products
  app.get('/categories', async () => {
    const rows = await db.select({ category: products.category }).from(products).groupBy(products.category).orderBy(asc(products.category));

    return { categories: rows.map((r) => r.category) };
  });

  // List all products (public for bot; admin filtered by tenant).
  // Supports an optional `limit` query param so the customer storefront
  // can ask for just the first N products (e.g. ?limit=6 for the homepage
  // bestseller carousel) without downloading the entire catalogue.
  app.get('/', async (request) => {
    const query = request.query as {
      tenantId?: string;
      category?: string;
      active?: string;
      search?: string;
      limit?: string;
      featured?: string;
    };

    let conditions = [];
    if (query.tenantId) {
      conditions.push(eq(products.tenantId, query.tenantId));
    }
    if (query.category) {
      conditions.push(eq(products.category, query.category));
    }
    if (query.active !== undefined) {
      conditions.push(eq(products.active, query.active === 'true'));
    }
    if (query.featured !== undefined) {
      conditions.push(eq(products.featured, query.featured === 'true'));
    }
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

    // Parse + clamp the limit. Defaults to no limit (returns all rows).
    // Cap at 200 to prevent abuse.
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

  // Get single product
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });

  // Create product (auth required)
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const data = createProductSchema.parse(request.body);

    // Auto-resolve categoryId from category slug
    let categoryId: string | undefined;
    if (data.category) {
      const [cat] = await db.select({ id: categories.id }).from(categories)
        .where(and(eq(categories.tenantId, tenantId), ilike(categories.slug, data.category)))
        .limit(1);
      if (cat) categoryId = cat.id;
    }

    // Sync imageUrl to images array
    const images = data.imageUrl ? [data.imageUrl] : undefined;

    const [product] = await db
      .insert(products)
      .values({ ...data, tenantId, categoryId: categoryId ?? null, ...(images ? { images } : {}) })
      .returning();

    return { product };
  });

  // Update product
  app.put('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updateProductSchema.parse(request.body);

    // Auto-resolve categoryId from category slug
    let categoryId: string | undefined;
    if (data.category) {
      const [cat] = await db.select({ id: categories.id }).from(categories)
        .where(and(eq(categories.tenantId, tenantId), ilike(categories.slug, data.category)))
        .limit(1);
      if (cat) categoryId = cat.id;
    }

    // Sync imageUrl to images array
    const images = data.imageUrl ? [data.imageUrl] : undefined;

    // Auto-generate slug from name if missing/blank — fixes products that
    // were inserted without a slug and 404 on the customer storefront.
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

    const [product] = await db
      .update(products)
      .set({
        ...data,
        ...(categoryId ? { categoryId } : {}),
        ...(images ? { images } : {}),
        ...(slug ? { slug } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });

  // Delete product
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

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

    const [existing] = await db.select().from(products).where(and(eq(products.id, id), eq(products.tenantId, tenantId))).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Product not found' });

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

    const [product] = await db
      .update(products)
      .set({ inStock, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });
}
