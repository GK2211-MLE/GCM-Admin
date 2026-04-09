import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders } from '../db/schema.js';
import { config } from '../config.js';
import { broadcastSSE } from './sse.js';

export async function stripeWebhookRoutes(app: FastifyInstance) {
  app.post('/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    // In production, verify the Stripe signature
    const body = request.body as Record<string, unknown>;
    const event = body as { type: string; data: { object: Record<string, unknown> } };

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const piId = paymentIntent.id as string;

        const [order] = await db
          .update(orders)
          .set({
            paymentStatus: 'paid',
            status: 'confirmed',
            updatedAt: new Date(),
          })
          .where(eq(orders.stripePaymentIntentId, piId))
          .returning();

        if (order) {
          broadcastSSE(order.tenantId, { type: 'order:paid', data: order });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const piId = paymentIntent.id as string;

        await db
          .update(orders)
          .set({ paymentStatus: 'failed', updatedAt: new Date() })
          .where(eq(orders.stripePaymentIntentId, piId));
        break;
      }
    }

    return { received: true };
  });
}
