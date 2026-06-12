import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import type { JwtPayload } from '../types/index.js';

async function authPlugin(fastify: FastifyInstance) {
  // ─── Cookies ────────────────────────────────────────────────────────────
  await fastify.register(fastifyCookie, {
    secret: config.JWT_SECRET, // Signs cookies to prevent client-side tampering
    parseOptions: {},
  });

  // ─── JWT ────────────────────────────────────────────────────────────────
  await fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: {
      cookieName: 'ams_token',
      signed: false, // JWT is self-verifying; cookie signing is separate
    },
    sign: {
      expiresIn: config.JWT_EXPIRY,
    },
  });

  // ─── authenticate decorator ─────────────────────────────────────────────
  // Usage: add `preHandler: [fastify.authenticate]` to any protected route
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }
    }
  );
}

export default fp(authPlugin, { name: 'auth' });

// ─── Cookie helpers (used in auth routes) ───────────────────────────────────

export function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie('ams_token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60, // 15 minutes — matches JWT_EXPIRY
  });
}

export function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie('ams_token', { path: '/' });
}
