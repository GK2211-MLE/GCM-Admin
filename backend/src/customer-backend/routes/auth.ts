import type { FastifyInstance } from 'fastify';
import { customerAuthGuard } from '../middleware/auth.js';
import {
  customerSignupSchema,
  customerLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validation/schemas.js';
import { db } from '../../db/client.js';
import { appUsers, savedAddresses, passwordResets, tenants } from '../../db/schema.js';
import { config } from '../../config.js';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

async function getDefaultTenantId(): Promise<string> {
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1);
  if (!tenant) throw new Error('No tenant found');
  return tenant.id;
}

export async function customerAuthRoutes(app: FastifyInstance) {
  // ── Sign up ─────────────────────────────────────────────────
  app.post('/signup', async (request, reply) => {
    const { email, password, name, phone } = customerSignupSchema.parse(request.body);

    // Check if email already exists
    const [existing] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.email, email))
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const tenantId = await getDefaultTenantId();
    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(appUsers)
      .values({
        tenantId,
        email,
        passwordHash,
        name,
        phone: phone ?? '',
        displayName: name,
        role: 'customer',
      })
      .returning();

    const payload = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: 'customer' as const,
    };

    const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: '8h' });
    const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Store refresh token
    await db
      .update(appUsers)
      .set({ refreshToken, updatedAt: new Date() })
      .where(eq(appUsers.id, user.id));

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        tenantId: user.tenantId,
      },
    };
  });

  // ── Login ───────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const { email, password } = customerLoginSchema.parse(request.body);

    const [user] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, email))
      .limit(1);

    if (!user) {
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
      role: 'customer' as const,
    };

    const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: '8h' });
    const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Store refresh token
    await db
      .update(appUsers)
      .set({ refreshToken, updatedAt: new Date() })
      .where(eq(appUsers.id, user.id));

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        tenantId: user.tenantId,
      },
    };
  });

  // ── Refresh token ───────────────────────────────────────────
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

      // Verify the refresh token matches what is stored
      const [user] = await db
        .select({ id: appUsers.id, refreshToken: appUsers.refreshToken })
        .from(appUsers)
        .where(eq(appUsers.id, payload.id))
        .limit(1);

      if (!user || user.refreshToken !== refreshToken) {
        return reply.code(401).send({ error: 'Invalid refresh token' });
      }

      const newPayload = {
        id: payload.id,
        tenantId: payload.tenantId,
        email: payload.email,
        role: 'customer' as const,
      };

      const accessToken = jwt.sign(newPayload, config.JWT_SECRET, { expiresIn: '8h' });
      const newRefreshToken = jwt.sign(newPayload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });

      // Rotate refresh token
      await db
        .update(appUsers)
        .set({ refreshToken: newRefreshToken, updatedAt: new Date() })
        .where(eq(appUsers.id, payload.id));

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // ── Get current customer ────────────────────────────────────
  app.get('/me', { preHandler: [customerAuthGuard] }, async (request) => {
    const [user] = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        name: appUsers.name,
        phone: appUsers.phone,
        displayName: appUsers.displayName,
        tenantId: appUsers.tenantId,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(eq(appUsers.id, request.customer!.id))
      .limit(1);

    return { user };
  });

  // ── Get full profile with addresses ─────────────────────────
  app.get('/profile', { preHandler: [customerAuthGuard] }, async (request) => {
    const [user] = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        name: appUsers.name,
        phone: appUsers.phone,
        displayName: appUsers.displayName,
        tenantId: appUsers.tenantId,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(eq(appUsers.id, request.customer!.id))
      .limit(1);

    const addresses = await db
      .select()
      .from(savedAddresses)
      .where(eq(savedAddresses.userId, request.customer!.id));

    return { user, addresses };
  });

  // ── Update profile ──────────────────────────────────────────
  app.put('/profile', { preHandler: [customerAuthGuard] }, async (request, reply) => {
    const updates = updateProfileSchema.parse(request.body);

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name) setData.name = updates.name;
    if (updates.phone !== undefined) setData.phone = updates.phone;
    if (updates.displayName) setData.displayName = updates.displayName;

    const [user] = await db
      .update(appUsers)
      .set(setData)
      .where(eq(appUsers.id, request.customer!.id))
      .returning({
        id: appUsers.id,
        email: appUsers.email,
        name: appUsers.name,
        phone: appUsers.phone,
        displayName: appUsers.displayName,
      });

    if (!user) return reply.code(404).send({ error: 'User not found' });

    return { user };
  });

  // ── Forgot password ─────────────────────────────────────────
  app.post('/forgot-password', async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);

    const [user] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.email, email))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If that email is registered, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResets).values({
      userId: user.id,
      token,
      expiresAt,
    });

    // In production, send email with reset link containing the token
    // For now, log it (the frontend would call /reset-password with this token)
    console.log(`[Password Reset] token=${token} for user=${user.id}`);

    return { message: 'If that email is registered, a reset link has been sent.' };
  });

  // ── Reset password ──────────────────────────────────────────
  app.post('/reset-password', async (request, reply) => {
    const { token, password } = resetPasswordSchema.parse(request.body);

    const [resetRecord] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.token, token), eq(passwordResets.used, false)))
      .limit(1);

    if (!resetRecord) {
      return reply.code(400).send({ error: 'Invalid or expired reset token' });
    }

    if (new Date() > resetRecord.expiresAt) {
      return reply.code(400).send({ error: 'Reset token has expired' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and mark token as used
    await db
      .update(appUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(appUsers.id, resetRecord.userId));

    await db
      .update(passwordResets)
      .set({ used: true })
      .where(eq(passwordResets.id, resetRecord.id));

    return { message: 'Password has been reset successfully' };
  });
}
