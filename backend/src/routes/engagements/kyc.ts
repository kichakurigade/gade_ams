/**
 * Module 6: KYC/AML Evaluation (POCAMLA Cap. 59B + KDPA 2019)
 *
 * AML risk score: 7 factors × 1–3 = total 7–21
 *   Low 7–10  |  Medium 11–15  |  High 16–21
 *
 * Risk decision:
 *   Low    → PROCEED
 *   Medium → ENHANCED_MONITORING (EP approval required)
 *   High   → DECLINE or EP override
 *
 * KDPA 2019: data-protection notice must be confirmed before completion.
 * Sanctions: UN + OFAC checks recorded (manual confirmation; no live API yet).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/auditLog.js';

// ─── AML factor codes (POCAMLA Cap. 59B risk categories) ──────────────────
const AML_FACTOR_CODES = [
  'COUNTRY_RISK',
  'ENTITY_TYPE_RISK',
  'PRODUCT_SERVICE_RISK',
  'DELIVERY_CHANNEL_RISK',
  'TRANSACTION_PATTERN_RISK',
  'UBO_RISK',
  'SOURCE_OF_FUNDS_RISK',
] as const;

type AmlFactorCode = (typeof AML_FACTOR_CODES)[number];

const amlFactorSchema = z.object({
  factorCode: z.enum(AML_FACTOR_CODES),
  factorName: z.string(),
  score: z.number().int().min(1).max(3),
  notes: z.string().optional(),
});

const kycSubmitSchema = z
  .object({
    // UBO / PEP
    uboName: z.string().min(1),
    uboPinOrId: z.string().optional(),
    isPep: z.boolean(),
    pepDetails: z.string().optional(),

    // Sanctions
    unSanctionsCheck: z.boolean(),
    ofacSanctionsCheck: z.boolean(),
    sanctionsCleared: z.boolean(),

    // AML scoring
    amlFactors: z.array(amlFactorSchema).length(7),

    // KDPA 2019
    dataProtectionNoticeGiven: z.boolean(),
    dataProtectionNoticeDate: z.string().optional(),
  })
  .refine((d) => !d.sanctionsCleared || (d.unSanctionsCheck && d.ofacSanctionsCheck), {
    message: 'Sanctions cannot be marked cleared until both UN and OFAC lists have been checked',
    path: ['sanctionsCleared'],
  })
  .refine((d) => !d.isPep || (d.pepDetails != null && d.pepDetails.trim().length > 0), {
    message: 'PEP details are required when the UBO is a politically exposed person',
    path: ['pepDetails'],
  })
  .refine(
    (d) => new Set(d.amlFactors.map((f) => f.factorCode)).size === d.amlFactors.length,
    { message: 'Each AML factor may appear only once', path: ['amlFactors'] }
  );

const epApproveSchema = z.object({
  overrideNotes: z.string().min(10),
  riskDecision: z.enum(['PROCEED', 'ENHANCED_MONITORING', 'DECLINE']),
});

function classifyAmlRisk(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score <= 10) return 'LOW';
  if (score <= 15) return 'MEDIUM';
  return 'HIGH';
}

function deriveDecision(level: 'LOW' | 'MEDIUM' | 'HIGH'): string {
  if (level === 'LOW') return 'PROCEED';
  if (level === 'MEDIUM') return 'ENHANCED_MONITORING';
  return 'DECLINE';
}

export default async function kycRoutes(fastify: FastifyInstance) {
  // ─── GET /engagements/:engagementId/kyc ─────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };

    const evaluation = await fastify.prisma.kycAmlEvaluation.findUnique({
      where: { engagementId },
    });

    // completedBy / epApprovedBy are plain ID strings (no FK relation) —
    // resolve them to display names for the UI.
    const userIds = [evaluation?.completedBy, evaluation?.epApprovedBy].filter(
      (id): id is string => !!id
    );
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
      data: { evaluation: evaluation ?? null, userNames },
    });
  });

  // ─── POST /engagements/:engagementId/kyc/submit ──────────────────────────
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

    // KYC can be completed during ACCEPTANCE or PLANNING phase
    if (!['ACCEPTANCE', 'PLANNING'].includes(engagement.status)) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'WRONG_STATUS',
          message: `KYC/AML cannot be submitted when engagement is in ${engagement.status} status`,
        },
      });
    }

    const parsed = kycSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid KYC submission',
          details: parsed.error.flatten(),
        },
      });
    }

    const {
      uboName,
      uboPinOrId,
      isPep,
      pepDetails,
      unSanctionsCheck,
      ofacSanctionsCheck,
      sanctionsCleared,
      amlFactors,
      dataProtectionNoticeGiven,
      dataProtectionNoticeDate,
    } = parsed.data;

    const amlScore = amlFactors.reduce((sum, f) => sum + f.score, 0);
    const riskLevel = classifyAmlRisk(amlScore);
    const riskDecision = deriveDecision(riskLevel);
    const epApprovalRequired = riskDecision !== 'PROCEED';

    const evaluation = await fastify.prisma.kycAmlEvaluation.upsert({
      where: { engagementId },
      create: {
        engagementId,
        clientId: engagement.clientId,
        uboName,
        uboPinOrId: uboPinOrId ?? null,
        isPep,
        pepDetails: pepDetails ?? null,
        unSanctionsCheck,
        ofacSanctionsCheck,
        sanctionsCleared,
        sanctionsClearedAt: sanctionsCleared ? new Date() : null,
        amlScore,
        amlFactors: amlFactors as never,
        riskDecision,
        epApprovalRequired,
        dataProtectionNoticeGiven,
        dataProtectionNoticeDate: dataProtectionNoticeDate
          ? new Date(dataProtectionNoticeDate)
          : null,
        completedBy: request.user!.sub,
        completedAt: new Date(),
      },
      update: {
        uboName,
        uboPinOrId: uboPinOrId ?? null,
        isPep,
        pepDetails: pepDetails ?? null,
        unSanctionsCheck,
        ofacSanctionsCheck,
        sanctionsCleared,
        sanctionsClearedAt: sanctionsCleared ? new Date() : null,
        amlScore,
        amlFactors: amlFactors as never,
        riskDecision,
        epApprovalRequired,
        // Reset EP approval on re-submission
        epApprovedBy: null,
        epApprovedAt: null,
        dataProtectionNoticeGiven,
        dataProtectionNoticeDate: dataProtectionNoticeDate
          ? new Date(dataProtectionNoticeDate)
          : null,
        completedBy: request.user!.sub,
        completedAt: new Date(),
      },
    });

    await writeAuditLog(fastify.prisma, {
      actorId: request.user!.sub,
      action: 'KYC_SUBMITTED',
      entityType: 'KycAmlEvaluation',
      entityId: evaluation.id,
      afterState: { amlScore, riskLevel, riskDecision, epApprovalRequired },
      ipAddress: request.ip,
    });

    return reply.code(201).send({
      success: true,
      data: {
        evaluation,
        amlScore,
        riskLevel,
        riskDecision,
        epApprovalRequired,
      },
    });
  });

  // ─── POST /engagements/:engagementId/kyc/ep-approve ──────────────────────
  // Engagement Partner override — required when riskDecision ≠ PROCEED
  fastify.post('/ep-approve', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };
    const actor = request.user!;

    if (!['MANAGING_PARTNER', 'ASSURANCE_PARTNER'].includes(actor.role)) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only a Managing Partner or Assurance Partner can approve high-risk KYC',
        },
      });
    }

    const evaluation = await fastify.prisma.kycAmlEvaluation.findUnique({
      where: { engagementId },
    });

    if (!evaluation) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'KYC evaluation not yet submitted' },
      });
    }

    if (!evaluation.epApprovalRequired) {
      return reply.code(409).send({
        success: false,
        error: { code: 'NOT_REQUIRED', message: 'EP approval is not required for this engagement' },
      });
    }

    if (evaluation.epApprovedBy) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_APPROVED', message: 'EP approval already recorded' },
      });
    }

    const parsed = epApproveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'overrideNotes (min 10 chars) and riskDecision are required',
          details: parsed.error.flatten(),
        },
      });
    }

    const isDecline = parsed.data.riskDecision === 'DECLINE';
    const now = new Date();

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const evalUpdated = await tx.kycAmlEvaluation.update({
        where: { engagementId },
        data: {
          epApprovedBy: actor.sub,
          epApprovedAt: now,
          riskDecision: parsed.data.riskDecision,
        },
      });

      // KYC decline routes through the acceptance decline — the one place
      // engagements die. Records the decline on the acceptance record (creating
      // a stub if acceptance was never submitted) and sets engagement DECLINED.
      if (isDecline) {
        const declineReason = `KYC/AML: ${parsed.data.overrideNotes}`;
        await tx.engagementAcceptance.upsert({
          where: { engagementId },
          create: { engagementId, declinedBy: actor.sub, declinedAt: now, declineReason },
          update: { declinedBy: actor.sub, declinedAt: now, declineReason },
        });
        await tx.engagement.update({
          where: { id: engagementId },
          data: { status: 'DECLINED' },
        });
      }

      return evalUpdated;
    });

    await writeAuditLog(fastify.prisma, {
      actorId: actor.sub,
      action: 'KYC_EP_APPROVED',
      entityType: 'KycAmlEvaluation',
      entityId: evaluation.id,
      afterState: {
        riskDecision: parsed.data.riskDecision,
        overrideNotes: parsed.data.overrideNotes,
      },
      ipAddress: request.ip,
    });

    if (isDecline) {
      await writeAuditLog(fastify.prisma, {
        actorId: actor.sub,
        action: 'ACCEPTANCE_DECLINED',
        entityType: 'Engagement',
        entityId: engagementId,
        afterState: { status: 'DECLINED', reason: `KYC/AML: ${parsed.data.overrideNotes}` },
        ipAddress: request.ip,
      });
    }

    return reply.send({
      success: true,
      data: { evaluation: updated, engagementDeclined: isDecline },
    });
  });
}
