import type { FastifyInstance } from 'fastify';
import acceptanceRoutes from './acceptance.js';
import kycRoutes from './kyc.js';
import teamRoutes from './team.js';
import materialityRoutes from './materiality.js';

export default async function engagementRoutes(fastify: FastifyInstance) {
  // All engagement routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // ─── GET /engagements ──────────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const engagements = await fastify.prisma.engagement.findMany({
      include: {
        client: { select: { clientCode: true, clientName: true } },
        team: {
          where: { removedAt: null },
          include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: { engagements } });
  });

  // ─── POST /engagements ─────────────────────────────────────────────────
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const { clientId, periodStart, periodEnd, fsFramework } = body as {
      clientId: string;
      periodStart: string;
      periodEnd: string;
      fsFramework: string;
    };

    if (!clientId || !periodStart || !periodEnd || !fsFramework) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'clientId, periodStart, periodEnd, fsFramework required' },
      });
    }

    const client = await fastify.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return reply.code(404).send({
        success: false,
        error: { code: 'CLIENT_NOT_FOUND', message: 'Client not found' },
      });
    }

    const year = new Date(periodEnd).getFullYear();
    const engagementCode = `${client.clientCode}-${year}`;

    // Check for duplicate
    const existing = await fastify.prisma.engagement.findUnique({
      where: { engagementCode },
    });
    if (existing) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_ENGAGEMENT',
          message: `Engagement ${engagementCode} already exists`,
        },
      });
    }

    const engagement = await fastify.prisma.engagement.create({
      data: {
        clientId,
        engagementCode,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        fsFramework: fsFramework as never,
        createdBy: request.user!.sub,
        status: 'ACCEPTANCE',
      },
    });

    return reply.code(201).send({ success: true, data: { engagement } });
  });

  // ─── GET /engagements/:id ──────────────────────────────────────────────
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const engagement = await fastify.prisma.engagement.findUnique({
      where: { id },
      include: {
        client: true,
        team: {
          where: { removedAt: null },
          include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
        acceptance: { include: { independenceChecks: true } },
        kycEvaluation: true,
      },
    });

    if (!engagement) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Engagement not found' },
      });
    }

    return reply.send({ success: true, data: { engagement } });
  });

  // ─── Nested acceptance routes ──────────────────────────────────────────
  await fastify.register(acceptanceRoutes, { prefix: '/:engagementId/acceptance' });

  // ─── Nested KYC/AML routes ─────────────────────────────────────────────
  await fastify.register(kycRoutes, { prefix: '/:engagementId/kyc' });

  // ─── Nested team routes ────────────────────────────────────────────────
  await fastify.register(teamRoutes, { prefix: '/:engagementId/team' });

  // ─── Nested materiality routes (Module 7) ──────────────────────────────
  await fastify.register(materialityRoutes, { prefix: '/:engagementId/materiality' });
}
