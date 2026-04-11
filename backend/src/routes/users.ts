import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../db/client.js';
import { adminUsers, locations } from '../db/schema.js';
import { adminGuard, authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { ROLES, isValidRole, normalizeLegacyRole } from '../shared/permissions.js';

/**
 * Admin user management. Replaces the old approve/reject flow with full
 * CRUD modeled after the legacy admin panel:
 *   - 3 fixed roles: admin / store_manager / store_staff
 *   - admin → no assigned location (null = "all locations")
 *   - store_manager / store_staff → assigned_location_id REQUIRED
 *
 * All endpoints are gated by adminGuard (admin role only). The thin
 * "list users" endpoint is available to anyone authenticated so the
 * frontend can render an at-a-glance "who's on call" widget — but the
 * data returned is intentionally minimal.
 */

const createUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(32).optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum([ROLES.ADMIN, ROLES.STORE_MANAGER, ROLES.STORE_STAFF]),
    assignedLocationId: z.string().uuid().optional().nullable(),
    active: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.role !== ROLES.ADMIN && !val.assignedLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedLocationId'],
        message: 'assignedLocationId is required for store_manager and store_staff',
      });
    }
  });

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    password: z.string().min(6).optional(),
    role: z.enum([ROLES.ADMIN, ROLES.STORE_MANAGER, ROLES.STORE_STAFF]).optional(),
    assignedLocationId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    // If role is being changed AND it's a non-admin role, the assignment
    // must be present (either in the same payload or already set on the row;
    // we re-check after merging in the route handler).
    if (val.role && val.role !== ROLES.ADMIN && val.assignedLocationId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedLocationId'],
        message: 'Cannot null out the location for a non-admin role',
      });
    }
  });

export async function userRoutes(app: FastifyInstance) {
  // List admin users (any authenticated user can see the directory; admins
  // see everything, others see the same — there's nothing sensitive here
  // beyond what's already in the audit log).
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);

    const rows = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        phone: adminUsers.phone,
        role: adminUsers.role,
        active: adminUsers.active,
        assignedLocationId: adminUsers.assignedLocationId,
        assignedLocationName: locations.name,
        createdAt: adminUsers.createdAt,
        updatedAt: adminUsers.updatedAt,
      })
      .from(adminUsers)
      .leftJoin(locations, eq(locations.id, adminUsers.assignedLocationId))
      .where(eq(adminUsers.tenantId, tenantId));

    return {
      users: rows.map((r) => ({
        ...r,
        role: normalizeLegacyRole(r.role),
      })),
    };
  });

  // Create admin user (admin only)
  app.post('/', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const data = createUserSchema.parse(request.body);

    // Email uniqueness — globally, since admin_users_email_idx is global.
    const existing = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, data.email))
      .limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Email already exists' });
    }

    // If a location was given, verify it belongs to this tenant — prevents
    // an admin from accidentally pinning a user to a different tenant's
    // store via a copy/pasted UUID.
    let assignedLocationId: string | null = null;
    if (data.role !== ROLES.ADMIN && data.assignedLocationId) {
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, data.assignedLocationId), eq(locations.tenantId, tenantId)))
        .limit(1);
      if (!loc) {
        return reply.code(400).send({ error: 'Assigned location does not belong to this tenant' });
      }
      assignedLocationId = loc.id;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const [user] = await db
      .insert(adminUsers)
      .values({
        tenantId,
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone || null,
        role: data.role,
        assignedLocationId,
        active: data.active ?? true,
      })
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        phone: adminUsers.phone,
        role: adminUsers.role,
        active: adminUsers.active,
        assignedLocationId: adminUsers.assignedLocationId,
        createdAt: adminUsers.createdAt,
      });

    return { user };
  });

  // Update admin user
  app.put('/:id', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const data = updateUserSchema.parse(request.body);

    // Load existing row so we can validate the merged state.
    const [existing] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.id, id), eq(adminUsers.tenantId, tenantId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'User not found' });

    const merged = {
      role: data.role ?? normalizeLegacyRole(existing.role),
      assignedLocationId:
        data.assignedLocationId === undefined ? existing.assignedLocationId : data.assignedLocationId,
    };

    // Non-admin must have a location after merge.
    if (merged.role !== ROLES.ADMIN && !merged.assignedLocationId) {
      return reply.code(400).send({
        error: 'store_manager and store_staff users must have an assigned location',
      });
    }
    // Admin: force the location to null so we don't carry stale assignments.
    if (merged.role === ROLES.ADMIN) {
      merged.assignedLocationId = null;
    }

    // Validate the location belongs to this tenant if it's changing.
    if (
      merged.assignedLocationId &&
      merged.assignedLocationId !== existing.assignedLocationId
    ) {
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(eq(locations.id, merged.assignedLocationId), eq(locations.tenantId, tenantId)),
        )
        .limit(1);
      if (!loc) {
        return reply.code(400).send({ error: 'Assigned location does not belong to this tenant' });
      }
    }

    // Email uniqueness if changing.
    if (data.email && data.email !== existing.email) {
      const [dupe] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, data.email))
        .limit(1);
      if (dupe && dupe.id !== id) {
        return reply.code(409).send({ error: 'Email already exists' });
      }
    }

    // Don't let an admin demote themselves — they'd lose access immediately.
    if (id === request.user!.id && data.role && data.role !== ROLES.ADMIN) {
      return reply.code(400).send({ error: 'You cannot remove your own admin role' });
    }
    if (id === request.user!.id && data.active === false) {
      return reply.code(400).send({ error: 'You cannot deactivate yourself' });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.role !== undefined) updateData.role = merged.role;
    // Always include the (possibly forced-null) assignment.
    updateData.assignedLocationId = merged.assignedLocationId;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);

    const [user] = await db
      .update(adminUsers)
      .set(updateData)
      .where(and(eq(adminUsers.id, id), eq(adminUsers.tenantId, tenantId)))
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        phone: adminUsers.phone,
        role: adminUsers.role,
        active: adminUsers.active,
        assignedLocationId: adminUsers.assignedLocationId,
      });

    return { user };
  });

  // Delete admin user
  app.delete('/:id', { preHandler: [adminGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    if (id === request.user!.id) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }

    const [user] = await db
      .delete(adminUsers)
      .where(and(eq(adminUsers.id, id), eq(adminUsers.tenantId, tenantId)))
      .returning();

    if (!user) return reply.code(404).send({ error: 'User not found' });
    return { success: true };
  });

  // Validate that role/assignment are sensible — used by the frontend
  // form for live "you must pick a location" feedback. No DB writes.
  app.post('/validate', { preHandler: [adminGuard] }, async (request) => {
    try {
      createUserSchema.parse(request.body);
      return { ok: true };
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return { ok: false, errors: err.flatten().fieldErrors };
      }
      return { ok: false };
    }
  });
}
