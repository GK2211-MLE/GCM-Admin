export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'stripe' | 'cod' | 'pay_at_store';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type DeliveryMethod = 'pickup' | 'delivery';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  orderCode: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  deliveryMethod: string;
  deliveryAddress: string | null;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  rating: number | null;
  ratingComment: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  location: {
    id: string;
    name: string;
    address: string;
  } | null;
  items: OrderItem[];
  itemCount?: number;
}

export type OrderSource = 'app' | 'whatsapp';

export interface OrderListItem {
  id: string;
  orderCode: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  deliveryMethod: string;
  total: number;
  createdAt: string;
  customer: { name: string; phone: string } | null;
  location: { name: string } | null;
  items: OrderItem[];
  itemCount?: number;
  source?: OrderSource | null;
}

export interface OrderFilters {
  status?: OrderStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface OrderCreate {
  customerId: string;
  locationId: string;
  items: Array<{ productId: string; quantity: number }>;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface OrderUpdate {
  status?: OrderStatus;
  notes?: string;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending_payment: 'warning',
  confirmed: 'info',
  processing: 'info',
  ready: 'success',
  out_for_delivery: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

export const STATUS_FLOW: OrderStatus[] = [
  'pending_payment',
  'confirmed',
  'processing',
  'ready',
  'out_for_delivery',
  'delivered',
];

export const PAYMENT_LABELS: Record<string, string> = {
  stripe: 'Card (Online)',
  cod: 'Cash on Delivery',
  pay_at_store: 'Pay at Store',
};

export function getOrderDisplayId(order: { orderCode: string; id: string }): string {
  return order.orderCode || order.id.slice(0, 8).toUpperCase();
}

export function formatCents(cents: number): number {
  return cents / 100;
}
