import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { config } from './config.js';

const sql = postgres(config.DATABASE_URL, { max: 1 });

// Full migration SQL (idempotent - safe to run every startup)
const migration = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Chicago',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0.05,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  lat REAL,
  lng REAL,
  phone VARCHAR(20) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  location_id UUID REFERENCES locations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(50) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'kg',
  price_per_unit INTEGER NOT NULL,
  weight_kg REAL NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_tenant_category_idx ON products(tenant_id, category);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  address TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_idx ON customers(tenant_id, phone);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  location_id UUID REFERENCES locations(id),
  customer_id UUID REFERENCES customers(id),
  order_code VARCHAR(20) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  payment_method VARCHAR(30) NOT NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  delivery_method VARCHAR(20) NOT NULL,
  delivery_address TEXT,
  subtotal INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  total INTEGER NOT NULL,
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'app',
  stripe_payment_intent_id VARCHAR(255),
  rating INTEGER,
  rating_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_tenant_status_idx ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at);

DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'app';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users(email);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code VARCHAR(50) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_type VARCHAR(10) NOT NULL,
  discount_value INTEGER NOT NULL,
  min_order INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  contact VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  po_number VARCHAR(30) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES admin_users(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  phone VARCHAR(20) NOT NULL,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_slug_idx ON categories(tenant_id, slug);

DO $$ BEGIN ALTER TABLE categories ADD COLUMN description TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE categories ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN slug VARCHAR(255) NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN images JSONB NOT NULL DEFAULT '[]'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 10; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE orders ADD COLUMN app_user_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE orders ADD COLUMN shipping_address JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE orders ALTER COLUMN location_id DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL DEFAULT '',
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer',
  refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_idx ON app_users(email);

CREATE TABLE IF NOT EXISTS saved_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL,
  street TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  zip VARCHAR(20) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS saved_addresses_user_idx ON saved_addresses(user_id);

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS carts_user_idx ON carts(user_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_idx ON cart_items(cart_id, product_id);

DO $$ BEGIN ALTER TABLE locations ADD COLUMN city VARCHAR(100) NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN state VARCHAR(100) NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN zip VARCHAR(20) NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'store'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN email VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'America/Chicago'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0.05; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN operating_hours TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE locations ADD COLUMN maps_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE tenants ADD COLUMN config JSONB NOT NULL DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS wishlists_user_product_idx ON wishlists (user_id, product_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type VARCHAR(30) NOT NULL DEFAULT 'order',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications (tenant_id);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_product_idx ON reviews(user_id, product_id);

CREATE TABLE IF NOT EXISTS store_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_inventory_loc_product_idx ON store_inventory(location_id, product_id);

CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  slug VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_pages_tenant_slug_idx ON cms_pages(tenant_id, slug);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  category VARCHAR(50) NOT NULL DEFAULT '',
  prep_time VARCHAR(50) NOT NULL DEFAULT '',
  cook_time VARCHAR(50) NOT NULL DEFAULT '',
  servings VARCHAR(50) NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS recipes_tenant_slug_idx ON recipes(tenant_id, slug);

DO $$ BEGIN ALTER TABLE products ADD COLUMN is_halal BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN halal_info JSONB NOT NULL DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Per-product trust badges. Default true so existing products carry the
-- same promises that were previously hardcoded as static TRUST_BADGES on
-- the customer detail page; admin can untoggle if a SKU doesn't qualify.
DO $$ BEGIN ALTER TABLE products ADD COLUMN badge_no_antibiotics BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN badge_cold_chain BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN badge_fresh BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================
-- Customer-website tables (added by customer-backend/)
-- All idempotent — safe to run on every startup.
-- ============================================================

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id),
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_user_product_idx ON wishlist_items (user_id, product_id);

CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id),
  rating INTEGER NOT NULL,
  title VARCHAR(255),
  body TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_user_product_idx ON product_reviews (user_id, product_id);

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_idx ON newsletter_subs (tenant_id, email);

-- ============================================================
-- Customer-facing popup fields on the existing promotions table
-- (added Apr 2026 for the storefront homepage popup feature)
-- ============================================================
DO $$ BEGIN ALTER TABLE promotions ADD COLUMN image_url TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE promotions ADD COLUMN show_as_popup BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE promotions ADD COLUMN popup_title VARCHAR(255) NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE promotions ADD COLUMN popup_body TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE promotions ADD COLUMN target_web BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE promotions ADD COLUMN target_app BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================
-- Users & Permissions overhaul (Apr 2026)
-- - admin_users gains phone + assigned_location_id
-- - role_permissions matrix table (per-tenant)
-- - product_locations many-to-many for per-store catalogs
-- - notifications gains location_id for per-store filtering
-- All idempotent.
-- ============================================================

DO $$ BEGIN ALTER TABLE admin_users ADD COLUMN phone VARCHAR(32); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE admin_users ADD COLUMN assigned_location_id UUID REFERENCES locations(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Translate legacy role names to the new ones (idempotent — only updates rows
-- that still have the old values).
UPDATE admin_users SET role = 'admin'         WHERE role = 'owner';
UPDATE admin_users SET role = 'store_manager' WHERE role = 'manager';
UPDATE admin_users SET role = 'store_staff'   WHERE role = 'staff';
ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'store_staff';

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role VARCHAR(20) NOT NULL,
  page_key VARCHAR(50) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_unique_idx
  ON role_permissions(tenant_id, role, page_key);

CREATE TABLE IF NOT EXISTS product_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_locations_unique_idx
  ON product_locations(product_id, location_id);
CREATE INDEX IF NOT EXISTS product_locations_location_idx
  ON product_locations(location_id);

-- Backfill product_locations from the legacy products.location_id column.
INSERT INTO product_locations (product_id, location_id)
SELECT p.id, p.location_id
FROM products p
WHERE p.location_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_locations pl
    WHERE pl.product_id = p.id AND pl.location_id = p.location_id
  );

DO $$ BEGIN ALTER TABLE notifications ADD COLUMN location_id UUID REFERENCES locations(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Backfill empty product slugs. Products inserted via early admin flows
-- (or test scaffolding) sometimes ended up with an empty slug, which makes
-- the customer-side /shop/[slug] URL 404. This one-liner regenerates a
-- slug from the name for any product that still has an empty one.
-- Runs on every boot — a no-op if every product already has a slug.
UPDATE products
SET slug = regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')
WHERE slug IS NULL OR trim(slug) = '';
-- Trim any trailing/leading dashes left over from the replacement.
UPDATE products SET slug = regexp_replace(slug, '(^-+|-+$)', '', 'g') WHERE slug ~ '(^-|-$)';
`;

export async function runStartup(): Promise<string> {
  // Run migrations
  console.log('[startup] Running migrations...');
  await sql.unsafe(migration);
  console.log('[startup] Migrations complete.');

  // Idempotent CMS slug bootstrap. Runs on every boot, NOT inside the
  // first-install block, so existing deployments also get the standard
  // page slugs in their CMS sidebar. Each row is unpublished by default
  // so the customer site falls back to its hardcoded copy until an admin
  // fills the row in and toggles "Published".
  const tenantsForCms = await sql`SELECT id FROM tenants LIMIT 1`;
  if (tenantsForCms.length > 0) {
    const cmsTenantId = tenantsForCms[0].id;
    const standardSlugs = [
      { slug: 'about',    title: 'About Us' },
      { slug: 'privacy',  title: 'Privacy Policy' },
      { slug: 'terms',    title: 'Terms & Conditions' },
      { slug: 'returns',  title: 'Returns & Refunds' },
      { slug: 'shipping', title: 'Shipping & Delivery' },
      { slug: 'faq',      title: 'FAQ' },
    ];
    for (const p of standardSlugs) {
      await sql`
        INSERT INTO cms_pages (tenant_id, slug, title, content, is_published)
        VALUES (${cmsTenantId}, ${p.slug}, ${p.title}, '', false)
        ON CONFLICT (tenant_id, slug) DO NOTHING
      `;
    }
  }

  // Check if seed is needed
  const tenants = await sql`SELECT id FROM tenants LIMIT 1`;
  if (tenants.length > 0) {
    console.log('[startup] Data already exists, skipping seed.');
    await sql.end();
    return tenants[0].id;
  }

  // Seed
  console.log('[startup] Seeding database...');

  const [tenant] = await sql`
    INSERT INTO tenants (name, slug, timezone, currency, tax_rate)
    VALUES ('Farm2Cook', 'farm2cook', 'America/Chicago', 'USD', 0.085)
    ON CONFLICT (slug) DO UPDATE SET name = 'Farm2Cook', tax_rate = 0.085
    RETURNING id
  `;
  const tenantId = tenant.id;
  console.log(`[startup] Tenant: ${tenantId}`);

  const passwordHash = await bcrypt.hash('admin123!', 12);
  await sql`
    INSERT INTO admin_users (tenant_id, email, password_hash, name, role)
    VALUES (${tenantId}, 'admin@farm2cook.com', ${passwordHash}, 'Admin', 'admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}
  `;
  console.log('[startup] Admin user: admin@farm2cook.com / admin123!');

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

  // Seed products
  const productData = [
    { name: 'Whole Chicken', category: 'chicken', unit: 'lb', price: 399, weight: 2.2, desc: 'Farm-fresh whole chicken', sort: 1 },
    { name: 'Chicken Breast (Boneless)', category: 'chicken', unit: 'lb', price: 549, weight: 2.2, desc: 'Premium boneless chicken breast', sort: 2 },
    { name: 'Chicken Thigh', category: 'chicken', unit: 'lb', price: 449, weight: 2.2, desc: 'Juicy chicken thigh pieces', sort: 3 },
    { name: 'Chicken Wings', category: 'chicken', unit: 'lb', price: 499, weight: 2.2, desc: 'Perfect for grilling or frying', sort: 4 },
    { name: 'Goat Curry Cut', category: 'mutton', unit: 'lb', price: 899, weight: 2.2, desc: 'Bone-in goat meat curry cut', sort: 1 },
    { name: 'Goat Leg (Bone-in)', category: 'mutton', unit: 'lb', price: 1049, weight: 2.2, desc: 'Whole goat leg with bone', sort: 2 },
    { name: 'Lamb Chops', category: 'mutton', unit: 'lb', price: 1199, weight: 2.2, desc: 'Premium lamb chops', sort: 3 },
    { name: 'Salmon Fillet', category: 'seafood', unit: 'lb', price: 1299, weight: 1.1, desc: 'Fresh Atlantic salmon fillet', sort: 1 },
    { name: 'Shrimp (Large)', category: 'seafood', unit: 'lb', price: 1099, weight: 1.1, desc: 'Large deveined shrimp', sort: 2 },
    { name: 'Farm Eggs (Dozen)', category: 'eggs', unit: 'dozen', price: 499, weight: 1.5, desc: 'Farm-fresh free-range eggs', sort: 1 },
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
  console.log(`[startup] Seeded ${productData.length} products`);

  // Seed customers
  const customerData = [
    { name: 'Sarah Johnson', phone: '214-555-1001', email: 'sarah.j@email.com', address: '789 Elm St, Dallas, TX 75201' },
    { name: 'Michael Brown', phone: '214-555-1002', email: 'michael.b@email.com', address: '321 Pine Rd, Dallas, TX 75202' },
    { name: 'Emily Davis', phone: '214-555-1003', email: 'emily.d@email.com', address: '555 Maple Ln, Dallas, TX 75204' },
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

  // Seed a few orders
  const statuses = ['confirmed', 'processing', 'delivered', 'delivered', 'delivered'];
  for (let i = 0; i < 5; i++) {
    const customerId = insertedCustomers[i % insertedCustomers.length];
    const locationId = i % 2 === 0 ? locationId1 : locationId2;
    const product = insertedProducts[i % insertedProducts.length];
    const qty = Math.floor(Math.random() * 3) + 1;
    const subtotal = product.price * qty;
    const tax = Math.round(subtotal * 0.085);
    const total = subtotal + tax;

    const [order] = await sql`
      INSERT INTO orders (tenant_id, location_id, customer_id, order_code, status, payment_method, payment_status, delivery_method, subtotal, tax, total, source)
      VALUES (${tenantId}, ${locationId}, ${customerId}, ${'F2C-' + (100000 + i)}, ${statuses[i]}, 'stripe', 'paid', 'delivery', ${subtotal}, ${tax}, ${total}, 'app')
      RETURNING id
    `;
    await sql`
      INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total)
      VALUES (${order.id}, ${product.id}, ${product.name}, ${qty}, ${product.price}, ${subtotal})
    `;
  }

  console.log('[startup] Seed complete!');
  console.log(`[startup] *** TENANT_ID: ${tenantId} ***`);
  await sql.end();
  return tenantId;
}
