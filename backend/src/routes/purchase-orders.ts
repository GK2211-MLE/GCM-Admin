import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { purchaseOrders, purchaseOrderItems, vendors } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

function generatePONumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `PO-${code}`;
}

export async function purchaseOrderRoutes(app: FastifyInstance) {
  // List purchase orders
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId));

    const enriched = await Promise.all(
      rows.map(async (po) => {
        const items = await db
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.purchaseOrderId, po.id));
        const [vendor] = await db
          .select()
          .from(vendors)
          .where(eq(vendors.id, po.vendorId))
          .limit(1);
        return { ...po, items, vendor };
      }),
    );

    return { purchaseOrders: enriched };
  });

  // Get single PO
  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
      .limit(1);

    if (!po) return reply.code(404).send({ error: 'Purchase order not found' });

    const items = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, id));
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1);

    return { purchaseOrder: { ...po, items, vendor } };
  });

  // Create PO
  app.post('/', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { vendorId, notes, items } = request.body as {
      vendorId: string;
      notes?: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitCost: number;
      }>;
    };

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    const [po] = await db
      .insert(purchaseOrders)
      .values({
        tenantId,
        vendorId,
        poNumber: generatePONumber(),
        totalAmount,
        notes: notes ?? null,
      })
      .returning();

    if (items.length > 0) {
      await db.insert(purchaseOrderItems).values(
        items.map((item) => ({
          purchaseOrderId: po.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitCost: item.unitCost,
          total: item.quantity * item.unitCost,
        })),
      );
    }

    return { purchaseOrder: po };
  });

  // Update PO status
  app.patch('/:id/status', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    const [po] = await db
      .update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
      .returning();

    if (!po) return reply.code(404).send({ error: 'Purchase order not found' });
    return { purchaseOrder: po };
  });

  // Delete PO
  app.delete('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    // Delete items first
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));

    const [po] = await db
      .delete(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
      .returning();

    if (!po) return reply.code(404).send({ error: 'Purchase order not found' });
    return { success: true };
  });
}
