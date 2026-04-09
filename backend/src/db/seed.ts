import 'dotenv/config';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

function generateOrderCode(): string {
  return `F2C-${String(Math.floor(100000 + Math.random() * 900000))}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(Math.floor(Math.random() * 14) + 8, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

async function seed() {
  console.log('Seeding database...');

  // 1. Create tenant
  const [tenant] = await sql`
    INSERT INTO tenants (name, slug, timezone, currency, tax_rate)
    VALUES ('Farm2Cook', 'farm2cook', 'America/Chicago', 'USD', 0.085)
    ON CONFLICT (slug) DO UPDATE SET name = 'Farm2Cook', tax_rate = 0.085
    RETURNING id
  `;
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenantId}`);

  // 2. Create admin user
  const passwordHash = await bcrypt.hash('admin123!', 12);
  await sql`
    INSERT INTO admin_users (tenant_id, email, password_hash, name, role)
    VALUES (${tenantId}, 'admin@farm2cook.com', ${passwordHash}, 'Admin', 'owner')
    ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}
  `;
  console.log('Admin user: admin@farm2cook.com / admin123!');

  // 3. Create locations
  const [loc1] = await sql`
    INSERT INTO locations (tenant_id, name, address, phone, lat, lng)
    VALUES (${tenantId}, 'Downtown Store', '123 Main St, Dallas, TX 75201', '214-555-0101', 32.7767, -96.7970)
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  const [loc2] = await sql`
    INSERT INTO locations (tenant_id, name, address, phone, lat, lng)
    VALUES (${tenantId}, 'Uptown Market', '456 Oak Ave, Dallas, TX 75219', '214-555-0102', 32.8012, -96.7985)
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  const locationId1 = loc1?.id || (await sql`SELECT id FROM locations WHERE name='Downtown Store' AND tenant_id=${tenantId}`)[0].id;
  const locationId2 = loc2?.id || (await sql`SELECT id FROM locations WHERE name='Uptown Market' AND tenant_id=${tenantId}`)[0].id;
  const locationIds = [locationId1, locationId2];
  console.log(`Locations: ${locationId1}, ${locationId2}`);

  // 4. Clear existing data
  await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ${tenantId})`;
  await sql`DELETE FROM orders WHERE tenant_id = ${tenantId}`;
  await sql`DELETE FROM customers WHERE tenant_id = ${tenantId}`;
  await sql`DELETE FROM products WHERE tenant_id = ${tenantId}`;

  // 5. Seed products (units in lb for USA market)
  const productData = [
    // Chicken
    { name: 'Whole Chicken', category: 'chicken', unit: 'lb', price: 399, weight: 2.2, desc: 'Farm-fresh whole chicken, cleaned and ready to cook', sort: 1 },
    { name: 'Chicken Breast (Boneless)', category: 'chicken', unit: 'lb', price: 549, weight: 2.2, desc: 'Premium boneless chicken breast', sort: 2 },
    { name: 'Chicken Thigh', category: 'chicken', unit: 'lb', price: 449, weight: 2.2, desc: 'Juicy chicken thigh pieces', sort: 3 },
    { name: 'Chicken Drumstick', category: 'chicken', unit: 'lb', price: 379, weight: 2.2, desc: 'Tender chicken drumsticks', sort: 4 },
    { name: 'Chicken Wings', category: 'chicken', unit: 'lb', price: 499, weight: 2.2, desc: 'Perfect for grilling or frying', sort: 5 },
    { name: 'Chicken Liver', category: 'chicken', unit: 'lb', price: 299, weight: 1.1, desc: 'Fresh chicken liver', sort: 6 },
    { name: 'Ground Chicken', category: 'chicken', unit: 'lb', price: 529, weight: 2.2, desc: 'Freshly ground chicken', sort: 7 },
    { name: 'Chicken Lollipop', category: 'chicken', unit: 'lb', price: 599, weight: 2.2, desc: 'Pre-cut chicken lollipop pieces', sort: 8 },

    // Mutton & Goat
    { name: 'Goat Curry Cut', category: 'mutton', unit: 'lb', price: 899, weight: 2.2, desc: 'Bone-in goat meat curry cut', sort: 1 },
    { name: 'Goat Leg (Bone-in)', category: 'mutton', unit: 'lb', price: 1049, weight: 2.2, desc: 'Whole goat leg with bone', sort: 2 },
    { name: 'Goat Ribs', category: 'mutton', unit: 'lb', price: 979, weight: 2.2, desc: 'Tender goat ribs', sort: 3 },
    { name: 'Ground Goat', category: 'mutton', unit: 'lb', price: 949, weight: 2.2, desc: 'Freshly ground goat meat', sort: 4 },
    { name: 'Goat Brain', category: 'mutton', unit: 'piece', price: 499, weight: 0.4, desc: 'Fresh goat brain (per piece)', sort: 5 },
    { name: 'Goat Liver', category: 'mutton', unit: 'lb', price: 699, weight: 1.1, desc: 'Fresh goat liver', sort: 6 },
    { name: 'Lamb Chops', category: 'mutton', unit: 'lb', price: 1199, weight: 2.2, desc: 'Premium lamb chops', sort: 7 },
    { name: 'Goat Trotters (Paya)', category: 'mutton', unit: 'lb', price: 599, weight: 2.2, desc: 'Goat trotters for paya soup', sort: 8 },

    // Seafood
    { name: 'Salmon Fillet', category: 'seafood', unit: 'lb', price: 1299, weight: 1.1, desc: 'Fresh Atlantic salmon fillet', sort: 1 },
    { name: 'Shrimp (Large)', category: 'seafood', unit: 'lb', price: 1099, weight: 1.1, desc: 'Large deveined shrimp', sort: 2 },
    { name: 'Tilapia (Whole)', category: 'seafood', unit: 'lb', price: 599, weight: 2.2, desc: 'Whole tilapia cleaned', sort: 3 },
    { name: 'Catfish Fillet', category: 'seafood', unit: 'lb', price: 699, weight: 2.2, desc: 'Fresh catfish fillet', sort: 4 },
    { name: 'Blue Crab (Whole)', category: 'seafood', unit: 'lb', price: 1199, weight: 2.2, desc: 'Whole blue crab', sort: 5 },
    { name: 'Squid (Calamari)', category: 'seafood', unit: 'lb', price: 849, weight: 1.1, desc: 'Cleaned squid rings', sort: 6 },
    { name: 'Rohu Fish Curry Cut', category: 'seafood', unit: 'lb', price: 649, weight: 2.2, desc: 'Rohu fish curry cut', sort: 7 },
    { name: 'Pomfret (Whole)', category: 'seafood', unit: 'lb', price: 1099, weight: 1.1, desc: 'Whole pomfret cleaned', sort: 8 },

    // Eggs
    { name: 'Farm Eggs (Dozen)', category: 'eggs', unit: 'dozen', price: 499, weight: 1.5, desc: 'Farm-fresh free-range eggs', sort: 1 },
    { name: 'Farm Eggs (Half Dozen)', category: 'eggs', unit: 'piece', price: 275, weight: 0.8, desc: '6 farm-fresh free-range eggs', sort: 2 },
    { name: 'Duck Eggs (6 pcs)', category: 'eggs', unit: 'piece', price: 599, weight: 1.1, desc: '6 fresh duck eggs', sort: 3 },
    { name: 'Quail Eggs (12 pcs)', category: 'eggs', unit: 'piece', price: 449, weight: 0.4, desc: '12 fresh quail eggs', sort: 4 },
    { name: 'Organic Brown Eggs (Dozen)', category: 'eggs', unit: 'dozen', price: 699, weight: 1.5, desc: 'Organic brown eggs', sort: 5 },

    // Ready to Cook
    { name: 'Chicken Nuggets (1 lb)', category: 'ready_to_cook', unit: 'piece', price: 599, weight: 1.0, desc: 'Breaded chicken nuggets', sort: 1 },
    { name: 'Chicken Sausage (6 pcs)', category: 'ready_to_cook', unit: 'piece', price: 449, weight: 0.7, desc: 'Smoked chicken sausages', sort: 2 },
    { name: 'Seekh Kebab (8 pcs)', category: 'ready_to_cook', unit: 'piece', price: 699, weight: 0.9, desc: 'Ready-to-grill seekh kebabs', sort: 3 },
    { name: 'Chicken Tikka (1 lb)', category: 'ready_to_cook', unit: 'piece', price: 749, weight: 1.0, desc: 'Marinated chicken tikka pieces', sort: 4 },
    { name: 'Fish Fingers (10 pcs)', category: 'ready_to_cook', unit: 'piece', price: 549, weight: 0.7, desc: 'Crispy fish fingers', sort: 5 },
    { name: 'Shammi Kebab (6 pcs)', category: 'ready_to_cook', unit: 'piece', price: 799, weight: 0.7, desc: 'Traditional shammi kebabs', sort: 6 },
    { name: 'Chicken Momos (12 pcs)', category: 'ready_to_cook', unit: 'piece', price: 499, weight: 0.9, desc: 'Steamed chicken momos', sort: 7 },
    { name: 'Prawn Tempura (8 pcs)', category: 'ready_to_cook', unit: 'piece', price: 899, weight: 0.7, desc: 'Battered prawn tempura', sort: 8 },

    // Marinades
    { name: 'Tandoori Chicken (2 lb)', category: 'marinades', unit: 'lb', price: 899, weight: 2.0, desc: 'Classic tandoori marinated chicken', sort: 1 },
    { name: 'Lemon Pepper Chicken (2 lb)', category: 'marinades', unit: 'lb', price: 849, weight: 2.0, desc: 'Zesty lemon pepper marinated chicken', sort: 2 },
    { name: 'BBQ Wings (1 lb)', category: 'marinades', unit: 'piece', price: 649, weight: 1.0, desc: 'BBQ sauce marinated wings', sort: 3 },
    { name: 'Garlic Butter Shrimp (1 lb)', category: 'marinades', unit: 'piece', price: 999, weight: 1.0, desc: 'Garlic butter marinated shrimp', sort: 4 },
    { name: 'Teriyaki Chicken (2 lb)', category: 'marinades', unit: 'lb', price: 899, weight: 2.0, desc: 'Japanese teriyaki marinated chicken', sort: 5 },
    { name: 'Harissa Lamb Chops (1 lb)', category: 'marinades', unit: 'piece', price: 1299, weight: 1.0, desc: 'North African harissa marinated lamb', sort: 6 },
    { name: 'Peri Peri Chicken (2 lb)', category: 'marinades', unit: 'lb', price: 899, weight: 2.0, desc: 'Spicy peri peri marinated chicken', sort: 7 },
    { name: 'Cajun Fish Fillet (1 lb)', category: 'marinades', unit: 'piece', price: 799, weight: 1.0, desc: 'Cajun spiced fish fillet', sort: 8 },
  ];

  const insertedProducts: { id: string; name: string; price: number }[] = [];
  for (const p of productData) {
    const [row] = await sql`
      INSERT INTO products (tenant_id, name, description, category, unit, price_per_unit, weight_kg, sort_order)
      VALUES (${tenantId}, ${p.name}, ${p.desc}, ${p.category}, ${p.unit}, ${p.price}, ${p.weight}, ${p.sort})
      RETURNING id
    `;
    insertedProducts.push({ id: row.id, name: p.name, price: p.price });
  }
  console.log(`Seeded ${productData.length} products across 6 categories`);

  // 6. Seed customers
  const customerData = [
    { name: 'Sarah Johnson', phone: '214-555-1001', email: 'sarah.j@email.com', address: '789 Elm St, Dallas, TX 75201' },
    { name: 'Michael Brown', phone: '214-555-1002', email: 'michael.b@email.com', address: '321 Pine Rd, Dallas, TX 75202' },
    { name: 'Emily Davis', phone: '214-555-1003', email: 'emily.d@email.com', address: '555 Maple Ln, Dallas, TX 75204' },
    { name: 'James Wilson', phone: '214-555-1004', email: 'james.w@email.com', address: '100 Cedar Ave, Dallas, TX 75205' },
    { name: 'Jessica Martinez', phone: '214-555-1005', email: 'jessica.m@email.com', address: '200 Birch Blvd, Dallas, TX 75206' },
    { name: 'David Anderson', phone: '214-555-1006', email: 'david.a@email.com', address: '450 Walnut St, Dallas, TX 75207' },
    { name: 'Ashley Taylor', phone: '214-555-1007', email: 'ashley.t@email.com', address: '678 Spruce Dr, Dallas, TX 75208' },
    { name: 'Daniel Thomas', phone: '214-555-1008', email: 'daniel.t@email.com', address: '901 Hickory Way, Dallas, TX 75209' },
    { name: 'Amanda Garcia', phone: '214-555-1009', email: 'amanda.g@email.com', address: '125 Poplar Ct, Dallas, TX 75210' },
    { name: 'Robert Lee', phone: '214-555-1010', email: 'robert.l@email.com', address: '350 Ash Pl, Dallas, TX 75211' },
  ];

  const insertedCustomers: string[] = [];
  for (const c of customerData) {
    const [row] = await sql`
      INSERT INTO customers (tenant_id, phone, name, email, address)
      VALUES (${tenantId}, ${c.phone}, ${c.name}, ${c.email}, ${c.address})
      RETURNING id
    `;
    insertedCustomers.push(row.id);
  }
  console.log(`Seeded ${customerData.length} customers`);

  // 7. Seed dummy orders (spread over last 30 days)
  const statuses = ['pending_payment', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
  const paymentMethods = ['stripe', 'cod', 'pay_at_store'];
  const deliveryMethods = ['pickup', 'delivery'];
  const taxRate = 0.085;

  const orderCount = 25;
  let ordersCreated = 0;

  for (let i = 0; i < orderCount; i++) {
    const customerId = insertedCustomers[Math.floor(Math.random() * insertedCustomers.length)];
    const locationId = locationIds[Math.floor(Math.random() * locationIds.length)];
    const orderCode = generateOrderCode();

    // Pick status — weight more toward delivered/confirmed for realistic data
    const statusWeights = [2, 3, 2, 2, 1, 10, 1]; // heavier on delivered
    const totalWeight = statusWeights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let statusIdx = 0;
    for (let j = 0; j < statusWeights.length; j++) {
      r -= statusWeights[j];
      if (r <= 0) { statusIdx = j; break; }
    }
    const status = statuses[statusIdx];

    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    const deliveryMethod = deliveryMethods[Math.floor(Math.random() * deliveryMethods.length)];
    const paymentStatus = (status === 'delivered' || status === 'confirmed' || status === 'processing' || status === 'ready' || status === 'out_for_delivery') ? 'paid' : (status === 'cancelled' ? 'failed' : 'pending');

    // Pick 1-4 random products for this order
    const itemCount = Math.floor(Math.random() * 4) + 1;
    const shuffled = [...insertedProducts].sort(() => Math.random() - 0.5);
    const orderProducts = shuffled.slice(0, itemCount);

    let subtotal = 0;
    const items: { productId: string; productName: string; quantity: number; unitPrice: number; total: number }[] = [];
    for (const p of orderProducts) {
      const qty = Math.floor(Math.random() * 3) + 1;
      const itemTotal = p.price * qty;
      subtotal += itemTotal;
      items.push({ productId: p.id, productName: p.name, quantity: qty, unitPrice: p.price, total: itemTotal });
    }

    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + tax;
    const createdAt = daysAgo(Math.floor(Math.random() * 30));
    const deliveryAddress = deliveryMethod === 'delivery'
      ? customerData[insertedCustomers.indexOf(customerId)]?.address ?? null
      : null;

    const rating = status === 'delivered' ? (Math.random() > 0.4 ? Math.floor(Math.random() * 3) + 3 : null) : null;
    const source = Math.random() > 0.4 ? 'app' : 'whatsapp';

    const [order] = await sql`
      INSERT INTO orders (tenant_id, location_id, customer_id, order_code, status, payment_method, payment_status, delivery_method, delivery_address, subtotal, tax, total, notes, source, rating, created_at, updated_at)
      VALUES (${tenantId}, ${locationId}, ${customerId}, ${orderCode}, ${status}, ${paymentMethod}, ${paymentStatus}, ${deliveryMethod}, ${deliveryAddress}, ${subtotal}, ${tax}, ${total}, ${null}, ${source}, ${rating}, ${createdAt.toISOString()}, ${createdAt.toISOString()})
      RETURNING id
    `;

    for (const item of items) {
      await sql`
        INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total)
        VALUES (${order.id}, ${item.productId}, ${item.productName}, ${item.quantity}, ${item.unitPrice}, ${item.total})
      `;
    }

    ordersCreated++;
  }

  // Update customer stats
  for (const customerId of insertedCustomers) {
    await sql`
      UPDATE customers SET
        total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = ${customerId}),
        total_spent = COALESCE((SELECT SUM(total) FROM orders WHERE customer_id = ${customerId}), 0),
        last_order_at = (SELECT MAX(created_at) FROM orders WHERE customer_id = ${customerId})
      WHERE id = ${customerId}
    `;
  }

  console.log(`Seeded ${ordersCreated} orders with items`);
  console.log('Seed complete!');
  await sql.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
