'use client';

/**
 * Module 5: Engagement Acceptance & Continuance (P003)
 *
 * Governance scoring: 7 factors × 0-3 = max 21
 *   Normal ≤ 9  |  GTN 10–15  |  MGTN 16–21
 *
 * Form sections:
 *   1. Governance scoring (7 factors with score slider + notes)
 *   2. Risk classification (computed, shown to user)
 *   3. Independence checks (per team member)
 *   4. Submit / Review / Approve / Decline actions
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { engagementApi, type GovFlag, type IndependenceCheckInput, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/hooks/useAuth';
import { cn, riskClassificationLabel } from '@/lib/utils';

// ─── Governance factors (7, matching backend GOV_FACTOR_CODES) ──────────────
const GOV_FACTORS: { code: string; name: string; guidance: string }[] = [
  {
    code: 'MGMT_INTEGRITY',
    name: 'Management Integrity',
    guidance: '0 = No concerns | 1 = Minor | 2 = Significant concerns | 3 = Serious doubts',
  },
  {
    code: 'CORPORATE_GOVERNANCE',
    name: 'Corporate Governance',
    guidance: '0 = Strong governance | 1 = Adequate | 2 = Weak | 3 = Non-existent',
  },
  {
    code: 'FINANCIAL_STABILITY',
    name: 'Financial Stability',
    guidance: '0 = Financially sound | 1 = Some concerns | 2 = Distressed | 3 = Going concern doubt',
  },
  {
    code: 'INDUSTRY_RISK',
    name: 'Industry Risk',
    guidance: '0 = Low-risk industry | 1 = Moderate | 2 = High-risk industry | 3 = Very high risk',
  },
  {
    code: 'REGULATORY_ENVIRONMENT',
    name: 'Regulatory Environment',
    guidance: '0 = Good standing | 1 = Minor issues | 2 = Regulatory scrutiny | 3 = Under investigation',
  },
  {
    code: 'RELATED_PARTY_COMPLEXITY',
    name: 'Related Party Complexity',
    guidance: '0 = Simple structure | 1 = Some related parties | 2 = Complex | 3 = Very complex/opaque',
  },
  {
    code: 'AUDIT_HISTORY',
    name: 'Audit History',
    guidance: '0 = Clean history | 1 = Minor issues | 2 = Qualified opinions | 3 = Serious prior issues',
  },
];

// ─── Zod schema ──────────────────────────────────────────────────────────────
const govFlagSchema = z.object({
  factorCode: z.string(),
  factorName: z.string(),
  score: z.number().int().min(0).max(3),
  notes: z.string().optional(),
});

const independenceCheckSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  isIndependent: z.boolean(),
  notes: z.string().optional(),
});

const formSchema = z.object({
  govFlags: z.array(govFlagSchema).length(7),
  independenceChecks: z.array(independenceCheckSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Risk classification helper ───────────────────────────────────────────────
function classifyRisk(score: number): 'NORMAL' | 'GTN' | 'MGTN' {
  if (score <= 9) return 'NORMAL';
  if (score <= 15) return 'GTN';
  return 'MGTN';
}

const RISK_COLOURS = {
  NORMAL: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle2 },
  GTN: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle },
  MGTN: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertTriangle },
};

// ─── Score selector ───────────────────────────────────────────────────────────
function ScoreSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'w-9 h-9 rounded-lg text-sm font-semibold border transition-colors',
            value === v
              ? 'bg-brand border-brand text-white'
              : 'bg-white border-surface-border text-muted-foreground hover:border-brand/40'
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AcceptanceFormClient({ engagementId }: { engagementId: string }) {
  const queryClient = useQueryClient();
  const { data: authData } = useCurrentUser();
  const isPartner = ['MANAGING_PARTNER', 'ASSURANCE_PARTNER'].includes(
    authData?.user?.role ?? ''
  );

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load engagement + existing acceptance
  const { data: engData } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: () => engagementApi.get(engagementId),
  });

  const { data: accData, isLoading: accLoading } = useQuery({
    queryKey: ['acceptance', engagementId],
    queryFn: () => engagementApi.getAcceptance(engagementId),
  });

  const engagement = engData?.engagement;
  const acceptance = accData?.acceptance;
  const userNames = accData?.userNames ?? {};
  const isLocked = !!acceptance?.approvedAt || !!acceptance?.declinedAt;

  // ─── Form setup ──────────────────────────────────────────────────────────
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      govFlags: GOV_FACTORS.map((f) => ({
        factorCode: f.code,
        factorName: f.name,
        score: 0,
        notes: '',
      })),
      independenceChecks: engagement?.team?.map((tm) => ({
        userId: tm.user.id,
        userName: `${tm.user.firstName} ${tm.user.lastName}`,
        isIndependent: true,
        notes: '',
      })) ?? [],
    },
  });

  const { fields: govFields } = useFieldArray({ control: form.control, name: 'govFlags' });
  const { fields: indFields } = useFieldArray({
    control: form.control,
    name: 'independenceChecks',
  });

  // Pre-populate from existing acceptance
  useEffect(() => {
    if (acceptance?.govFlags) {
      const flags = acceptance.govFlags as GovFlag[];
      form.setValue(
        'govFlags',
        GOV_FACTORS.map((f) => {
          const existing = flags.find((fl) => fl.factorCode === f.code);
          return {
            factorCode: f.code,
            factorName: f.name,
            score: existing?.score ?? 0,
            notes: existing?.notes ?? '',
          };
        })
      );
    }
  }, [acceptance, form]);

  // Populate independence checks when team loads
  useEffect(() => {
    if (engagement?.team?.length) {
      form.setValue(
        'independenceChecks',
        engagement.team.map((tm) => ({
          userId: tm.user.id,
          userName: `${tm.user.firstName} ${tm.user.lastName}`,
          isIndependent: true,
          notes: '',
        }))
      );
    }
  }, [engagement, form]);

  const govFlags = form.watch('govFlags');
  const totalScore = govFlags.reduce((sum, f) => sum + (f.score ?? 0), 0);
  const riskClass = classifyRisk(totalScore);
  const riskStyle = RISK_COLOURS[riskClass];
  const RiskIcon = riskStyle.icon;

  // ─── Submit mutation ──────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        govFlags: values.govFlags as GovFlag[],
        independenceChecks: values.independenceChecks.map((ic) => ({
          userId: ic.userId,
          isIndependent: ic.isIndependent,
          notes: ic.notes,
        })) as IndependenceCheckInput[],
      };
      return engagementApi.submitAcceptance(engagementId, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['acceptance', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['engagement', engagementId] });
      setSuccessMessage(
        `Acceptance submitted. Risk classification: ${riskClassificationLabel(data.riskClassification)}. ${data.eqrRequired ? 'EQR required.' : ''}`
      );
      setServerError(null);
    },
    onError: (e) => {
      setServerError(e instanceof ApiError ? e.message : 'Submission failed');
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => engagementApi.approveAcceptance(engagementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acceptance', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      setSuccessMessage('Engagement accepted. Status advanced to Planning.');
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'Approval failed'),
  });

  const declineMutation = useMutation({
    mutationFn: (reason: string) => engagementApi.declineAcceptance(engagementId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acceptance', engagementId] });
      setSuccessMessage('Engagement declined.');
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'Decline failed'),
  });

  if (accLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="ams-page-title">Engagement Acceptance &amp; Continuance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {engagement?.engagementCode} — {engagement?.client?.clientName}
        </p>
      </div>

      {/* Approval status banner */}
      {acceptance?.approvedAt && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800 font-medium">
            Accepted — engagement advanced to Planning phase
          </p>
        </div>
      )}
      {acceptance?.declinedAt && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium">
            Declined: {acceptance.declineReason}
          </p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-muted px-4 py-3">
          <Info className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand font-medium">{successMessage}</p>
        </div>
      )}

      {serverError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <form
        onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))}
        className="space-y-6"
      >
        {/* ── Section 1: Governance scoring ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Governance &amp; Risk Scoring</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Score each factor 0–3. Total ≤ 9 = Normal | 10–15 = GTN | 16–21 = MGTN.
            </p>
          </div>

          <div className="divide-y divide-surface-border">
            {govFields.map((field, index) => {
              const factor = GOV_FACTORS[index];
              if (!factor) return null;
              return (
                <div key={field.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{factor.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{factor.guidance}</p>
                    </div>
                    <ScoreSelector
                      value={form.watch(`govFlags.${index}.score`) ?? 0}
                      onChange={(v) => form.setValue(`govFlags.${index}.score`, v)}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    className="w-full px-3 py-1.5 rounded-lg border border-surface-border text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand"
                    disabled={isLocked}
                    {...form.register(`govFlags.${index}.notes`)}
                  />
                </div>
              );
            })}
          </div>

          {/* Total score + classification */}
          <div
            className={cn(
              'px-5 py-4 border-t flex items-center justify-between',
              riskStyle.bg,
              riskStyle.border,
              'border-t'
            )}
          >
            <div className="flex items-center gap-2">
              <RiskIcon className={cn('w-5 h-5', riskStyle.text)} />
              <div>
                <p className={cn('text-sm font-semibold', riskStyle.text)}>
                  {riskClassificationLabel(riskClass)}
                </p>
                <p className={cn('text-xs', riskStyle.text, 'opacity-80')}>
                  {riskClass === 'MGTN' && 'EQR mandatory'}
                  {riskClass === 'GTN' && 'EQR mandatory'}
                  {riskClass === 'NORMAL' && 'EQR not required'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn('text-2xl font-bold', riskStyle.text)}>{totalScore}</p>
              <p className={cn('text-xs', riskStyle.text, 'opacity-80')}>/ 21</p>
            </div>
          </div>
        </div>

        {/* ── Section 2: Independence checks ───────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Independence Declarations</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Each assigned team member must declare independence per ICPAK Code of Ethics.
            </p>
          </div>

          {indFields.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              No team members assigned yet. Assign the engagement team first.
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {indFields.map((field, index) => {
                const check = form.watch(`independenceChecks.${index}`);
                return (
                  <div key={field.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-foreground">{check.userName}</p>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            value="true"
                            checked={form.watch(`independenceChecks.${index}.isIndependent`) === true}
                            onChange={() =>
                              form.setValue(`independenceChecks.${index}.isIndependent`, true)
                            }
                            disabled={isLocked}
                            className="accent-brand"
                          />
                          <span className="text-green-700">Independent</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            value="false"
                            checked={form.watch(`independenceChecks.${index}.isIndependent`) === false}
                            onChange={() =>
                              form.setValue(`independenceChecks.${index}.isIndependent`, false)
                            }
                            disabled={isLocked}
                            className="accent-destructive"
                          />
                          <span className="text-red-700">Not independent</span>
                        </label>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Threats / safeguards (optional)"
                      className="w-full px-3 py-1.5 rounded-lg border border-surface-border text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand"
                      disabled={isLocked}
                      {...form.register(`independenceChecks.${index}.notes`)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Section 3: Approval workflow status ──────────────────────── */}
        {acceptance && (
          <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
              <h2 className="ams-section-title">Approval Workflow</h2>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <WorkflowStep
                label="Prepared"
                user={acceptance.preparedBy}
                userName={userNames[acceptance.preparedBy ?? '']}
                date={acceptance.preparedAt}
              />
              <WorkflowStep
                label="Reviewed"
                user={acceptance.reviewedBy}
                userName={userNames[acceptance.reviewedBy ?? '']}
                date={acceptance.reviewedAt}
              />
              <WorkflowStep
                label="Approved"
                user={acceptance.approvedBy}
                userName={userNames[acceptance.approvedBy ?? '']}
                date={acceptance.approvedAt}
              />
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        {!isLocked && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {/* Approve — partners only, after review */}
              {isPartner && acceptance?.reviewedBy && !acceptance.approvedAt && (
                <>
                  <button
                    type="button"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {approveMutation.isPending ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt('Decline reason:');
                      if (reason?.trim()) declineMutation.mutate(reason.trim());
                    }}
                    disabled={declineMutation.isPending}
                    className="px-4 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={submitMutation.isPending || isLocked}
              className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitMutation.isPending ? 'Saving…' : acceptance ? 'Update & Submit' : 'Submit for review'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function WorkflowStep({
  label,
  user,
  userName,
  date,
}: {
  label: string;
  user?: string | null;
  userName?: string;
  date?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
          user ? 'bg-green-100' : 'bg-gray-100'
        )}
      >
        {user ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        )}
      </div>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        {user && userName ? ` by ${userName}` : ''}
        {date ? ` — ${new Date(date).toLocaleDateString('en-KE')}` : ' — Pending'}
      </p>
    </div>
  );
}
