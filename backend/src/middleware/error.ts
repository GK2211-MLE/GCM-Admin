import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'Validation error',
      details: error.flatten().fieldErrors,
    });
  }

  if (error.statusCode) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  return reply.code(500).send({ error: 'Internal server error' });
}
