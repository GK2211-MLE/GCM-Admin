import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Extracts tenant ID from the authenticated user's JWT payload.
 * Must be used AFTER authGuard.
 */
export function getTenantId(request: FastifyRequest): string {
  const tenantId = request.user?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant ID not found in token');
  }
  return tenantId;
}

/**
 * Middleware: ensures tenantId is present on the request.
 */
export async function tenantGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    getTenantId(request);
  } catch {
    return reply.code(400).send({ error: 'Tenant context required' });
  }
}
