/**
 * Module 5: Engagement Acceptance & Continuance (P003)
 *
 * Governance scoring: 7 factors × max 3 points = 21
 *   Normal ≤ 9 | GTN 10–15 | MGTN 16–21
 * Risk classification → eqrRequired flag → team assignment → independence checks
 * 3-tier approval: Preparer → Reviewer → Approving Partner (MANAGING_PARTNER or ASSURANCE_PARTNER)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/auditLog.js';

// ─── Governance factors (7 factors as per P003 policy) ────────────────────
const GOV_FACTOR_CODES = [
  'MGMT_INTEGRITY',
  'CORPORATE_GOVERNANCE',
  'FINANCIAL_STABILITY',
  'INDUSTRY_RISK',
  'REGULATORY_ENVIRONMENT',
  'RELATED_PARTY_COMPLEXITY',
  'AUDIT_HISTORY',
] as const;

type GovFactorCode = (typeof GOV_FACTOR_CODES)[number];

const govFlagSchema = z.object({
  factorCode: z.enum(GOV_FACTOR_CODES),
  factorName: z.string(),
  score: z.number().int().min(0).max(3),
  notes: z.string().optional(),
});

const acceptanceSubmitSchema = z.object({
  govFlags: z.array(govFlagSchema).length(7),
  independenceChecks: z
    .array(
      z.object({
        userId: z.string(),
        isIndependent: z.boolean(),
        threats: z
          .array(
            z.object({
              threatType: z.string(),
              description: z.string(),
            })
          )
          .optional(),
        safeguards: z
          .array(
            z.object({
              safeguardType: z.string(),
              description: z.string(),
            })
          )
          .optional(),
        notes: z.string().optional(),
      })
    )
    .min(1),
});

function classifyRisk(govScore: number): 'NORMAL' | 'GTN' | 'MGTN' {
  if (govScore <= 9) return 'NORMAL';
  if (govScore <= 15) return 'GTN';
  return 'MGTN';
}

export default async function acceptanceRoutes(fastify: FastifyInstance) {
  // ─── GET /engagements/:engagementId/acceptance ────────────────────────
  fastify.get('/', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };

    const acceptance = await fastify.prisma.engagementAcceptance.findUnique({
      where: { engagementId },
      include: {
        independenceChecks: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    // preparedBy / reviewedBy / approvedBy / declinedBy are plain ID strings —
    // resolve them to display names for the UI.
    const userIds = [
      acceptance?.preparedBy,
      acceptance?.reviewedBy,
      acceptance?.approvedBy,
      acceptance?.declinedBy,
    ].filter((id): id is string => !!id);
    const users = userIds.length
      ? await fastify.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const userNames = Object.fromEntries(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`])
    );

    return reply.send({
      success: true,
      data: { acceptance: acceptance ?? null, userNames },
    });
  });

  // ─── POST /engagements/:engagementId/acceptance ────────────────────────
  // Creates or updates the acceptance record (idempotent until approved/declined)
  fastify.post('/submit', async (request, reply) => {
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

    if (engagement.status !== 'ACCEPTANCE') {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'WRONG_STATUS',
          message: `Acceptance form cannot be submitted when engagement is in ${engagement.status} status`,
        },
      });
    }

    const parsed = acceptanceSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid submission',
          details: parsed.error.flatten(),
        },
      });
    }

    const { govFlags, independenceChecks } = parsed.data;
    const govScore = govFlags.reduce((sum, f) => sum + f.score, 0);
    const riskClassification = classifyRisk(govScore);
    const eqrRequired = riskClassification !== 'NORMAL';
    const allIndependent = independenceChecks.every((c) => c.isIndependent);

    // Upsert acceptance record
    const acceptance = await fastify.prisma.engagementAcceptance.upsert({
      where: { engagementId },
      create: {
        engagementId,
        govScore,
        govFlags: govFlags as never,
        riskClassification,
        independenceCleared: allIndependent,
        independenceClearedAt: allIndependent ? new Date() : null,
        preparedBy: request.user!.sub,
        preparedAt: new Date(),
      },
      update: {
        govScore,
        govFlags: govFlags as never,
        riskClassification,
        independenceCleared: allIndependent,
        independenceClearedAt: allIndependent ? new Date() : null,
        preparedBy: request.user!.sub,
        preparedAt: new Date(),
        // Reset downstream approvals on re-submission
        reviewedBy: null,
        reviewedAt: null,
        approvedBy: null,
        approvedAt: null,
      },
    });

    // Upsert independence checks
    for (const check of independenceChecks) {
      await fastify.prisma.independenceCheck.upsert({
        where: {
          acceptanceId_userId: {
            acceptanceId: acceptance.id,
            userId: check.userId,
          },
        },
        create: {
          acceptanceId: acceptance.id,
          userId: check.userId,
          isIndependent: check.isIndependent,
          threats: (check.threats ?? []) as never,
          safeguards: (check.safeguards ?? []) as never,
          notes: check.notes ?? null,
        },
        update: {
          isIndependent: check.isIndependent,
          threats: (check.threats ?? []) as never,
          safeguards: (check.safeguards ?? []) as never,
          notes: check.notes ?? null,
          declaredAt: new Date(),
        },
      });
    }

    // Update engagement risk classification
    await fastify.prisma.engagement.update({
      where: { id: engagementId },
      data: { riskClassification, eqrRequired },
    });

    await writeAuditLog(fastify.prisma, {
      actorId: request.user!.sub,
      action: 'ACCEPTANCE_SUBMITTED',
      entityType: 'EngagementAcceptance',
      entityId: acceptance.id,
      afterState: { govScore, riskClassification, eqrRequired },
      ipAddress: request.ip,
    });

    return reply.code(201).send({
      success: true,
      data: {
        acceptance,
        govScore,
        riskClassification,
        eqrRequired,
        independenceCleared: allIndependent,
      },
    });
  });

  // ─── POST /engagements/:engagementId/acceptance/review ────────────────
  fastify.post('/review', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };
    const actor = request.user!;

    const acceptance = await fastify.prisma.engagementAcceptance.findUnique({
      where: { engagementId },
    });

    if (!acceptance?.preparedBy) {
      return reply.code(409).send({
        success: false,
        error: { code: 'NOT_SUBMITTED', message: 'Acceptance form not yet submitted' },
      });
    }

    if (acceptance.reviewedBy) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: 'Already reviewed' },
      });
    }

    // Reviewer cannot be the preparer
    if (acceptance.preparedBy === actor.sub) {
      return reply.code(403).send({
        success: false,
        error: { code: 'SELF_REVIEW', message: 'Preparer cannot review their own submission' },
      });
    }

    const updated = await fastify.prisma.engagementAcceptance.update({
      where: { engagementId },
      data: { reviewedBy: actor.sub, reviewedAt: new Date() },
    });

    return reply.send({ success: true, data: { acceptance: updated } });
  });

  // ─── POST /engagements/:engagementId/acceptance/approve ───────────────
  fastify.post('/approve', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };
    const actor = request.user!;

    // Only Managing Partner or Assurance Partner can approve
    if (!['MANAGING_PARTNER', 'ASSURANCE_PARTNER'].includes(actor.role)) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only a Managing Partner or Assurance Partner can approve acceptance',
        },
      });
    }

    const acceptance = await fastify.prisma.engagementAcceptance.findUnique({
      where: { engagementId },
    });

    if (!acceptance?.reviewedBy) {
      return reply.code(409).send({
        success: false,
        error: { code: 'NOT_REVIEWED', message: 'Acceptance must be reviewed before approval' },
      });
    }

    if (!acceptance.independenceCleared) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'INDEPENDENCE_NOT_CLEARED',
          message: 'All team members must declare independence before approval',
        },
      });
    }

    // KYC/AML gate (POCAMLA Cap. 59B) — engagement cannot advance to PLANNING
    // without a completed KYC evaluation cleared to proceed.
    const kyc = await fastify.prisma.kycAmlEvaluation.findUnique({
      where: { engagementId },
    });
    if (!kyc?.completedAt) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'KYC_NOT_COMPLETED',
          message: 'KYC/AML evaluation must be completed before acceptance approval',
        },
      });
    }
    if (kyc.riskDecision === 'DECLINE') {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'KYC_DECLINED',
          message: 'KYC/AML risk decision is DECLINE — engagement cannot be accepted',
        },
      });
    }
    if (kyc.epApprovalRequired && !kyc.epApprovedBy) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'KYC_EP_PENDING',
          message: 'KYC/AML evaluation requires Engagement Partner approval before acceptance',
        },
      });
    }

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const acc = await tx.engagementAcceptance.update({
        where: { engagementId },
        data: { approvedBy: actor.sub, approvedAt: new Date() },
      });

      // Advance engagement to PLANNING phase
      await tx.engagement.update({
        where: { id: engagementId },
        data: { status: 'PLANNING' },
      });

      return acc;
    });

    await writeAuditLog(fastify.prisma, {
      actorId: actor.sub,
      action: 'ACCEPTANCE_APPROVED',
      entityType: 'Engagement',
      entityId: engagementId,
      afterState: { status: 'PLANNING', riskClassification: acceptance.riskClassification },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { acceptance: updated } });
  });

  // ─── POST /engagements/:engagementId/acceptance/decline ───────────────
  fastify.post('/decline', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };
    const actor = request.user!;

    if (!['MANAGING_PARTNER', 'ASSURANCE_PARTNER'].includes(actor.role)) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only a Partner can decline an engagement' },
      });
    }

    const body = request.body as { declineReason?: string };
    if (!body.declineReason?.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'declineReason is required' },
      });
    }

    await fastify.prisma.$transaction(async (tx) => {
      await tx.engagementAcceptance.update({
        where: { engagementId },
        data: {
          declinedBy: actor.sub,
          declinedAt: new Date(),
          declineReason: body.declineReason,
        },
      });

      await tx.engagement.update({
        where: { id: engagementId },
        data: { status: 'DECLINED' },
      });
    });

    await writeAuditLog(fastify.prisma, {
      actorId: actor.sub,
      action: 'ACCEPTANCE_DECLINED',
      entityType: 'Engagement',
      entityId: engagementId,
      afterState: { status: 'DECLINED', reason: body.declineReason },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { message: 'Engagement declined' } });
  });
}
