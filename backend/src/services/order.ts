import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, orderItems, customers } from '../db/schema.js';
import { generateOrderCode, calculateTax, calculateTotal } from '../shared/index.js';
import type { CartItem, DeliveryMethod, PaymentMethod } from '../shared/index.js';
import { broadcastSSE } from '../routes/sse.js';

interface CreateOrderInput {
  tenantId: string;
  locationId: string;
  phone: string;
  customerName: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string;
  paymentMethod: PaymentMethod;
  cart: CartItem[];
  taxRate?: number;
}

export async function createOrder(input: CreateOrderInput) {
  const {
    tenantId,
    locationId,
    phone,
    customerName,
    deliveryMethod,
    deliveryAddress,
    paymentMethod,
    cart,
    taxRate = 0.05,
  } = input;

  // Find or create customer
  let [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, phone)))
    .limit(1);

  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({ tenantId, phone, name: customerName })
      .returning();
  } else {
    [customer] = await db
      .update(customers)
      .set({ name: customerName, updatedAt: new Date() })
      .where(eq(customers.id, customer.id))
      .returning();
  }

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = calculateTax(subtotal, taxRate);
  const total = subtotal + tax;

  // Determine initial status
  const initialStatus = paymentMethod === 'stripe' ? 'pending_payment' : 'confirmed';
  const initialPaymentStatus = paymentMethod === 'cod' || paymentMethod === 'pay_at_store' || paymentMethod === 'pay_next_delivery'
    ? 'pending'
    : 'pending';

  // Create order. We freeze the customer name + phone used for THIS
  // order in the *_snapshot columns so a later reuse of the same phone
  // (which mutates customers.name above) doesn't retroactively rewrite
  // the displayed customer on this order — that was BUG-004.
  const [order] = await db
    .insert(orders)
    .values({
      tenantId,
      locationId,
      customerId: customer.id,
      orderCode: generateOrderCode(),
      status: initialStatus,
      paymentMethod,
      paymentStatus: initialPaymentStatus,
      deliveryMethod,
      deliveryAddress: deliveryAddress ?? null,
      subtotal,
      tax,
      total,
      customerNameSnapshot: customerName,
      customerPhoneSnapshot: phone,
      customerEmailSnapshot: customer.email ?? null,
    })
    .returning();

  // Create order items
  if (cart.length > 0) {
    await db.insert(orderItems).values(
      cart.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.unitPrice * item.quantity,
      })),
    );
  }

  // Update customer stats
  await db
    .update(customers)
    .set({
      totalOrders: sql`${customers.totalOrders} + 1`,
      totalSpent: sql`${customers.totalSpent} + ${total}`,
      lastOrderAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id));

  // Broadcast new order event
  broadcastSSE(tenantId, { type: 'order:new', data: order });

  return order;
}
