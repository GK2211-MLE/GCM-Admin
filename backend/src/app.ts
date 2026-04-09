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
    origin: [config.ADMIN_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'],
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

  return app;
}
