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
  return `GCM-${String(Math.floor(100000 + Math.random() * 900000))}`;
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
    VALUES ('Good Crazy Meat', 'gcm', 'America/Chicago', 'USD', 0.085)
    ON CONFLICT (slug) DO UPDATE SET name = 'Good Crazy Meat', tax_rate = 0.085
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

  // 5. Seed products — beef only (prices in cents, units in lb)
  const productData = [
    // Steaks
    { name: 'Ribeye Steak', category: 'steaks', unit: 'lb', price: 1499, weight: 1.0, desc: 'USDA Choice ribeye steak, beautifully marbled', sort: 1 },
    { name: 'NY Strip Steak', category: 'steaks', unit: 'lb', price: 1399, weight: 1.0, desc: 'Classic New York strip steak, firm and flavorful', sort: 2 },
    { name: 'T-Bone Steak', category: 'steaks', unit: 'lb', price: 1599, weight: 1.0, desc: 'Two steaks in one — tenderloin and strip', sort: 3 },
    { name: 'Filet Mignon', category: 'steaks', unit: 'lb', price: 2499, weight: 1.0, desc: 'Premium center-cut filet mignon, ultra-tender', sort: 4 },
    { name: 'Sirloin Steak', category: 'steaks', unit: 'lb', price: 1099, weight: 1.0, desc: 'Lean, bold-flavored top sirloin steak', sort: 5 },
    { name: 'Flat Iron Steak', category: 'steaks', unit: 'lb', price: 1199, weight: 1.0, desc: 'Tender flat iron, great for grilling', sort: 6 },
    { name: 'Skirt Steak', category: 'steaks', unit: 'lb', price: 999, weight: 1.0, desc: 'Flavorful skirt steak, perfect for fajitas', sort: 7 },
    { name: 'Flank Steak', category: 'steaks', unit: 'lb', price: 1049, weight: 1.0, desc: 'Lean flank steak, ideal for marinating', sort: 8 },

    // Roasts
    { name: 'Chuck Roast', category: 'roasts', unit: 'lb', price: 799, weight: 2.2, desc: 'Classic bone-in chuck roast for slow cooking', sort: 1 },
    { name: 'Prime Rib Roast', category: 'roasts', unit: 'lb', price: 1799, weight: 2.2, desc: 'Bone-in prime rib roast, the ultimate centerpiece', sort: 2 },
    { name: 'Rump Roast', category: 'roasts', unit: 'lb', price: 749, weight: 2.2, desc: 'Lean rump roast, great for pot roast', sort: 3 },
    { name: 'Eye of Round Roast', category: 'roasts', unit: 'lb', price: 699, weight: 2.2, desc: 'Lean and tender eye of round roast', sort: 4 },
    { name: 'Tri-Tip Roast', category: 'roasts', unit: 'lb', price: 999, weight: 2.2, desc: 'California-style tri-tip, great for grilling', sort: 5 },
    { name: 'Bottom Round Roast', category: 'roasts', unit: 'lb', price: 649, weight: 2.2, desc: 'Budget-friendly bottom round, best braised', sort: 6 },

    // Ground & Minced
    { name: 'Ground Beef (80/20)', category: 'ground_beef', unit: 'lb', price: 699, weight: 1.0, desc: 'Premium 80% lean ground beef for burgers', sort: 1 },
    { name: 'Ground Beef (85/15)', category: 'ground_beef', unit: 'lb', price: 749, weight: 1.0, desc: 'Leaner 85/15 ground beef for everyday cooking', sort: 2 },
    { name: 'Ground Beef (90/10)', category: 'ground_beef', unit: 'lb', price: 849, weight: 1.0, desc: 'Extra lean 90/10 ground beef', sort: 3 },
    { name: 'Beef Keema (Minced)', category: 'ground_beef', unit: 'lb', price: 799, weight: 1.0, desc: 'Finely minced beef for keema and kofta', sort: 4 },
    { name: 'Beef Patties (4 pcs)', category: 'ground_beef', unit: 'piece', price: 999, weight: 0.9, desc: 'Hand-formed beef burger patties', sort: 5 },
    { name: 'Chuck Ground Beef', category: 'ground_beef', unit: 'lb', price: 749, weight: 1.0, desc: 'Ground from chuck for rich beefy flavor', sort: 6 },

    // Ribs & Brisket
    { name: 'Beef Short Ribs', category: 'ribs_brisket', unit: 'lb', price: 899, weight: 2.2, desc: 'Meaty bone-in short ribs for slow braising', sort: 1 },
    { name: 'Beef Back Ribs', category: 'ribs_brisket', unit: 'lb', price: 849, weight: 2.2, desc: 'Classic beef back ribs for smoking or grilling', sort: 2 },
    { name: 'Whole Beef Brisket', category: 'ribs_brisket', unit: 'lb', price: 799, weight: 2.2, desc: 'Whole packer brisket, perfect for smoking', sort: 3 },
    { name: 'Beef Brisket (Flat)', category: 'ribs_brisket', unit: 'lb', price: 849, weight: 2.2, desc: 'Brisket flat cut, leaner for corning or smoking', sort: 4 },
    { name: 'Beef Plate Ribs', category: 'ribs_brisket', unit: 'lb', price: 999, weight: 2.2, desc: 'Dino-style plate ribs for low and slow BBQ', sort: 5 },
    { name: 'Flanken Ribs', category: 'ribs_brisket', unit: 'lb', price: 949, weight: 2.2, desc: 'Cross-cut ribs for Korean BBQ and grilling', sort: 6 },

    // Curry Cuts
    { name: 'Beef Curry Cut (Bone-In)', category: 'curry_cuts', unit: 'lb', price: 749, weight: 2.2, desc: 'Mixed bone-in beef pieces for curries and stews', sort: 1 },
    { name: 'Beef Stew Meat', category: 'curry_cuts', unit: 'lb', price: 699, weight: 2.2, desc: 'Pre-cut beef cubes perfect for slow-cooked stews', sort: 2 },
    { name: 'Beef Shank (Cross-Cut)', category: 'curry_cuts', unit: 'lb', price: 799, weight: 2.2, desc: 'Cross-cut beef shank with marrow bone', sort: 3 },
    { name: 'Beef Nihari Cut', category: 'curry_cuts', unit: 'lb', price: 849, weight: 2.2, desc: 'Traditional nihari cut for slow-braised curry', sort: 4 },
    { name: 'Beef Chuck Cubes', category: 'curry_cuts', unit: 'lb', price: 749, weight: 2.2, desc: 'Tender chuck cubes for curries and pot roast', sort: 5 },
    { name: 'Beef Neck Pieces', category: 'curry_cuts', unit: 'lb', price: 649, weight: 2.2, desc: 'Bone-in neck pieces, rich in collagen for broths', sort: 6 },

    // Specialty Cuts
    { name: 'Beef Oxtail', category: 'specialty', unit: 'lb', price: 999, weight: 2.2, desc: 'Slow-braised oxtail, rich and gelatinous', sort: 1 },
    { name: 'Beef Marrow Bones', category: 'specialty', unit: 'lb', price: 699, weight: 2.2, desc: 'Halved marrow bones for roasting or broths', sort: 2 },
    { name: 'Beef Liver', category: 'specialty', unit: 'lb', price: 499, weight: 1.1, desc: 'Fresh beef liver, nutrient-dense and tender', sort: 3 },
    { name: 'Beef Tongue', category: 'specialty', unit: 'lb', price: 799, weight: 2.2, desc: 'Whole beef tongue for slow braising', sort: 4 },
    { name: 'Beef Cheeks', category: 'specialty', unit: 'lb', price: 899, weight: 1.1, desc: 'Melt-in-your-mouth braised beef cheeks', sort: 5 },
    { name: 'Beef Tripe', category: 'specialty', unit: 'lb', price: 549, weight: 1.1, desc: 'Cleaned beef tripe for soups and stews', sort: 6 },
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
  console.log(`Seeded ${productData.length} products across 6 beef categories`);

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

    const statusWeights = [2, 3, 2, 2, 1, 10, 1];
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
