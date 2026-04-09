import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { handleIncomingMessage } from '../bot/engine.js';

export async function webhookRoutes(app: FastifyInstance) {
  // WhatsApp webhook verification (Meta)
  app.get('/whatsapp', async (request, reply) => {
    const query = request.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === config.META_VERIFY_TOKEN
    ) {
      return reply.send(query['hub.challenge']);
    }

    return reply.code(403).send('Forbidden');
  });

  // WhatsApp incoming messages (Meta)
  app.post('/whatsapp', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    try {
      const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
      const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
      const value = changes?.value as Record<string, unknown>;
      const messages = value?.messages as Array<Record<string, unknown>>;

      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from as string;
        const text = (msg.text as Record<string, string>)?.body ?? '';
        const messageType = msg.type as string;

        await handleIncomingMessage({
          provider: 'meta',
          from,
          text,
          messageType,
        });
      }
    } catch (err) {
      console.error('WhatsApp webhook error:', err);
    }

    return reply.send('OK');
  });

  // Twilio incoming SMS/WhatsApp
  app.post('/twilio', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const from = body.From ?? '';
    const text = body.Body ?? '';

    try {
      await handleIncomingMessage({
        provider: 'twilio',
        from: from.replace('whatsapp:', ''),
        text,
        messageType: 'text',
      });
    } catch (err) {
      console.error('Twilio webhook error:', err);
    }

    reply.header('Content-Type', 'text/xml');
    return '<Response></Response>';
  });
}
