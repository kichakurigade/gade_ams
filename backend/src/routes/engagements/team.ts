/**
 * Engagement team assignment.
 *
 * Independence checks (Module 5) are per team member, so the team must be
 * assigned before acceptance can be completed. Removal is soft (removedAt)
 * to preserve the historical record; re-assigning a removed member clears it.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/auditLog.js';

const TEAM_ROLES = [
  'ENGAGEMENT_PARTNER',
  'EQR_REVIEWER',
  'MANAGER',
  'SENIOR',
  'STAFF',
] as const;

const assignSchema = z.object({
  userId: z.string().min(1),
  teamRole: z.enum(TEAM_ROLES),
});

export default async function teamRoutes(fastify: FastifyInstance) {
  // ─── GET /engagements/:engagementId/team ────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };

    const members = await fastify.prisma.engagementTeam.findMany({
      where: { engagementId, removedAt: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });

    return reply.send({ success: true, data: { members } });
  });

  // ─── POST /engagements/:engagementId/team ───────────────────────────────
  fastify.post('/', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };

    const engagement = await fastify.prisma.engagement.findUnique({
      where: { id: engagementId },
    });
    if (!engagement) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Engagement not found' },
      });
    }
    if (['DECLINED', 'WITHDRAWN', 'SIGNED'].includes(engagement.status)) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'WRONG_STATUS',
          message: `Team cannot be changed on a ${engagement.status} engagement`,
        },
      });
    }

    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId and a valid teamRole are required',
          details: parsed.error.flatten(),
        },
      });
    }
    const { userId, teamRole } = parsed.data;

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found or inactive' },
      });
    }

    // EQR reviewer must be a partner and must not already hold another role here
    if (teamRole === 'EQR_REVIEWER' && !['MANAGING_PARTNER', 'ASSURANCE_PARTNER'].includes(user.role)) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'INVALID_EQR_REVIEWER',
          message: 'The EQR reviewer must be a Managing Partner or Assurance Partner',
        },
      });
    }

    // One member, one role per engagement — upsert revives a removed member
    const member = await fastify.prisma.engagementTeam.upsert({
      where: { engagementId_userId: { engagementId, userId } },
      create: { engagementId, userId, teamRole },
      update: { teamRole, removedAt: null, assignedAt: new Date() },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    await writeAuditLog(fastify.prisma, {
      actorId: request.user!.sub,
      action: 'TEAM_MEMBER_ASSIGNED',
      entityType: 'EngagementTeam',
      entityId: member.id,
      afterState: { engagementId, userId, teamRole },
      ipAddress: request.ip,
    });

    return reply.code(201).send({ success: true, data: { member } });
  });

  // ─── DELETE /engagements/:engagementId/team/:userId ─────────────────────
  fastify.delete('/:userId', async (request, reply) => {
    const { engagementId, userId } = request.params as {
      engagementId: string;
      userId: string;
    };

    const member = await fastify.prisma.engagementTeam.findUnique({
      where: { engagementId_userId: { engagementId, userId } },
    });
    if (!member || member.removedAt) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team member not found on this engagement' },
      });
    }

    const updated = await fastify.prisma.engagementTeam.update({
      where: { engagementId_userId: { engagementId, userId } },
      data: { removedAt: new Date() },
    });

    await writeAuditLog(fastify.prisma, {
      actorId: request.user!.sub,
      action: 'TEAM_MEMBER_REMOVED',
      entityType: 'EngagementTeam',
      entityId: updated.id,
      afterState: { engagementId, userId },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { member: updated } });
  });
}
