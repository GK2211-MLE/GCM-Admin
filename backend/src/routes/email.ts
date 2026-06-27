import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';

export async function emailRoutes(app: FastifyInstance) {
  // Send a test email
  app.post('/send', { preHandler: [authGuard] }, async (request, reply) => {
    const { to, subject, html } = request.body as {
      to: string;
      subject: string;
      html: string;
    };

    try {
      await sendEmail(to, subject, html);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[email/send] SMTP error:', message);
      return reply.code(500).send({ error: 'Failed to send email', detail: message });
    }
  });

  // Send order confirmation email
  app.post('/order-confirmation', { preHandler: [authGuard] }, async (request, reply) => {
    const { to, orderCode, total } = request.body as {
      to: string;
      orderCode: string;
      total: string;
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Order Confirmed!</h2>
        <p>Your order <strong>${orderCode}</strong> has been confirmed.</p>
        <p>Total: <strong>${total}</strong></p>
        <p>Thank you for ordering from Good Crazy Meat!</p>
      </div>
    `;

    try {
      await sendEmail(to, `Order ${orderCode} Confirmed - Good Crazy Meat`, html);
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to send email' });
    }
  });
}
