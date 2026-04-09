import Stripe from 'stripe';
import { config } from '../config.js';

let stripe: Stripe | null = null;

function getStripe(): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    stripe = new Stripe(config.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export async function createPaymentIntent(
  amountCents: number,
  orderCode: string,
): Promise<Stripe.PaymentIntent | null> {
  const s = getStripe();
  if (!s) {
    console.warn('Stripe not configured. Skipping payment intent creation.');
    return null;
  }

  return s.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata: { orderCode },
    automatic_payment_methods: { enabled: true },
  });
}

export async function createRefund(
  paymentIntentId: string,
): Promise<Stripe.Refund | null> {
  const s = getStripe();
  if (!s) {
    console.warn('Stripe not configured. Skipping refund.');
    return null;
  }

  return s.refunds.create({ payment_intent: paymentIntentId });
}

export async function constructWebhookEvent(
  body: string | Buffer,
  signature: string,
): Promise<Stripe.Event | null> {
  const s = getStripe();
  if (!s || !config.STRIPE_WEBHOOK_SECRET) return null;

  return s.webhooks.constructEvent(body, signature, config.STRIPE_WEBHOOK_SECRET);
}
