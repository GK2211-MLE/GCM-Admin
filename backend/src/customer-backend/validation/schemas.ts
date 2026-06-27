import { z } from 'zod';

export const customerSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  // Phone is required for new signups so we can reach out about orders.
  // Minimum 7 chars to filter out empty/garbage submissions while still
  // accepting international formats.
  phone: z.string().min(7, 'Phone number is required'),
});

export const customerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export const checkoutSchema = z.object({
  items: z.array(z.object({
    product_id: z.string(),
    product_name: z.string(),
    quantity: z.number().min(1),
    unit_price: z.number().min(0),
  })).min(1, 'Cart is empty'),
  fulfillment_type: z.enum(['delivery', 'pickup']).default('delivery'),
  delivery_address_id: z.string().optional(),
  location_id: z.string().optional(),
  notes: z.string().optional(),
  delivery_date: z.string().optional(),
  delivery_time_slot: z.string().optional(),
  coupon_code: z.string().optional(),
  skip_payment: z.boolean().optional(),
  // Contact the customer typed on the checkout form. If provided, the
  // order confirmation email and the customer's profile name are updated
  // to match — otherwise orders placed months after signup stay stuck on
  // whatever name was entered at signup time.
  contact: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
});

export const confirmPaymentSchema = z.object({
  orderNumber: z.string().min(1),
  paymentIntentId: z.string().optional(),
  status: z.string().optional(),
});

export const addressSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(1, 'ZIP is required'),
  is_default: z.boolean().optional(),
});

export const reviewSchema = z.object({
  product_id: z.string(),
  rating: z.number().min(1).max(5),
  title: z.string().optional(),
  body: z.string().optional(),
});

export const couponValidateSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().min(0),
});

export const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1),
});

export const newsletterSchema = z.object({
  email: z.string().email(),
});
