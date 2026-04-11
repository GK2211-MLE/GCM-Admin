import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/* ── Tenants ─────────────────────────────────────────────────── */
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  timezone: varchar('timezone', { length: 50 }).notNull().default('America/Chicago'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  taxRate: real('tax_rate').notNull().default(0.05),
  settings: jsonb('settings').notNull().default({}),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Locations ───────────────────────────────────────────────── */
export const locations = pgTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull().default(''),
  state: varchar('state', { length: 100 }).notNull().default(''),
  zip: varchar('zip', { length: 20 }).notNull().default(''),
  type: varchar('type', { length: 20 }).notNull().default('store'),
  lat: real('lat'),
  lng: real('lng'),
  phone: varchar('phone', { length: 20 }).notNull(),
  email: varchar('email', { length: 255 }),
  timezone: varchar('timezone', { length: 50 }).notNull().default('America/Chicago'),
  taxRate: real('tax_rate').notNull().default(0.05),
  operatingHours: text('operating_hours'),
  mapsUrl: text('maps_url'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Categories ──────────────────────────────────────────────── */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description').notNull().default(''),
    imageUrl: text('image_url').notNull().default(''),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_tenant_slug_idx').on(t.tenantId, t.slug)],
);

/* ── Products ────────────────────────────────────────────────── */
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    locationId: uuid('location_id').references(() => locations.id),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().default(''),
    description: text('description').notNull().default(''),
    categoryId: uuid('category_id').references(() => categories.id),
    category: varchar('category', { length: 50 }).notNull(),
    unit: varchar('unit', { length: 20 }).notNull().default('kg'),
    pricePerUnit: integer('price_per_unit').notNull(),
    weightKg: real('weight_kg').notNull().default(1),
    imageUrl: text('image_url').notNull().default(''),
    images: jsonb('images').notNull().default([]),
    featured: boolean('featured').notNull().default(false),
    active: boolean('active').notNull().default(true),
    inStock: boolean('in_stock').notNull().default(true),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(10),
    sortOrder: integer('sort_order').notNull().default(0),
    isHalal: boolean('is_halal').notNull().default(false),
    halalInfo: jsonb('halal_info').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('products_tenant_category_idx').on(t.tenantId, t.category)],
);

/* ── Customers ───────────────────────────────────────────────── */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    phone: varchar('phone', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    totalOrders: integer('total_orders').notNull().default(0),
    totalSpent: integer('total_spent').notNull().default(0),
    lastOrderAt: timestamp('last_order_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('customers_tenant_phone_idx').on(t.tenantId, t.phone)],
);

/* ── Orders ──────────────────────────────────────────────────── */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    locationId: uuid('location_id').references(() => locations.id),
    customerId: uuid('customer_id').references(() => customers.id),
    orderCode: varchar('order_code', { length: 20 }).notNull().unique(),
    status: varchar('status', { length: 30 }).notNull().default('pending_payment'),
    paymentMethod: varchar('payment_method', { length: 30 }).notNull(),
    paymentStatus: varchar('payment_status', { length: 20 }).notNull().default('pending'),
    deliveryMethod: varchar('delivery_method', { length: 20 }).notNull(),
    deliveryAddress: text('delivery_address'),
    appUserId: uuid('app_user_id'),
    subtotal: integer('subtotal').notNull(),
    tax: integer('tax').notNull(),
    deliveryFee: integer('delivery_fee').notNull().default(0),
    total: integer('total').notNull(),
    shippingAddress: jsonb('shipping_address'),
    notes: text('notes'),
    source: varchar('source', { length: 20 }).notNull().default('app'),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
    rating: integer('rating'),
    ratingComment: text('rating_comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_tenant_status_idx').on(t.tenantId, t.status),
    index('orders_created_idx').on(t.createdAt),
  ],
);

/* ── Order Items ─────────────────────────────────────────────── */
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  productName: varchar('product_name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  total: integer('total').notNull(),
});

/* ── Admin Users ─────────────────────────────────────────────── */
export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('staff'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admin_users_email_idx').on(t.email)],
);

/* ── Promotions ──────────────────────────────────────────────── */
export const promotions = pgTable('promotions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: varchar('code', { length: 50 }).notNull(),
  description: text('description').notNull().default(''),
  discountType: varchar('discount_type', { length: 10 }).notNull(),
  discountValue: integer('discount_value').notNull(),
  minOrder: integer('min_order').notNull().default(0),
  maxUses: integer('max_uses').notNull().default(0),
  usedCount: integer('used_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Vendors ─────────────────────────────────────────────────── */
export const vendors = pgTable('vendors', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  contact: varchar('contact', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Purchase Orders ─────────────────────────────────────────── */
export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  poNumber: varchar('po_number', { length: 30 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  totalAmount: integer('total_amount').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Purchase Order Items ────────────────────────────────────── */
export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  productName: varchar('product_name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitCost: integer('unit_cost').notNull(),
  total: integer('total').notNull(),
});

/* ── Audit Log ───────────────────────────────────────────────── */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    userId: uuid('user_id'),
    action: varchar('action', { length: 50 }).notNull(),
    entity: varchar('entity', { length: 50 }).notNull(),
    entityId: uuid('entity_id'),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_tenant_idx').on(t.tenantId, t.createdAt)],
);

/* ── Push Subscriptions ──────────────────────────────────────── */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => adminUsers.id),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Conversation State (for bot) ────────────────────────────── */
export const conversationStates = pgTable('conversation_states', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  phone: varchar('phone', { length: 20 }).notNull(),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ── Store Inventory (per-location stock) ──────────────────── */
export const storeInventory = pgTable(
  'store_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(10),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('store_inventory_loc_product_idx').on(t.locationId, t.productId)],
);

/* ── App Users (mobile app customers) ────────────────────────── */
export const appUsers = pgTable(
  'app_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull().default(''),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('customer'),
    refreshToken: text('refresh_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_users_email_idx').on(t.email)],
);

/* ── Saved Addresses ─────────────────────────────────────────── */
export const savedAddresses = pgTable(
  'saved_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 50 }).notNull(),
    street: text('street').notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    state: varchar('state', { length: 100 }).notNull(),
    zip: varchar('zip', { length: 20 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saved_addresses_user_idx').on(t.userId)],
);

/* ── Carts ───────────────────────────────────────────────────── */
export const carts = pgTable(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('carts_user_idx').on(t.userId)],
);

/* ── Cart Items ──────────────────────────────────────────────── */
export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cartId: uuid('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id),
    quantity: integer('quantity').notNull().default(1),
    price: integer('price').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cart_items_cart_product_idx').on(t.cartId, t.productId),
  ],
);

/* ── CMS Pages ──────────────────────────────────────────────── */
export const cmsPages = pgTable(
  'cms_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    slug: varchar('slug', { length: 100 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull().default(''),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cms_pages_tenant_slug_idx').on(t.tenantId, t.slug)],
);

/* ── Recipes ────────────────────────────────────────────────── */
export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description').notNull().default(''),
    ingredients: text('ingredients').notNull().default(''),
    instructions: text('instructions').notNull().default(''),
    imageUrl: text('image_url').notNull().default(''),
    category: varchar('category', { length: 50 }).notNull().default(''),
    prepTime: varchar('prep_time', { length: 50 }).notNull().default(''),
    cookTime: varchar('cook_time', { length: 50 }).notNull().default(''),
    servings: varchar('servings', { length: 50 }).notNull().default(''),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('recipes_tenant_slug_idx').on(t.tenantId, t.slug)],
);

/* ── Notifications ──────────────────────────────────────────── */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    type: varchar('type', { length: 30 }).notNull().default('order'), // 'order' | 'payment' | 'inventory'
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    link: varchar('link', { length: 500 }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_tenant_idx').on(t.tenantId)],
);

/* ════════════════════════════════════════════════════════════════
   CUSTOMER WEBSITE TABLES
   Added by customer-backend/ — do not modify
   ════════════════════════════════════════════════════════════════ */

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => appUsers.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wishlist_user_product_idx').on(t.userId, t.productId)],
);

export const productReviews = pgTable(
  'product_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => appUsers.id),
    rating: integer('rating').notNull(),
    title: varchar('title', { length: 255 }),
    body: text('body'),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('product_reviews_user_product_idx').on(t.userId, t.productId)],
);

export const contactMessages = pgTable('contact_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  subject: varchar('subject', { length: 255 }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const newsletterSubs = pgTable(
  'newsletter_subs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('newsletter_email_idx').on(t.tenantId, t.email)],
);
