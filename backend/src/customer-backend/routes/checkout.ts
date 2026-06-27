import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../../db/client.js';
import { orders, orderItems, products, productLocations, promotions, tenants, appUsers, customers } from '../../db/schema.js';
import { config } from '../../config.js';
import { customerAuthOptional } from '../middleware/auth.js';
import { checkoutSchema, confirmPaymentSchema } from '../validation/schemas.js';
import { sendOrderConfirmationFor } from '../../services/order-email.js';

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
  // Auth is OPTIONAL. Two paths:
  //   - Logged-in customer: order is linked via orders.appUserId.
  //   - Guest: contact.{name,email,phone} all required; we find-or-
  //     create a row in the `customers` table and link via orders.customerId.
  app.post('/', { preHandler: [customerAuthOptional] }, async (request, reply) => {
    const customer = request.customer; // may be undefined for guests
    const body = checkoutSchema.parse(request.body);

    const guestName = body.contact?.name?.trim();
    const guestEmail = body.contact?.email?.trim().toLowerCase();
    const guestPhone = body.contact?.phone?.trim();

    if (!customer) {
      const missing: string[] = [];
      if (!guestName) missing.push('contact.name');
      if (!guestEmail) missing.push('contact.email');
      if (!guestPhone) missing.push('contact.phone');
      if (missing.length > 0) {
        return reply.code(400).send({
          error: 'Guest checkout requires name, email, and phone',
          missing,
        });
      }
    }

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
    const checkoutEmail = (customer?.email || guestEmail || '').toLowerCase();
    const customerIsWhitelisted = bypassWhitelist.includes(checkoutEmail);
    const skipPayment = customerIsWhitelisted && (body.skip_payment !== false);
    // ─────────────────────────────────────────────────────────────

    // 5b. Resolve the row that the order will reference. Logged-in
    // customers attach via app_user_id; guests attach via the
    // legacy `customers` table (find-or-create on phone+email).
    let appUserId: string | null = null;
    let customerId: string | null = null;
    if (customer) {
      appUserId = customer.id;
    } else {
      // Find existing legacy customer by phone (within this tenant).
      // If a row with this phone exists we reuse it — phone is the
      // cheapest stable identifier for a guest who comes back.
      const existing = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.tenantId, tenant.id),
          eq(customers.phone, guestPhone!),
        ))
        .limit(1);
      if (existing.length > 0) {
        customerId = existing[0].id;
        // Refresh name/email so the latest checkout values stick.
        await db
          .update(customers)
          .set({ name: guestName!, email: guestEmail!, updatedAt: new Date() })
          .where(eq(customers.id, customerId));
      } else {
        const [newCust] = await db
          .insert(customers)
          .values({
            tenantId: tenant.id,
            phone: guestPhone!,
            name: guestName!,
            email: guestEmail!,
          })
          .returning({ id: customers.id });
        customerId = newCust.id;
      }
    }

    // 6. Create order. Snapshot the customer's contact info on the
    // row itself (customer_name_snapshot etc) so future updates to
    // the customers / app_users record don't mutate this order's
    // historical display.
    const snapshotName = customer
      ? body.contact?.name?.trim() || null
      : guestName!;
    const snapshotEmail = customer
      ? customer.email
      : guestEmail!;
    const snapshotPhone = customer
      ? body.contact?.phone?.trim() || null
      : guestPhone!;

    const orderCode = generateOrderCode();
    const [order] = await db
      .insert(orders)
      .values({
        tenantId: tenant.id,
        locationId: body.location_id ?? null,
        appUserId,
        customerId,
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
        customerNameSnapshot: snapshotName,
        customerEmailSnapshot: snapshotEmail,
        customerPhoneSnapshot: snapshotPhone,
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

    // Resolve customer name for the email. For logged-in users we also
    // sync any name/phone the customer typed on the checkout form back
    // onto their profile so future orders use the latest values.
    let customerName: string;
    if (customer) {
      const typedName = body.contact?.name?.trim();
      const typedPhone = body.contact?.phone?.trim();
      const [customerRow] = await db
        .select({ name: appUsers.name, phone: appUsers.phone })
        .from(appUsers)
        .where(eq(appUsers.id, customer.id))
        .limit(1);

      const profileUpdates: Record<string, unknown> = {};
      if (typedName && typedName !== customerRow?.name) profileUpdates.name = typedName;
      if (typedPhone && typedPhone !== customerRow?.phone) profileUpdates.phone = typedPhone;
      if (Object.keys(profileUpdates).length > 0) {
        profileUpdates.updatedAt = new Date();
        await db.update(appUsers).set(profileUpdates).where(eq(appUsers.id, customer.id));
      }
      customerName = typedName || customerRow?.name || customer.email.split('@')[0];
    } else {
      customerName = guestName!;
    }

    // 8. Bypass path — return the order without a clientSecret. The
    // customer site sees no clientSecret and no checkout_url, so it
    // navigates straight to /order-success and treats the order as
    // already paid (which it is, in our DB).
    //
    // The confirmation email used to fire here for BOTH paths, which
    // meant Stripe customers got "Order Confirmed" emails the moment
    // they hit Proceed to Checkout — before paying a cent. Now the
    // bypass path emails immediately (because it's already marked
    // paid), and the Stripe path waits for /confirm or the webhook to
    // flip paymentStatus to paid.
    if (skipPayment) {
      void sendOrderConfirmationFor(order.id);
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
    // Reference vars to silence unused-var warnings from the removed
    // synchronous send block.
    void customerName; void verifiedItems;

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
      receipt_email: checkoutEmail || undefined,
      metadata: {
        orderId: order.id,
        orderCode: order.orderCode,
        appUserId: appUserId ?? '',
        guestCustomerId: customerId ?? '',
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
  // Auth-optional: guests don't have a JWT but do know their order
  // code (it was returned in the create-order response). Looking up
  // by orderCode is safe — it's a 6-char random code that's only
  // useful to flip an already-pending row to paid.
  app.post('/confirm', { preHandler: [customerAuthOptional] }, async (request, reply) => {
    const { orderNumber } = confirmPaymentSchema.parse(request.body);

    // Logged-in: scope to their appUserId. Guest: look up by code only.
    const where = request.customer
      ? and(eq(orders.orderCode, orderNumber), eq(orders.appUserId, request.customer.id))
      : eq(orders.orderCode, orderNumber);

    const [order] = await db.select().from(orders).where(where).limit(1);

    if (!order) return reply.code(404).send({ error: 'Order not found' });

    if (order.paymentStatus === 'paid') {
      return { order, message: 'Payment already confirmed' };
    }

    // Atomic transition: only flip the row to paid if it's still pending.
    // If the Stripe webhook has already raced ahead and marked it paid,
    // the WHERE clause won't match and we won't double-send the email.
    const [updated] = await db
      .update(orders)
      .set({
        status: 'confirmed',
        paymentStatus: 'paid',
        updatedAt: new Date(),
      })
      .where(and(
        eq(orders.id, order.id),
        eq(orders.paymentStatus, 'pending'),
      ))
      .returning();

    if (updated) {
      void sendOrderConfirmationFor(updated.id);
    }

    return {
      order: updated ?? order,
      message: updated ? 'Payment confirmed' : 'Already confirmed',
    };
  });
}
