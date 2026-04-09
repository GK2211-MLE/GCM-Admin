import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  id: string;
  tenantId: string;
  email: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    request.user = payload;
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

export async function ownerGuard(request: FastifyRequest, reply: FastifyReply) {
  await authGuard(request, reply);
  if (reply.sent) return;
  if (request.user?.role !== 'owner') {
    return reply.code(403).send({ error: 'Owner access required' });
  }
}

export async function managerGuard(request: FastifyRequest, reply: FastifyReply) {
  await authGuard(request, reply);
  if (reply.sent) return;
  if (!['owner', 'manager'].includes(request.user?.role ?? '')) {
    return reply.code(403).send({ error: 'Manager access required' });
  }
}
