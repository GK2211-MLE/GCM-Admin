import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactMessages, newsletterSubs, tenants } from '../../db/schema.js';
import { contactSchema, newsletterSchema } from '../validation/schemas.js';
import { config } from '../../config.js';
import { sendEmail } from '../../services/email.js';
import { newsletterWelcomeEmail } from '../../services/email-templates.js';

export async function contactRoutes(app: FastifyInstance) {
  // Submit contact form
  app.post('/', async (request, reply) => {
    const data = contactSchema.parse(request.body);

    // Get tenant
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenant) return reply.code(500).send({ error: 'Store not configured' });

    const [message] = await db
      .insert(contactMessages)
      .values({
        tenantId: tenant.id,
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        subject: data.subject ?? null,
        message: data.message,
      })
      .returning();

    return { success: true, message };
  });

  // Subscribe to newsletter (upsert)
  app.post('/newsletter', async (request, reply) => {
    const data = newsletterSchema.parse(request.body);

    // Get tenant
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenant) return reply.code(500).send({ error: 'Store not configured' });

    // Check if already subscribed
    const [existing] = await db
      .select()
      .from(newsletterSubs)
      .where(
        and(
          eq(newsletterSubs.tenantId, tenant.id),
          eq(newsletterSubs.email, data.email),
        ),
      )
      .limit(1);

    if (existing) {
      return { success: true, message: 'Already subscribed' };
    }

    await db
      .insert(newsletterSubs)
      .values({
        tenantId: tenant.id,
        email: data.email,
      });

    // Send newsletter welcome email (fire-and-forget)
    sendEmail(
      data.email,
      `You're in! Welcome to Good Crazy Meat`,
      newsletterWelcomeEmail(data.email, config.CUSTOMER_FRONTEND_URL),
    ).catch((err) => console.error('[newsletter] welcome email failed:', err));

    return { success: true, message: 'Subscribed successfully' };
  });
}
