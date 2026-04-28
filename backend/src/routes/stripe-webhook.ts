import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders } from '../db/schema.js';
import { config } from '../config.js';
import { broadcastSSE } from './sse.js';
import { sendOrderConfirmationFor } from '../services/order-email.js';

export async function stripeWebhookRoutes(app: FastifyInstance) {
  app.post('/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    // In production, verify the Stripe signature
    const body = request.body as Record<string, unknown>;
    const event = body as { type: string; data: { object: Record<string, unknown> } };

    switch (event.type) {
      // Customer-website checkout uses Stripe Checkout Sessions, not raw
      // PaymentIntents. The session ID is what we stored on order.stripePaymentIntentId
      // when we created the session, so look the order up by that.
      case 'checkout.session.completed': {
        const session = event.data.object;
        const sessionId = session.id as string;
        const paymentStatus = session.payment_status as string | undefined;

        // Only mark as paid if Stripe says the session itself is paid.
        // The atomic where-pending guard means we only send the email
        // once: if /confirm already ran first, this UPDATE returns no
        // rows and we skip the email; if the webhook wins the race,
        // /confirm will see paymentStatus='paid' and skip too.
        if (paymentStatus === 'paid') {
          const [order] = await db
            .update(orders)
            .set({
              paymentStatus: 'paid',
              status: 'confirmed',
              updatedAt: new Date(),
            })
            .where(and(
              eq(orders.stripePaymentIntentId, sessionId),
              eq(orders.paymentStatus, 'pending'),
            ))
            .returning();

          if (order) {
            broadcastSSE(order.tenantId, { type: 'order:paid', data: order });
            void sendOrderConfirmationFor(order.id);
          }
        }
        break;
      }

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
          .where(and(
            eq(orders.stripePaymentIntentId, piId),
            eq(orders.paymentStatus, 'pending'),
          ))
          .returning();

        if (order) {
          broadcastSSE(order.tenantId, { type: 'order:paid', data: order });
          void sendOrderConfirmationFor(order.id);
        }
        break;
      }

      case 'payment_intent.payment_failed':
      case 'checkout.session.expired': {
        const obj = event.data.object;
        const lookupId = obj.id as string;

        await db
          .update(orders)
          .set({ paymentStatus: 'failed', updatedAt: new Date() })
          .where(eq(orders.stripePaymentIntentId, lookupId));
        break;
      }
    }

    return { received: true };
  });
}
