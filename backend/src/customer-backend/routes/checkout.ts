import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../../db/client.js';
import { orders, orderItems, products, promotions, tenants } from '../../db/schema.js';
import { config } from '../../config.js';
import { customerAuthGuard } from '../middleware/auth.js';
import { checkoutSchema, confirmPaymentSchema } from '../validation/schemas.js';

function generateOrderCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `F2C-${code}`;
}

function getStripe(): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) return null;
  return new Stripe(config.STRIPE_SECRET_KEY);
}

export async function customerCheckoutRoutes(app: FastifyInstance) {
  // ── Create order + Stripe checkout session ──────────────────
  app.post('/', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const customer = request.customer!;
    const body = checkoutSchema.parse(request.body);

    // 1. Look up server-side prices (NEVER trust client prices)
    const verifiedItems = await Promise.all(
      body.items.map(async (item) => {
        const [product] = await db
          .select({
            id: products.id,
            name: products.name,
            pricePerUnit: products.pricePerUnit,
            active: products.active,
            inStock: products.inStock,
          })
          .from(products)
          .where(eq(products.id, item.product_id))
          .limit(1);

        if (!product) {
          throw { statusCode: 400, message: `Product not found: ${item.product_id}` };
        }
        if (!product.active || !product.inStock) {
          throw { statusCode: 400, message: `Product unavailable: ${product.name}` };
        }

        return {
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.pricePerUnit, // server-side price in cents
          total: product.pricePerUnit * item.quantity,
        };
      }),
    );

    // 2. Calculate subtotal (all in CENTS)
    let subtotal = verifiedItems.reduce((sum, item) => sum + item.total, 0);
    let discountAmount = 0;

    // 3. Apply coupon discount if provided
    if (body.coupon_code) {
      const [coupon] = await db
        .select()
        .from(promotions)
        .where(and(
          eq(promotions.code, body.coupon_code),
          eq(promotions.active, true),
        ))
        .limit(1);

      if (coupon) {
        const now = new Date();
        const isValid =
          now >= coupon.startsAt &&
          now <= coupon.expiresAt &&
          (coupon.maxUses === 0 || coupon.usedCount < coupon.maxUses) &&
          subtotal >= coupon.minOrder;

        if (isValid) {
          if (coupon.discountType === 'percentage') {
            discountAmount = Math.round(subtotal * (coupon.discountValue / 100));
          } else {
            // fixed amount in cents
            discountAmount = Math.min(coupon.discountValue, subtotal);
          }

          // Increment used count
          await db
            .update(promotions)
            .set({ usedCount: coupon.usedCount + 1 })
            .where(eq(promotions.id, coupon.id));
        }
      }
    }

    // 5. Get tenant (single source of truth for tax rate)
    const [tenant] = await db
      .select({ id: tenants.id, taxRate: tenants.taxRate })
      .from(tenants)
      .limit(1);
    if (!tenant) return reply.code(500).send({ error: 'No tenant configured' });

    // 4. Calculate totals — all in CENTS, all driven by tenant config
    const discountedSubtotal = subtotal - discountAmount;
    const tax = Math.round(discountedSubtotal * tenant.taxRate);
    const deliveryFee = body.fulfillment_type === 'delivery' ? 599 : 0; // $5.99 — must match frontend default in src/lib/constants.ts
    const total = discountedSubtotal + tax + deliveryFee;

    // 6. Create order
    const orderCode = generateOrderCode();
    const [order] = await db
      .insert(orders)
      .values({
        tenantId: tenant.id,
        locationId: body.location_id ?? null,
        appUserId: customer.id,
        orderCode,
        status: body.skip_payment ? 'confirmed' : 'pending_payment',
        paymentMethod: body.skip_payment ? 'admin' : 'stripe',
        paymentStatus: body.skip_payment ? 'paid' : 'pending',
        deliveryMethod: body.fulfillment_type,
        deliveryAddress: null,
        subtotal: discountedSubtotal,
        tax,
        deliveryFee,
        total,
        notes: body.notes ?? null,
        source: 'web',
      })
      .returning();

    // 7. Create order items
    if (verifiedItems.length > 0) {
      await db.insert(orderItems).values(
        verifiedItems.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      );
    }

    // 8. If skip_payment — return order immediately (admin bypass)
    if (body.skip_payment) {
      return {
        order: {
          id: order.id,
          orderCode: order.orderCode,
          status: order.status,
          total: order.total,
        },
        message: 'Order created and marked as paid',
      };
    }

    // 9. Create Stripe checkout session
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(500).send({ error: 'Stripe is not configured' });
    }

    // Build Stripe line items: products + (optional) discount-as-negative-line + tax + delivery
    // Stripe charges the SUM of all line_items, so we must include tax and delivery as
    // separate line items or they won't be collected. Discount is applied directly to
    // the product line items by reducing unit_amount proportionally would be lossy with
    // rounding — easier and exact: pass discount as a separate negative-priced item is
    // not allowed by Stripe, so instead we apply the discount to the first line item.
    const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = verifiedItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: item.productName },
        unit_amount: item.unitPrice,
      },
      quantity: item.quantity,
    }));

    // If there's a discount, fold it into the first line item by reducing its unit_amount.
    // This keeps the math exact and avoids needing Stripe coupons.
    if (discountAmount > 0 && stripeLineItems.length > 0) {
      const first = stripeLineItems[0];
      const firstQty = first.quantity ?? 1;
      const firstOriginal = (first.price_data!.unit_amount ?? 0) * firstQty;
      const firstAfter = Math.max(0, firstOriginal - discountAmount);
      first.price_data!.unit_amount = Math.round(firstAfter / firstQty);
    }

    if (tax > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Sales tax' },
          unit_amount: tax,
        },
        quantity: 1,
      });
    }

    if (deliveryFee > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Delivery fee' },
          unit_amount: deliveryFee,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      client_reference_id: order.id,
      metadata: { orderCode: order.orderCode, customerId: customer.id },
      line_items: stripeLineItems,
      success_url: `${config.BASE_URL}/checkout/success?order=${order.orderCode}`,
      cancel_url: `${config.BASE_URL}/checkout/cancel?order=${order.orderCode}`,
    });

    // Store the Stripe session ID on the order for later confirmation
    await db
      .update(orders)
      .set({ stripePaymentIntentId: session.id, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    return {
      order: {
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        total: order.total,
      },
      checkout_url: session.url,
    };
  });

  // ── Confirm payment after Stripe redirect ───────────────────
  app.post('/confirm', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const { orderNumber } = confirmPaymentSchema.parse(request.body);

    const [order] = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.orderCode, orderNumber),
        eq(orders.appUserId, request.customer!.id),
      ))
      .limit(1);

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    if (order.paymentStatus === 'paid') {
      return { order, message: 'Payment already confirmed' };
    }

    const [updated] = await db
      .update(orders)
      .set({
        status: 'confirmed',
        paymentStatus: 'paid',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    return { order: updated, message: 'Payment confirmed' };
  });
}
