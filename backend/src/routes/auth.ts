import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import { config } from '../config.js';
import { loginSchema } from '../shared/index.js';
import { authGuard } from '../middleware/auth.js';

export async function authRoutes(app: FastifyInstance) {
  // Login
  app.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    const [user] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);

    if (!user || !user.active) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const payload = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  });

  // Refresh token
  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) {
      return reply.code(400).send({ error: 'Refresh token required' });
    }

    try {
      const payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as {
        id: string;
        tenantId: string;
        email: string;
        role: string;
      };

      const newPayload = {
        id: payload.id,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
      };

      const accessToken = jwt.sign(newPayload, config.JWT_SECRET, { expiresIn: '24h' });
      const newRefreshToken = jwt.sign(newPayload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // Get current user
  app.get('/me', { preHandler: [authGuard] }, async (request) => {
    const [user] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        tenantId: adminUsers.tenantId,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, request.user!.id))
      .limit(1);

    return { user };
  });
}
