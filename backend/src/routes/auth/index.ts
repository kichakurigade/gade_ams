import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { setAuthCookie, clearAuthCookie } from '../../plugins/auth.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { config } from '../../config.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const totpVerifySchema = z.object({
  token: z.string().length(6),
});

export default async function authRoutes(fastify: FastifyInstance) {

  // ─── POST /auth/login ──────────────────────────────────────────────────
  // Step 1: Validate credentials. If 2FA enabled, return {requires2fa: true}.
  // Step 2 is /auth/totp/verify.
  fastify.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid credentials format' },
        });
      }

      const { email, password } = parsed.data;

      const user = await fastify.prisma.user.findUnique({ where: { email } });

      // Constant-time comparison even on not-found to prevent user enumeration
      const passwordValid =
        user != null
          ? await bcrypt.compare(password, user.passwordHash)
          : await bcrypt.compare(password, '$2b$12$placeholder.hash.for.timing');

      if (!user || !passwordValid || user.status !== 'ACTIVE') {
        await writeAuditLog(fastify.prisma, {
          action: 'LOGIN_FAILED',
          entityType: 'User',
          entityId: user?.id,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      // If TOTP not yet set up, return setup flow
      if (!user.totpEnabled) {
        // Generate TOTP secret for setup
        const secret = authenticator.generateSecret();
        const otpAuthUrl = authenticator.keyuri(
          user.email,
          config.TOTP_ISSUER,
          secret
        );
        const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);

        // Store secret temporarily (not yet enabled until verified)
        await fastify.prisma.user.update({
          where: { id: user.id },
          data: { totpSecret: secret },
        });

        return reply.code(200).send({
          success: true,
          data: {
            requires2faSetup: true,
            userId: user.id,
            qrDataUrl,
            secret, // For manual entry in authenticator app
          },
        });
      }

      // TOTP is enabled — require verification before issuing JWT
      return reply.code(200).send({
        success: true,
        data: {
          requires2fa: true,
          userId: user.id,
        },
      });
    }
  );

  // ─── POST /auth/totp/verify ────────────────────────────────────────────
  // Verifies TOTP token. On success, issues JWT httpOnly cookie.
  fastify.post(
    '/totp/verify',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = request.body as { userId?: string; token?: string };
      const parsed = z
        .object({ userId: z.string(), token: z.string().length(6) })
        .safeParse(body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'userId and 6-digit token required' },
        });
      }

      const { userId, token } = parsed.data;
      const user = await fastify.prisma.user.findUnique({ where: { id: userId } });

      if (!user?.totpSecret) {
        return reply.code(401).send({
          success: false,
          error: { code: 'TOTP_NOT_CONFIGURED', message: '2FA not configured for this account' },
        });
      }

      const isValid = authenticator.verify({
        token,
        secret: user.totpSecret,
      });

      if (!isValid) {
        await writeAuditLog(fastify.prisma, {
          actorId: user.id,
          action: 'LOGIN_FAILED',
          entityType: 'User',
          entityId: user.id,
          ipAddress: request.ip,
        });

        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_TOTP', message: 'Invalid or expired 2FA code' },
        });
      }

      // Mark TOTP as enabled if this was the setup verification
      if (!user.totpEnabled) {
        await fastify.prisma.user.update({
          where: { id: user.id },
          data: { totpEnabled: true, totpVerifiedAt: new Date() },
        });
      }

      // Update last login
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Issue JWT
      const jwtPayload = { sub: user.id, email: user.email, role: user.role };
      const token_ = fastify.jwt.sign(jwtPayload);
      setAuthCookie(reply, token_);

      await writeAuditLog(fastify.prisma, {
        actorId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(200).send({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        },
      });
    }
  );

  // ─── POST /auth/logout ─────────────────────────────────────────────────
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      await writeAuditLog(fastify.prisma, {
        actorId: request.user?.sub,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: request.user?.sub,
        ipAddress: request.ip,
      });

      clearAuthCookie(reply);
      return reply.code(200).send({ success: true, data: { message: 'Logged out' } });
    }
  );

  // ─── GET /auth/me ──────────────────────────────────────────────────────
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user!.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          lastLoginAt: true,
        },
      });

      if (!user) {
        clearAuthCookie(reply);
        return reply.code(401).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User account not found' },
        });
      }

      return reply.code(200).send({ success: true, data: { user } });
    }
  );
}
