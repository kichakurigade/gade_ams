/**
 * Module 7: Materiality (ISA 320)
 *
 * Versioned — every change creates a new MaterialityVersion; the prior version
 * is deactivated (isActive = false, supersededAt set), never edited or deleted.
 *
 * PM  = basisAmount × basisPercentage / 100
 * PeM = PM × pemPercentage / 100          (default 75%)
 * Trivial = PM × trivialPercentage / 100  (default 5%)
 *
 * Suggested basis percentage ranges (guidance, not enforced — the form shows
 * them; values outside the range require no override, only MANUAL_OVERRIDE
 * basis requires justification):
 *   PBT 5–10% | TOTAL_ASSETS 1–2% | REVENUE 0.5–1% | EXPENDITURE 1–3% | NET_ASSETS 2–5%
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/auditLog.js';

const MATERIALITY_BASES = [
  'PBT',
  'TOTAL_ASSETS',
  'REVENUE',
  'EXPENDITURE',
  'NET_ASSETS',
  'MANUAL_OVERRIDE',
] as const;

const createVersionSchema = z
  .object({
    basis: z.enum(MATERIALITY_BASES),
    basisAmount: z.number().positive(),
    basisPercentage: z.number().positive().max(100),
    pemPercentage: z.number().positive().max(100).default(75),
    trivialPercentage: z.number().positive().max(100).default(5),
    manualOverrideJustification: z.string().optional(),
    /// Prior-year PBT — when provided with PBT basis, flags > 50% YoY swing
    priorYearPbt: z.number().optional(),
    /// Required for every version after the first
    revisionReason: z.string().optional(),
  })
  .refine(
    (d) =>
      d.basis !== 'MANUAL_OVERRIDE' ||
      (d.manualOverrideJustification != null && d.manualOverrideJustification.trim().length >= 10),
    {
      message: 'Manual override requires a justification of at least 10 characters',
      path: ['manualOverrideJustification'],
    }
  );

export default async function materialityRoutes(fastify: FastifyInstance) {
  // ─── GET /engagements/:engagementId/materiality ─────────────────────────
  // Returns the active version plus full version history (newest first).
  fastify.get('/', async (request, reply) => {
    const { engagementId } = request.params as { engagementId: string };

    const versions = await fastify.prisma.materialityVersion.findMany({
      where: { engagementId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { versionNumber: 'desc' },
    });

    return reply.send({
      success: true,
      data: {
        active: versions.find((v) => v.isActive) ?? null,
        versions,
      },
    });
  });

  // ─── POST /engagements/:engagementId/materiality ────────────────────────
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

    // Materiality is set in PLANNING and may be revised during EXECUTION
    // (ISA 320.12–13); it is frozen from COMPLETION onward.
    if (!['PLANNING', 'EXECUTION'].includes(engagement.status)) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'WRONG_STATUS',
          message: `Materiality cannot be set when engagement is in ${engagement.status} status`,
        },
      });
    }

    const parsed = createVersionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid materiality data',
          details: parsed.error.flatten(),
        },
      });
    }

    const {
      basis,
      basisAmount,
      basisPercentage,
      pemPercentage,
      trivialPercentage,
      manualOverrideJustification,
      priorYearPbt,
      revisionReason,
    } = parsed.data;

    const latest = await fastify.prisma.materialityVersion.findFirst({
      where: { engagementId },
      orderBy: { versionNumber: 'desc' },
    });

    if (latest && !revisionReason?.trim()) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'REVISION_REASON_REQUIRED',
          message: 'A revision reason is required when superseding an existing materiality version',
        },
      });
    }

    // Server-side computation — never trust client-side figures
    const pm = (basisAmount * basisPercentage) / 100;
    const pem = (pm * pemPercentage) / 100;
    const trivialAmount = (pm * trivialPercentage) / 100;

    // ISA 320 PBT volatility check: > 50% YoY swing suggests PBT is unstable
    const pbtVolatilityFlag =
      basis === 'PBT' &&
      priorYearPbt != null &&
      priorYearPbt !== 0 &&
      Math.abs((basisAmount - priorYearPbt) / priorYearPbt) > 0.5;

    const version = await fastify.prisma.$transaction(async (tx) => {
      if (latest) {
        await tx.materialityVersion.updateMany({
          where: { engagementId, isActive: true },
          data: { isActive: false, supersededAt: new Date() },
        });
      }

      return tx.materialityVersion.create({
        data: {
          engagementId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          isActive: true,
          basis,
          basisAmount,
          basisPercentage,
          pm,
          pemPercentage,
          pem,
          trivialPercentage,
          trivialAmount,
          manualOverrideJustification: manualOverrideJustification ?? null,
          pbtVolatilityFlag,
          setBy: request.user!.sub,
          revisionReason: latest ? revisionReason!.trim() : null,
        },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      });
    });

    await writeAuditLog(fastify.prisma, {
      actorId: request.user!.sub,
      action: 'MATERIALITY_SET',
      entityType: 'MaterialityVersion',
      entityId: version.id,
      afterState: {
        versionNumber: version.versionNumber,
        basis,
        pm,
        pem,
        trivialAmount,
        pbtVolatilityFlag,
      },
      ipAddress: request.ip,
    });

    return reply.code(201).send({ success: true, data: { version } });
  });
}
