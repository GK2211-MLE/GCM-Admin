import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { rolePermissions } from '../db/schema.js';
import {
  ROLES,
  type AdminRole,
  type PageKey,
  isMatrixRole,
  normalizeLegacyRole,
} from '../shared/permissions.js';

export interface JwtPayload {
  id: string;
  tenantId: string;
  email: string;
  role: AdminRole;
  /**
   * Null for admins (= all locations). Required for store_manager / store_staff
   * but stored as null in legacy tokens, in which case the request is rejected
   * by middleware that needs a location scope.
   */
  assignedLocationId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Verifies the bearer token, normalises any legacy role names, and attaches
 * the payload to request.user. ALL admin routes should sit behind this.
 */
export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const raw = jwt.verify(token, config.JWT_SECRET) as Partial<JwtPayload> & {
      role?: string;
    };
    if (!raw.id || !raw.tenantId || !raw.email || !raw.role) {
      return reply.code(401).send({ error: 'Malformed token' });
    }
    request.user = {
      id: raw.id,
      tenantId: raw.tenantId,
      email: raw.email,
      role: normalizeLegacyRole(raw.role),
      assignedLocationId: raw.assignedLocationId ?? null,
    };
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

/** Admin only — full access to everything across all locations. */
export async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  await authGuard(request, reply);
  if (reply.sent) return;
  if (request.user?.role !== ROLES.ADMIN) {
    return reply.code(403).send({ error: 'Admin access required' });
  }
}

/** Admin or store_manager — for write operations within a store. */
export async function storeManagerGuard(request: FastifyRequest, reply: FastifyReply) {
  await authGuard(request, reply);
  if (reply.sent) return;
  const role = request.user?.role;
  if (role !== ROLES.ADMIN && role !== ROLES.STORE_MANAGER) {
    return reply.code(403).send({ error: 'Store manager access required' });
  }
}

/* ── Legacy aliases ─────────────────────────────────────────────
 * The old code used ownerGuard / managerGuard everywhere. Re-export
 * the new guards under the old names so we don't have to touch every
 * route file in this PR. New code should use adminGuard /
 * storeManagerGuard directly.
 */
export const ownerGuard = adminGuard;
export const managerGuard = storeManagerGuard;

/**
 * Returns true if the given role is allowed to access the given page.
 * Admin always returns true. For store_manager / store_staff this reads
 * the role_permissions row. Defaults to false if no row exists (deny by
 * default — safer than allowing access to a brand-new page nobody has
 * configured yet).
 */
export async function isPageAllowed(
  tenantId: string,
  role: AdminRole,
  pageKey: PageKey,
): Promise<boolean> {
  if (role === ROLES.ADMIN) return true;
  if (!isMatrixRole(role)) return false;
  const [row] = await db
    .select({ allowed: rolePermissions.allowed })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.tenantId, tenantId),
        eq(rolePermissions.role, role),
        eq(rolePermissions.pageKey, pageKey),
      ),
    )
    .limit(1);
  return row?.allowed ?? false;
}

/**
 * Middleware factory: gates a route by a specific page key.
 * Use as: { preHandler: [pagePermissionGuard('orders.create')] }
 *
 * Note: pagePermissionGuard does NOT call authGuard itself — pair it
 * with authGuard in the same preHandler array. This keeps the middleware
 * order explicit at the route definition.
 */
export function pagePermissionGuard(pageKey: PageKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    const ok = await isPageAllowed(request.user.tenantId, request.user.role, pageKey);
    if (!ok) {
      return reply.code(403).send({ error: 'Permission denied for this page' });
    }
  };
}

/* ── Location scoping ──────────────────────────────────────────── */

/**
 * Returns the location filter the caller is restricted to:
 *   - admin                 → null  (no restriction; sees everything)
 *   - store_manager / staff → their assignedLocationId
 *
 * Throws via reply if a non-admin user has no assignedLocationId set —
 * that's a misconfigured account and we'd rather fail closed than leak
 * data.
 */
export function getLocationScope(request: FastifyRequest, reply: FastifyReply): string | null | undefined {
  const user = request.user;
  if (!user) {
    reply.code(401).send({ error: 'Not authenticated' });
    return undefined;
  }
  if (user.role === ROLES.ADMIN) return null;
  if (!user.assignedLocationId) {
    reply.code(403).send({
      error: 'Account is not assigned to a location. Contact an admin.',
    });
    return undefined;
  }
  return user.assignedLocationId;
}
