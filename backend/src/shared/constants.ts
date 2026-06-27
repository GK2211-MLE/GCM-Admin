export const ORDER_CODE_PREFIX = 'GCM';
export const TAX_RATE = 0.05;
export const CONVERSATION_TTL_MS = 30 * 60 * 1000;
export const UNIT_WEIGHT_KG = 1;

export const ORDER_STATUSES = {
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
} as const;

export const CATEGORIES = {
  steaks: { label: 'Steaks', icon: '🥩' },
  roasts: { label: 'Roasts', icon: '🍖' },
  ground_beef: { label: 'Ground & Minced', icon: '🥓' },
  ribs_brisket: { label: 'Ribs & Brisket', icon: '🦴' },
  curry_cuts: { label: 'Curry Cuts', icon: '🍲' },
  specialty: { label: 'Specialty Cuts', icon: '✨' },
} as const;

export const STATUS_COLORS: Record<string, string> = {
  pending_payment: 'amber',
  confirmed: 'green',
  processing: 'blue',
  ready: 'violet',
  out_for_delivery: 'cyan',
  delivered: 'emerald',
  cancelled: 'red',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: 'Card (Online)',
  cod: 'Cash on Delivery',
  pay_at_store: 'Pay at Store',
};

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  pickup: 'Store Pickup',
  delivery: 'Home Delivery',
};
