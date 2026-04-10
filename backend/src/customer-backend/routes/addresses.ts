import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { savedAddresses } from '../../db/schema.js';
import { customerAuthGuard } from '../middleware/auth.js';
import { addressSchema } from '../validation/schemas.js';

export async function addressRoutes(app: FastifyInstance) {
  // List customer's saved addresses
  app.get('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const userId = request.customer!.id;

    const rows = await db
      .select()
      .from(savedAddresses)
      .where(eq(savedAddresses.userId, userId));

    return { addresses: rows };
  });

  // Create address
  app.post('/', { preHandler: [customerAuthGuard] }, async (request) => {
    const userId = request.customer!.id;
    const data = addressSchema.parse(request.body);

    // If setting as default, unset other defaults first
    if (data.is_default) {
      await db
        .update(savedAddresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(savedAddresses.userId, userId));
    }

    const [address] = await db
      .insert(savedAddresses)
      .values({
        userId,
        label: data.label,
        street: data.street,
        city: data.city,
        state: data.state,
        zip: data.zip,
        isDefault: data.is_default ?? false,
      })
      .returning();

    return { address };
  });

  // Update address
  app.put('/:id', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const userId = request.customer!.id;
    const { id } = request.params as { id: string };
    const data = addressSchema.parse(request.body);

    // Verify ownership
    const [existing] = await db
      .select()
      .from(savedAddresses)
      .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: 'Address not found' });

    // If setting as default, unset other defaults first
    if (data.is_default) {
      await db
        .update(savedAddresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(savedAddresses.userId, userId));
    }

    const [address] = await db
      .update(savedAddresses)
      .set({
        label: data.label,
        street: data.street,
        city: data.city,
        state: data.state,
        zip: data.zip,
        isDefault: data.is_default ?? false,
        updatedAt: new Date(),
      })
      .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
      .returning();

    return { address };
  });

  // Delete address
  app.delete('/:id', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const userId = request.customer!.id;
    const { id } = request.params as { id: string };

    const [address] = await db
      .delete(savedAddresses)
      .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
      .returning();

    if (!address) return reply.code(404).send({ error: 'Address not found' });
    return { success: true };
  });
}
