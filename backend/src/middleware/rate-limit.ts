import type { FastifyRequest, FastifyReply } from 'fastify';

const hitCounts = new Map<string, { count: number; resetAt: number }>();

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const { windowMs = 60_000, max = 60 } = options;

  return async function rateLimitHandler(request: FastifyRequest, reply: FastifyReply) {
    const key = request.ip;
    const now = Date.now();
    const entry = hitCounts.get(key);

    if (!entry || now > entry.resetAt) {
      hitCounts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    entry.count++;
    if (entry.count > max) {
      reply.header('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return reply.code(429).send({ error: 'Too many requests' });
    }
  };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hitCounts) {
    if (now > entry.resetAt) {
      hitCounts.delete(key);
    }
  }
}, 5 * 60_000).unref();
