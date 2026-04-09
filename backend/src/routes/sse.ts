import type { FastifyInstance, FastifyReply } from 'fastify';
import { authGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

// Map of tenantId -> Set of SSE reply objects
const clients = new Map<string, Set<FastifyReply>>();

export function broadcastSSE(tenantId: string, event: { type: string; data: unknown }) {
  const tenantClients = clients.get(tenantId);
  if (!tenantClients) return;

  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

  for (const reply of tenantClients) {
    try {
      reply.raw.write(payload);
    } catch {
      tenantClients.delete(reply);
    }
  }
}

export async function sseRoutes(app: FastifyInstance) {
  app.get('/events', { preHandler: [authGuard] }, async (request, reply) => {
    const tenantId = getTenantId(request);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ tenantId })}\n\n`);

    // Add to clients
    if (!clients.has(tenantId)) {
      clients.set(tenantId, new Set());
    }
    clients.get(tenantId)!.add(reply);

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // Cleanup on close
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      clients.get(tenantId)?.delete(reply);
      if (clients.get(tenantId)?.size === 0) {
        clients.delete(tenantId);
      }
    });

    // Don't close the reply - keep alive for SSE
    await reply.hijack();
  });
}
