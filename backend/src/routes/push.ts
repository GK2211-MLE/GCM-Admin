import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import webPush from 'web-push';
import { db } from '../db/client.js';
import { pushSubscriptions } from '../db/schema.js';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';
import { config } from '../config.js';

// Configure VAPID keys if available
if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    `mailto:${config.SMTP_USER || 'admin@farm2cook.com'}`,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  );
}

export async function pushRoutes(app: FastifyInstance) {
  // Get VAPID public key
  app.get('/vapid-key', async () => {
    return { key: config.VAPID_PUBLIC_KEY };
  });

  // Subscribe to push notifications
  app.post('/subscribe', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const userId = request.user!.id;
    const { endpoint, keys } = request.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    // Upsert subscription
    await db.delete(pushSubscriptions).where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );

    const [sub] = await db
      .insert(pushSubscriptions)
      .values({
        tenantId,
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .returning();

    return { subscription: sub };
  });

  // Unsubscribe
  app.post('/unsubscribe', { preHandler: [authGuard] }, async (request) => {
    const { endpoint } = request.body as { endpoint: string };
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    return { success: true };
  });

  // Send push notification to all users of a tenant
  app.post('/notify', { preHandler: [authGuard] }, async (request) => {
    const tenantId = getTenantId(request);
    const { title, body, url } = request.body as { title: string; body: string; url?: string };

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.tenantId, tenantId));

    const payload = JSON.stringify({ title, body, url });
    let sent = 0;

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent++;
      } catch {
        // Remove invalid subscriptions
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }

    return { sent, total: subs.length };
  });
}
