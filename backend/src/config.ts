import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  BASE_URL: z.string().default('http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default(''),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TAX_RATE: z.coerce.number().default(0.05),
  DEFAULT_TIMEZONE: z.string().default('America/Chicago'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  META_VERIFY_TOKEN: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  META_ACCESS_TOKEN: z.string().default(''),
  META_PHONE_NUMBER_ID: z.string().default(''),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_PHONE_NUMBER: z.string().default(''),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  ADMIN_ORIGIN: z.string().default('http://localhost:5173'),
  // Resend HTTP email API (preferred over SMTP for cloud hosts that block
  // outbound SMTP ports). Sign up at resend.com, get an API key, set here.
  RESEND_API_KEY: z.string().default(''),
  // Google OAuth (customer site only — leave empty to disable)
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  CUSTOMER_FRONTEND_URL: z.string().default('http://localhost:3000'),
  // Comma-separated list of customer emails that bypass Stripe checkout
  // entirely. Their orders are auto-marked confirmed + paid so we can
  // test the full order flow without burning cards or hitting the live
  // Stripe account. Real customer emails NOT in this list still pay
  // normally. Leave empty in production to disable the bypass.
  TEST_BYPASS_EMAILS: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();

export function printBanner(): void {
  console.log(`
  ====================================
    Good Crazy Meat API
    env:  ${config.NODE_ENV}
    port: ${config.PORT}
  ====================================
  `);
}
