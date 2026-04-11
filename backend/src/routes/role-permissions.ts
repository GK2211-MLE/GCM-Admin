import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { rolePermissions } from '../db/schema.js';
import { adminGuard, authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import {
  PAGES,
  MATRIX_ROLES,
  isMatrixRole,
  isValidPageKey,
} from '../shared/permissions.js';

/**
 * Per-tenant role-permission matrix endpoints.
 *
 * GET  /         → returns the page registry plus the current matrix
 * PUT  /         → upserts a single (role, pageKey) cell
 * POST /seed     → idempotently inserts default rows for any missing
 *                   (role, pageKey) combos. Called automatically on first
 *                   GET so admins never see an empty matrix.
 *
 * Admin role is intentionally NOT in the matrix because admins always have
 * full access. The frontend hides the Admin column.
 */

const updateSchema = z.object({
  role: z.enum([MATRIX_ROLES[0], MATRIX_ROLES[1]]),
  pageKey: z.string().min(1),
  allowed: z.boolean(),
});

async function seedDefaults(tenantId: string): Promise<void> {
  // Pull all existing (role, pageKey) so we know what's already there.
  const existing = await db
    .select({
      role: rolePermissions.role,
      pageKey: rolePermissions.pageKey,
    })
    .from(rolePermissions)
    .where(eq(rolePermissions.tenantId, tenantId));

  const have = new Set(existing.map((r) => `${r.role}::${r.pageKey}`));

  const toInsert: { tenantId: string; role: string; pageKey: string; allowed: boolean }[] = [];
  for (const page of PAGES) {
    for (const role of MATRIX_ROLES) {
      const key = `${role}::${page.key}`;
      if (have.has(key)) continue;
      toInsert.push({
        tenantId,
        role,
        pageKey: page.key,
        allowed: role === 'store_manager' ? page.defaultStoreManager : page.defaultStoreStaff,
      });
    }
  }

  if (toInsert.length > 0) {
    await db.insert(rolePermissions).values(toInsert);
  }
}

export async function rolePermissionRoutes(app: FastifyInstance) {
  // GET / — return the matrix. Any authenticated user can read so the
  // frontend can render permission-aware nav even for store_staff. We
  // never include the admin column.
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);

    // Self-heal: if the matrix has never been seeded, seed it now.
    await seedDefaults(tenantId);

    const rows = await db
      .select({
        role: rolePermissions.role,
        pageKey: rolePermissions.pageKey,
        allowed: rolePermissions.allowed,
      })
      .from(rolePermissions)
      .where(eq(rolePermissions.tenantId, tenantId));

    // Shape it as { store_manager: { 'orders.view': true, ... }, store_staff: {...} }
    const matrix: Record<string, Record<string, boolean>> = {
      store_manager: {},
      store_staff: {},
    };
    for (const row of rows) {
      if (!isMatrixRole(row.role)) continue;
      matrix[row.role][row.pageKey] = row.allowed;
    }

    return {
      pages: PAGES.map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
      })),
      roles: MATRIX_ROLES,
      matrix,
    };
  });

  // PUT / — update one cell.
  app.put('/', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { role, pageKey, allowed } = updateSchema.parse(request.body);

    if (!isMatrixRole(role)) {
      return reply.code(400).send({ error: 'Cannot edit permissions for this role' });
    }
    if (!isValidPageKey(pageKey)) {
      return reply.code(400).send({ error: `Unknown page key: ${pageKey}` });
    }

    // Try update first; if no row exists, insert one.
    const [existing] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.tenantId, tenantId),
          eq(rolePermissions.role, role),
          eq(rolePermissions.pageKey, pageKey),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(rolePermissions)
        .set({ allowed, updatedAt: new Date() })
        .where(eq(rolePermissions.id, existing.id));
    } else {
      await db.insert(rolePermissions).values({ tenantId, role, pageKey, allowed });
    }

    return { ok: true, role, pageKey, allowed };
  });

  // POST /seed — manual reseed (idempotent).
  app.post('/seed', { preHandler: [adminGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    await seedDefaults(tenantId);
    return { ok: true };
  });
}
