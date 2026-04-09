import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import { authGuard, ownerGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

export async function userRoutes(app: FastifyInstance) {
  // List admin users
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const rows = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        active: adminUsers.active,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .where(eq(adminUsers.tenantId, tenantId));

    return { users: rows };
  });

  // Create admin user (owner only)
  app.post('/', { preHandler: [ownerGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { email, password, name, role } = request.body as {
      email: string;
      password: string;
      name: string;
      role: string;
    };

    const existing = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(adminUsers)
      .values({ tenantId, email, passwordHash, name, role })
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
      });

    return { user };
  });

  // Update admin user
  app.put('/:id', { preHandler: [ownerGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; role?: string; active?: boolean; password?: string };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) updateData.name = body.name;
    if (body.role) updateData.role = body.role;
    if (body.active !== undefined) updateData.active = body.active;
    if (body.password) updateData.passwordHash = await bcrypt.hash(body.password, 12);

    const [user] = await db
      .update(adminUsers)
      .set(updateData)
      .where(and(eq(adminUsers.id, id), eq(adminUsers.tenantId, tenantId)))
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        active: adminUsers.active,
      });

    if (!user) return reply.code(404).send({ error: 'User not found' });
    return { user };
  });

  // Delete admin user
  app.delete('/:id', { preHandler: [ownerGuard] }, async (request, reply) => {
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
}
