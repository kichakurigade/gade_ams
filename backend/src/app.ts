import Fastify from 'fastify';
import { config } from './config.js';

// Plugins
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import multipartPlugin from './plugins/multipart.js';

// Routes
import authRoutes from './routes/auth/index.js';
import engagementRoutes from './routes/engagements/index.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'warn' : 'info',
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
    },
    trustProxy: true, // Nginx sets X-Forwarded-For
  });

  // ─── Plugins (order matters) ─────────────────────────────────────────────
  await fastify.register(prismaPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin);
  await fastify.register(multipartPlugin);

  // ─── Routes ──────────────────────────────────────────────────────────────
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(engagementRoutes, { prefix: '/engagements' });

  // ─── Health check ────────────────────────────────────────────────────────
  fastify.get('/health', { config: { rateLimit: { max: 500 } } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // ─── Global error handler ────────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    if (error.validation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.validation,
        },
      });
    }

    if (error.statusCode === 401) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: error.message },
      });
    }

    if (error.statusCode === 403) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: error.message },
      });
    }

    return reply.code(error.statusCode ?? 500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message:
          config.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : error.message,
      },
    });
  });

  return fastify;
}
