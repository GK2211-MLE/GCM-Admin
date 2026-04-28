import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, appUsers, customers } from '../db/schema.js';
import { sendEmail } from './email.js';
import { orderConfirmationEmail } from './email-templates.js';
import { config } from '../config.js';

/**
 * Send the order-confirmation email for a paid order. Loads the order,
 * its items, and the customer's email/name fresh from the DB so it can
 * be called from any place that just transitioned an order from
 * pending → paid (the customer-side /confirm endpoint AND the Stripe
 * webhook). Caller is expected to have already verified that the order
 * is actually paid; this function does NOT re-check.
 *
 * Fire-and-forget — never throw to the caller. We don't want a flaky
 * email transport to block a successful payment confirmation.
 */
export async function sendOrderConfirmationFor(orderId: string): Promise<void> {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    let email = '';
    let name = 'there';
    if (order.appUserId) {
      const [u] = await db
        .select({ email: appUsers.email, name: appUsers.name })
        .from(appUsers)
        .where(eq(appUsers.id, order.appUserId))
        .limit(1);
      if (u) {
        email = u.email;
        name = u.name || email.split('@')[0];
      }
    } else if (order.customerId) {
      // Guest checkout: pull from the legacy customers table.
      const [c] = await db
        .select({ email: customers.email, name: customers.name })
        .from(customers)
        .where(eq(customers.id, order.customerId))
        .limit(1);
      if (c?.email) {
        email = c.email;
        name = c.name || email.split('@')[0];
      }
    }
    if (!email) {
      // Bot order with no email on file — nothing to send.
      return;
    }

    await sendEmail(
      email,
      `Order ${order.orderCode} Confirmed — Farm2Cook`,
      orderConfirmationEmail(
        name,
        {
          orderCode: order.orderCode,
          items: items.map((it) => ({
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.total,
          })),
          subtotal: order.subtotal,
          tax: order.tax,
          deliveryFee: order.deliveryFee,
          total: order.total,
          deliveryMethod: order.deliveryMethod,
          paymentMethod: order.paymentMethod,
          createdAt: order.createdAt,
        },
        config.CUSTOMER_FRONTEND_URL,
      ),
    );
  } catch (err) {
    console.error('[order-email] confirmation send failed:', err);
  }
}
