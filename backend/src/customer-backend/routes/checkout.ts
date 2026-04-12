import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../../db/client.js';
import { orders, orderItems, products, productLocations, promotions, tenants, appUsers } from '../../db/schema.js';
import { config } from '../../config.js';
import { customerAuthGuard } from '../middleware/auth.js';
import { checkoutSchema, confirmPaymentSchema } from '../validation/schemas.js';
import { sendEmail } from '../../services/email.js';
import { orderConfirmationEmail } from '../../services/email-templates.js';

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

    // 1. Look up server-side prices (NEVER trust client prices) AND verify
    //    that every product the customer is trying to buy is actually
    //    available at the location they picked. Otherwise a Plano customer
    //    could craft a request that adds a Frisco-only SKU to their cart
    //    and the order would land at the wrong store with the wrong stock.
    //    A product is "available at" a location when EITHER it has zero
    //    rows in product_locations (catalog-wide) OR it has a row for the
    //    requested location_id.
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

        // Per-location availability check.
        if (body.location_id) {
          const tags = await db
            .select({ locationId: productLocations.locationId })
            .from(productLocations)
            .where(eq(productLocations.productId, product.id));
          const isCatalogWide = tags.length === 0;
          const isAtLocation = tags.some((t) => t.locationId === body.location_id);
          if (!isCatalogWide && !isAtLocation) {
            throw {
              statusCode: 400,
              message: `${product.name} is not available at the selected store`,
            };
          }
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
          // Accept both 'percent' (admin UI) and 'percentage' (legacy)
          const isPercent = coupon.discountType === 'percent' || coupon.discountType === 'percentage';
          if (isPercent) {
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

    // ── Test-bypass whitelist ────────────────────────────────────
    // If the logged-in customer's email is in TEST_BYPASS_EMAILS env
    // var, the order skips Stripe entirely and is auto-marked paid +
    // confirmed. Used for end-to-end testing without burning real cards
    // and without exposing the bypass to actual customers.
    //
    // This ALSO closes a security hole: previously the legacy
    // body.skip_payment flag could be set by ANY caller (a malicious
    // customer could POST {skip_payment:true} and get free orders).
    // Now skip_payment is only honored for whitelisted emails — random
    // customers cannot exploit it.
    const bypassWhitelist = config.TEST_BYPASS_EMAILS
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const customerEmailLower = (customer.email || '').toLowerCase();
    const customerIsWhitelisted = bypassWhitelist.includes(customerEmailLower);
    const skipPayment = customerIsWhitelisted && (body.skip_payment !== false);
    // ─────────────────────────────────────────────────────────────

    // 6. Create order
    const orderCode = generateOrderCode();
    const [order] = await db
      .insert(orders)
      .values({
        tenantId: tenant.id,
        locationId: body.location_id ?? null,
        appUserId: customer.id,
        orderCode,
        status: skipPayment ? 'confirmed' : 'pending_payment',
        paymentMethod: skipPayment ? 'test_bypass' : 'stripe',
        paymentStatus: skipPayment ? 'paid' : 'pending',
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

    // Resolve customer name for the email (JWT only has email, not name).
    const [customerRow] = await db
      .select({ name: appUsers.name })
      .from(appUsers)
      .where(eq(appUsers.id, customer.id))
      .limit(1);
    const customerName = customerRow?.name || customer.email.split('@')[0];

    // Send order confirmation email (fire-and-forget, both bypass and Stripe paths)
    sendEmail(
      customer.email,
      `Order ${order.orderCode} Confirmed — Farm2Cook`,
      orderConfirmationEmail(
        customerName,
        {
          orderCode: order.orderCode,
          items: verifiedItems.map((it) => ({
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.total,
          })),
          subtotal: discountedSubtotal,
          tax,
          deliveryFee,
          total,
          deliveryMethod: body.fulfillment_type,
          paymentMethod: skipPayment ? 'test_bypass' : 'stripe',
          createdAt: order.createdAt,
        },
        config.CUSTOMER_FRONTEND_URL,
      ),
    ).catch((err) => console.error('[checkout] order email failed:', err));

    // 8. Bypass path — return the order without a clientSecret. The
    // customer site sees no clientSecret and no checkout_url, so it
    // navigates straight to /order-success and treats the order as
    // already paid (which it is, in our DB).
    if (skipPayment) {
      return {
        order: {
          id: order.id,
          orderCode: order.orderCode,
          status: order.status,
          total: order.total,
        },
        message: 'Order created via test bypass (Stripe skipped)',
      };
    }

    // 9. Create a Stripe PaymentIntent (NOT a Checkout Session).
    // Returning a PaymentIntent client_secret lets the customer site embed
    // Stripe Elements directly on /checkout instead of redirecting away to
    // Stripe's hosted page. The amount = the FULL total (subtotal - discount
    // + tax + delivery) so the customer is charged exactly what the order
    // summary shows, and Stripe handles refunds at the right amount.
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(500).send({ error: 'Stripe is not configured' });
    }

    // Build a human-readable line-item description for the Stripe dashboard
    const itemDescription = verifiedItems
      .map((it) => `${it.quantity}x ${it.productName}`)
      .join(', ')
      .slice(0, 500);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,                  // already in cents, includes tax + delivery - discount
      currency: 'usd',
      automatic_payment_methods: { enabled: true }, // card + Apple Pay + Google Pay + Link
      description: `Farm2Cook order ${order.orderCode}`,
      statement_descriptor_suffix: 'FARM2COOK',
      metadata: {
        orderId: order.id,
        orderCode: order.orderCode,
        customerId: customer.id,
        itemDescription,
      },
    });

    // Store the PaymentIntent id on the order so the webhook can mark
    // payment as paid by looking it up later.
    await db
      .update(orders)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    return {
      order: {
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        total: order.total,
      },
      // The customer site checks for clientSecret first and uses it to mount
      // <Elements> + <PaymentElement>. The old checkout_url field is no longer
      // returned, so the redirect path is dead.
      clientSecret: paymentIntent.client_secret,
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
