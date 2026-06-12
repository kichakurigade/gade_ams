/**
 * INSERT-ONLY audit log writer.
 * Never call UPDATE or DELETE on the audit_log table.
 * This function is the only permitted write path.
 */
import type { PrismaClient } from '@prisma/client';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'TOTP_VERIFIED'
  | 'PASSWORD_CHANGED'
  | 'ENGAGEMENT_CREATED'
  | 'ENGAGEMENT_STATUS_CHANGED'
  | 'ACCEPTANCE_SUBMITTED'
  | 'ACCEPTANCE_APPROVED'
  | 'ACCEPTANCE_DECLINED'
  | 'KYC_COMPLETED'
  | 'MATERIALITY_SET'
  | 'RISK_ASSESSED'
  | 'STRATEGY_CONFIRMED'
  | 'PROGRAM_GENERATED'
  | 'PROGRAM_STEP_OVERRIDDEN'
  | 'TB_IMPORTED'
  | 'ACCOUNT_MAPPED'
  | 'AJE_PROPOSED'
  | 'AJE_AGREED'
  | 'AJE_WAIVED'
  | 'WP_UPLOADED'
  | 'WP_STATUS_CHANGED'
  | 'WP_DOWNLOADED'
  | 'COMMENT_ADDED'
  | 'GATE_CHECKED'
  | 'EQR_SIGNED'
  | 'REPORT_SIGNED'
  | 'NOTE_NARRATIVE_UPDATED'
  | 'NOTE_NARRATIVE_LOCKED';

export async function writeAuditLog(
  prisma: PrismaClient,
  params: {
    actorId?: string;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    beforeState?: unknown;
    afterState?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      actionType: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      beforeState: params.beforeState as never ?? undefined,
      afterState: params.afterState as never ?? undefined,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}
