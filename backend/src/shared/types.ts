/* ── Status & Enum Types ────────────────────────────────────── */

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod =
  | 'stripe'
  | 'cod'
  | 'pay_at_store'
  | 'pay_next_delivery'
  | 'upi';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type DeliveryMethod = 'pickup' | 'delivery';

// AdminRole moved to ./permissions.ts (re-exported via shared/index.ts).
// Both legacy values ('owner' | 'manager' | 'staff') and new values
// ('admin' | 'store_manager' | 'store_staff') are accepted for one deploy
// cycle via normalizeLegacyRole().

export type ConversationStep =
  | 'welcome'
  | 'select_location'
  | 'select_category'
  | 'browse_products'
  | 'select_quantity'
  | 'view_cart'
  | 'checkout_name'
  | 'checkout_delivery'
  | 'checkout_address'
  | 'checkout_confirm'
  | 'select_payment'
  | 'awaiting_payment'
  | 'rating'
  | 'done';

/* ── Core Entities ──────────────────────────────────────────── */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  taxRate: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  locationId: string | null;
  name: string;
  description: string;
  category: string;
  unit: string;
  pricePerUnit: number;
  weightKg: number;
  imageUrl: string;
  active: boolean;
  inStock: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  locationId: string;
  customerId: string;
  orderCode: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  stripePaymentIntentId: string | null;
  rating: number | null;
  ratingComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  customer?: Customer;
  location?: Location;
}

export interface AdminUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

export interface ConversationState {
  step: ConversationStep;
  tenantId: string;
  locationId?: string;
  category?: string;
  cart: CartItem[];
  customerName?: string;
  deliveryMethod?: DeliveryMethod;
  deliveryAddress?: string;
  orderId?: string;
  lastActive: number;
  browsePage?: number;
  selectedProductId?: string;
}

export interface Promotion {
  id: string;
  tenantId: string;
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  contact: string;
  phone: string;
  email: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  vendorId: string;
  poNumber: string;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface PushSubscription {
  id: string;
  tenantId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}
