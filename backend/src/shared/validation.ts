import { z } from 'zod';

/* ── Enum schemas ───────────────────────────────────────────── */

export const orderStatusSchema = z.enum([
  'pending_payment',
  'confirmed',
  'processing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

export const paymentMethodSchema = z.enum([
  'stripe',
  'cod',
  'pay_at_store',
]);

export const deliveryMethodSchema = z.enum(['pickup', 'delivery']);

/* ── Auth ────────────────────────────────────────────────────── */

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* ── Orders ──────────────────────────────────────────────────── */

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  notes: z.string().optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const bulkStatusUpdateSchema = z.object({
  orderIds: z.array(z.string().uuid()),
  status: orderStatusSchema,
});
export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;

export const orderFilterSchema = z.object({
  status: orderStatusSchema.optional(),
  locationId: z.string().uuid().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  deliveryMethod: deliveryMethodSchema.optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'total', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type OrderFilterInput = z.infer<typeof orderFilterSchema>;

/* ── Invoices ────────────────────────────────────────────────── */

export const invoiceFilterSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type InvoiceFilterInput = z.infer<typeof invoiceFilterSchema>;

/* ── Categories ──────────────────────────────────────────────── */

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(100).optional(),
  imageUrl: z.string().default(''),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/* ── Products ────────────────────────────────────────────────── */

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().optional(),
  description: z.string().default(''),
  category: z.string().min(1),
  unit: z.string().default('lb'),
  pricePerUnit: z.number().positive(),
  weightKg: z.number().positive().default(1),
  imageUrl: z.string().default(''),
  locationId: z.string().uuid().nullable().default(null),
  // Empty/undefined array means "available at all locations". Otherwise the
  // product is only available at the listed locations. Source of truth is
  // the product_locations join table — this field just shapes the request.
  locationIds: z.array(z.string().uuid()).optional(),
  active: z.boolean().default(true),
  inStock: z.boolean().default(true),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(10),
  sortOrder: z.number().int().default(0),
  isHalal: z.boolean().default(false),
  halalInfo: z.record(z.unknown()).default({}),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/* ── Locations ───────────────────────────────────────────────── */

export const createLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1),
  city: z.string().default(''),
  state: z.string().default(''),
  zip: z.string().default(''),
  type: z.string().default('store'),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  operatingHours: z.string().optional().or(z.literal('')),
  timezone: z.string().default('America/Chicago'),
  taxRate: z.number().min(0).max(1).default(0.05),
  active: z.boolean().default(true),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

/* ── Pagination ──────────────────────────────────────────────── */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

/* ── Settings ────────────────────────────────────────────────── */

export const updateSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  settings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/* ── Customers ───────────────────────────────────────────────── */

export const createCustomerSchema = z.object({
  phone: z.string().min(1),
  name: z.string().nullable().default(null),
  email: z.string().email().nullable().default(null),
  address: z.string().nullable().default(null),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/* ── Promotions ──────────────────────────────────────────────── */

export const createPromotionSchema = z.object({
  code: z.string().min(1).max(50),
  description: z.string().default(''),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().positive(),
  minOrder: z.number().min(0).default(0),
  maxUses: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  startsAt: z.string(),
  expiresAt: z.string(),
  // Customer-facing popup fields (all optional, default to "no popup")
  imageUrl: z.string().default(''),
  showAsPopup: z.boolean().default(false),
  popupTitle: z.string().default(''),
  popupBody: z.string().default(''),
  targetWeb: z.boolean().default(true),
  targetApp: z.boolean().default(true),
});
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = createPromotionSchema.partial();
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

/* ── Payments ───────────────────────────────────────────────── */

export const paymentFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  paymentMethod: paymentMethodSchema.optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});
export type PaymentFilterInput = z.infer<typeof paymentFilterSchema>;

export const refundSchema = z.object({
  reason: z.string().optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;

/* ── Inventory ──────────────────────────────────────────────── */

export const updateStockSchema = z.object({
  stockQuantity: z.number().int().min(0).optional(),
  adjustment: z.number().int().optional(),
}).refine(data => data.stockQuantity !== undefined || data.adjustment !== undefined, {
  message: 'Either stockQuantity or adjustment must be provided',
});
export type UpdateStockInput = z.infer<typeof updateStockSchema>;

export const updateThresholdSchema = z.object({
  lowStockThreshold: z.number().int().min(0),
});
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

export const inventoryFilterSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  stockStatus: z.enum(['all', 'in_stock', 'low_stock', 'out_of_stock']).default('all'),
  sortBy: z.enum(['name', 'stock', 'price', 'category']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type InventoryFilterInput = z.infer<typeof inventoryFilterSchema>;
