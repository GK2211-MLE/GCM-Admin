import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';

export interface CustomerJwtPayload {
  id: string;
  tenantId: string;
  email: string;
  role: 'customer';
}

declare module 'fastify' {
  interface FastifyRequest {
    customer?: CustomerJwtPayload;
  }
}

export async function customerAuthGuard(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as CustomerJwtPayload;
    if (payload.role !== 'customer') {
      return reply.code(403).send({ error: 'Customer access required' });
    }
    request.customer = payload;
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

/**
 * Like customerAuthGuard but never rejects. If a valid customer token
 * is present, request.customer is attached. If not, the request
 * continues as anonymous and the route handler can branch on
 * `request.customer` being undefined (e.g. guest checkout flow).
 */
export async function customerAuthOptional(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return;
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as CustomerJwtPayload;
    if (payload.role === 'customer') {
      request.customer = payload;
    }
  } catch {
    // Bad token is fine — fall through as anonymous.
  }
}
