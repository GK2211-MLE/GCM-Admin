import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { locationRoutes } from './routes/locations.js';
import { orderRoutes } from './routes/orders.js';
import { customerRoutes } from './routes/customers.js';
import { userRoutes } from './routes/users.js';
import { settingsRoutes } from './routes/settings.js';
import { promotionRoutes } from './routes/promotions.js';
import { vendorRoutes } from './routes/vendors.js';
import { purchaseOrderRoutes } from './routes/purchase-orders.js';
import { paymentRoutes } from './routes/payments.js';
import { stripeWebhookRoutes } from './routes/stripe-webhook.js';
import { sseRoutes } from './routes/sse.js';
import { webhookRoutes } from './routes/webhook.js';
import { pushRoutes } from './routes/push.js';
import { simulatorRoutes } from './routes/simulator.js';
import { emailRoutes } from './routes/email.js';
import { invoiceRoutes } from './routes/invoices.js';
import { categoryRoutes } from './routes/categories.js';
import { inventoryRoutes } from './routes/inventory.js';
import { cmsRoutes } from './routes/cms.js';
import { recipeRoutes } from './routes/recipes.js';
import { analyticsRoutes } from './routes/analytics.js';
import { notificationRoutes } from './routes/notifications.js';
import { contactMessageRoutes } from './routes/contact-messages.js';
import { newsletterRoutes } from './routes/newsletter-subs.js';
import { adminReviewRoutes } from './routes/reviews-admin.js';
import { adminWishlistRoutes } from './routes/wishlists-admin.js';

/* ════════════════════════════════════════════════════════════════
   CUSTOMER WEBSITE ROUTES (from customer-backend/)
   Do not modify existing imports above — these are additive only
   ════════════════════════════════════════════════════════════════ */
import { customerAuthRoutes } from './customer-backend/routes/auth.js';
import { customerOrderRoutes } from './customer-backend/routes/orders.js';
import { customerCheckoutRoutes } from './customer-backend/routes/checkout.js';
import { addressRoutes } from './customer-backend/routes/addresses.js';
import { wishlistRoutes } from './customer-backend/routes/wishlist.js';
import { reviewRoutes } from './customer-backend/routes/reviews.js';
import { couponRoutes } from './customer-backend/routes/coupons.js';
import { contactRoutes } from './customer-backend/routes/contact.js';
import { settingsRoutes as customerSettingsRoutes } from './customer-backend/routes/settings.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
          : undefined,
    },
  });

  // Plugins
  await app.register(cors, {
    origin: [
      config.ADMIN_ORIGIN,
      'https://farm2cook-admin-frontend.onrender.com',
      'https://farm2cook-customer.onrender.com',  // customer website
      'http://localhost:5173',  // admin local dev
      'http://localhost:3000',  // customer local dev
    ],
    credentials: true,
  });
  await app.register(formbody);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(productRoutes, { prefix: '/api/products' });
  await app.register(locationRoutes, { prefix: '/api/locations' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(customerRoutes, { prefix: '/api/customers' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(promotionRoutes, { prefix: '/api/promotions' });
  await app.register(vendorRoutes, { prefix: '/api/vendors' });
  await app.register(purchaseOrderRoutes, { prefix: '/api/purchase-orders' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(stripeWebhookRoutes, { prefix: '/api/stripe' });
  await app.register(sseRoutes, { prefix: '/api/sse' });
  await app.register(webhookRoutes, { prefix: '/api/webhook' });
  await app.register(pushRoutes, { prefix: '/api/push' });
  await app.register(simulatorRoutes, { prefix: '/api/simulator' });
  await app.register(emailRoutes, { prefix: '/api/email' });
  await app.register(invoiceRoutes, { prefix: '/api/invoices' });
  await app.register(categoryRoutes, { prefix: '/api/categories' });
  await app.register(inventoryRoutes, { prefix: '/api/inventory' });
  await app.register(cmsRoutes, { prefix: '/api/cms' });
  await app.register(recipeRoutes, { prefix: '/api/recipes' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(contactMessageRoutes, { prefix: '/api/contact-messages' });
  await app.register(newsletterRoutes, { prefix: '/api/newsletter-subs' });
  await app.register(adminReviewRoutes, { prefix: '/api/admin/reviews' });
  await app.register(adminWishlistRoutes, { prefix: '/api/admin/wishlists' });

  /* ════════════════════════════════════════════════════════════════
     CUSTOMER WEBSITE ROUTES (from customer-backend/)
     All prefixed with /api/customer/ — separate from admin routes
     ════════════════════════════════════════════════════════════════ */
  await app.register(customerAuthRoutes, { prefix: '/api/customer/auth' });
  await app.register(customerOrderRoutes, { prefix: '/api/customer/orders' });
  await app.register(customerCheckoutRoutes, { prefix: '/api/customer/checkout' });
  await app.register(addressRoutes, { prefix: '/api/customer/addresses' });
  await app.register(wishlistRoutes, { prefix: '/api/customer/wishlist' });
  await app.register(reviewRoutes, { prefix: '/api/customer/reviews' });
  await app.register(couponRoutes, { prefix: '/api/customer/coupons' });
  await app.register(contactRoutes, { prefix: '/api/customer/contact' });
  await app.register(customerSettingsRoutes, { prefix: '/api/customer/settings' });

  return app;
}
