/**
 * Client registry — shares client codes with A01.Admin/01_Clients/ billing
 * (e.g. "H001 - Hambaga Investments Kenya Limited").
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/auditLog.js';

const createClientSchema = z.object({
  /// Matches the firm-wide registry pattern: letter + 3 digits
  clientCode: z
    .string()
    .regex(/^[A-Z]\d{3}$/, 'Client code must be a letter followed by 3 digits, e.g. H001'),
  clientName: z.string().min(2),
  entityType: z.string().optional(),
  kraPin: z
    .string()
    .regex(/^[A-Z]\d{9}[A-Z]$/, 'KRA PIN format: letter, 9 digits, letter (e.g. P051591395M)')
    .optional()
    .or(z.literal('')),
  registrationNo: z.string().optional(),
  industry: z.string().optional(),
});

export default async function clientRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ─── GET /clients ───────────────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const { includeInactive } = request.query as { includeInactive?: string };

    const clients = await fastify.prisma.client.findMany({
      where: includeInactive === 'true' ? {} : { isActive: true },
      orderBy: { clientCode: 'asc' },
    });

    return reply.send({ success: true, data: { clients } });
  });

  // ─── POST /clients ──────────────────────────────────────────────────────
  fastify.post('/', async (request, reply) => {
    const parsed = createClientSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid client data',
          details: parsed.error.flatten(),
        },
      });
    }

    const { clientCode, clientName, entityType, kraPin, registrationNo, industry } = parsed.data;

    const existing = await fastify.prisma.client.findUnique({ where: { clientCode } });
    if (existing) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_CLIENT_CODE',
          message: `Client code ${clientCode} is already registered to ${existing.clientName}`,
        },
      });
    }

    const client = await fastify.prisma.client.create({
      data: {
        clientCode,
        clientName,
        entityType: entityType || null,
        kraPin: kraPin || null,
        registrationNo: registrationNo || null,
        industry: industry || null,
      },
    });

    await writeAuditLog(fastify.prisma, {
      actorId: request.user!.sub,
      action: 'CLIENT_CREATED',
      entityType: 'Client',
      entityId: client.id,
      afterState: { clientCode, clientName },
      ipAddress: request.ip,
    });

    return reply.code(201).send({ success: true, data: { client } });
  });
}
