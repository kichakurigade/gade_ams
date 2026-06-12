'use client';

/**
 * Module 6: KYC/AML Evaluation (POCAMLA Cap. 59B + KDPA 2019)
 *
 * AML risk score: 7 factors × 1–3 = total 7–21
 *   Low 7–10  |  Medium 11–15  |  High 16–21
 *
 * Sections:
 *   1. UBO identification + PEP screening
 *   2. Sanctions checks (UN + OFAC)
 *   3. AML factor scoring (7 factors)
 *   4. Risk decision + EP approval (if required)
 *   5. KDPA 2019 data-protection notice
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import { engagementApi, type AmlFactor, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// ─── AML factors (POCAMLA Cap. 59B risk categories) ──────────────────────────
const AML_FACTORS: { code: string; name: string; guidance: string }[] = [
  {
    code: 'COUNTRY_RISK',
    name: 'Country / Geographic Risk',
    guidance: '1 = Low-risk jurisdiction | 2 = Medium risk | 3 = FATF grey/black list or high-risk country',
  },
  {
    code: 'ENTITY_TYPE_RISK',
    name: 'Entity Type Risk',
    guidance: '1 = Regulated entity (bank, listed co.) | 2 = SME/NGO | 3 = Cash-intensive business, shell company, trust',
  },
  {
    code: 'PRODUCT_SERVICE_RISK',
    name: 'Product / Service Risk',
    guidance: '1 = Simple audit/compliance | 2 = Advisory with fund flows | 3 = Complex cross-border or structured transactions',
  },
  {
    code: 'DELIVERY_CHANNEL_RISK',
    name: 'Delivery Channel Risk',
    guidance: '1 = Face-to-face, documented | 2 = Hybrid remote/in-person | 3 = Fully remote, unverified identity',
  },
  {
    code: 'TRANSACTION_PATTERN_RISK',
    name: 'Transaction Pattern Risk',
    guidance: '1 = Normal, explainable | 2 = Some unusual patterns | 3 = Large/frequent/complex/unusual transactions',
  },
  {
    code: 'UBO_RISK',
    name: 'UBO / Beneficial Ownership Risk',
    guidance: '1 = UBO clear and verified | 2 = Some complexity | 3 = UBO unclear, layered ownership, PEP involved',
  },
  {
    code: 'SOURCE_OF_FUNDS_RISK',
    name: 'Source of Funds / Wealth Risk',
    guidance: '1 = Clearly documented | 2 = Partially documented | 3 = Unexplained or inconsistent with business',
  },
];

// ─── Zod schema ───────────────────────────────────────────────────────────────
const amlFactorSchema = z.object({
  factorCode: z.string(),
  factorName: z.string(),
  score: z.number().int().min(1).max(3),
  notes: z.string().optional(),
});

const formSchema = z
  .object({
    uboName: z.string().min(1, 'UBO name is required'),
    uboPinOrId: z.string().optional(),
    isPep: z.boolean(),
    pepDetails: z.string().optional(),
    unSanctionsCheck: z.boolean(),
    ofacSanctionsCheck: z.boolean(),
    sanctionsCleared: z.boolean(),
    amlFactors: z.array(amlFactorSchema).length(7),
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
  });

type FormValues = z.infer<typeof formSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function classifyAml(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score <= 10) return 'LOW';
  if (score <= 15) return 'MEDIUM';
  return 'HIGH';
}

const LEVEL_STYLE = {
  LOW: {
    bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700',
    label: 'Low Risk — Proceed', Icon: ShieldCheck,
  },
  MEDIUM: {
    bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700',
    label: 'Medium Risk — Enhanced Monitoring required', Icon: AlertTriangle,
  },
  HIGH: {
    bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700',
    label: 'High Risk — EP approval required; consider declining', Icon: ShieldAlert,
  },
};

function ScoreSelector({ value, onChange, disabled }: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => !disabled && onChange(v)}
          disabled={disabled}
          className={cn(
            'w-9 h-9 rounded-lg text-sm font-semibold border transition-colors',
            value === v
              ? v === 1
                ? 'bg-green-600 border-green-600 text-white'
                : v === 2
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-red-600 border-red-600 text-white'
              : 'bg-white border-surface-border text-muted-foreground hover:border-brand/40 disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors focus:outline-none',
          checked ? 'bg-brand' : 'bg-gray-300',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function KycAmlFormClient({ engagementId }: { engagementId: string }) {
  const queryClient = useQueryClient();
  const { data: authData } = useCurrentUser();
  const isPartner = ['MANAGING_PARTNER', 'ASSURANCE_PARTNER'].includes(
    authData?.user?.role ?? ''
  );

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [epNotes, setEpNotes] = useState('');
  const [epDecision, setEpDecision] = useState<'PROCEED' | 'ENHANCED_MONITORING' | 'DECLINE'>('ENHANCED_MONITORING');

  const { data: engData } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: () => engagementApi.get(engagementId),
  });

  const { data: kycData, isLoading } = useQuery({
    queryKey: ['kyc', engagementId],
    queryFn: () => engagementApi.getKyc(engagementId),
  });

  const engagement = engData?.engagement;
  const evaluation = kycData?.evaluation;
  const userNames = kycData?.userNames ?? {};
  // Locked once the EP has recorded a final decision — resubmission would
  // silently void the override (backend resets epApprovedBy/At on update).
  const isLocked = !!evaluation?.epApprovedAt;
  const isCompleted = !!evaluation?.completedAt;
  const needsEpApproval = evaluation?.epApprovalRequired && !evaluation?.epApprovedAt;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      uboName: '',
      uboPinOrId: '',
      isPep: false,
      pepDetails: '',
      unSanctionsCheck: false,
      ofacSanctionsCheck: false,
      sanctionsCleared: false,
      amlFactors: AML_FACTORS.map((f) => ({
        factorCode: f.code,
        factorName: f.name,
        score: 1,
        notes: '',
      })),
      dataProtectionNoticeGiven: false,
      dataProtectionNoticeDate: '',
    },
  });

  const { fields: factorFields } = useFieldArray({ control: form.control, name: 'amlFactors' });

  // Pre-populate from existing evaluation
  useEffect(() => {
    if (!evaluation) return;
    form.reset({
      uboName: evaluation.uboName ?? '',
      uboPinOrId: evaluation.uboPinOrId ?? '',
      isPep: evaluation.isPep ?? false,
      pepDetails: evaluation.pepDetails ?? '',
      unSanctionsCheck: evaluation.unSanctionsCheck ?? false,
      ofacSanctionsCheck: evaluation.ofacSanctionsCheck ?? false,
      sanctionsCleared: evaluation.sanctionsCleared ?? false,
      amlFactors: evaluation.amlFactors
        ? AML_FACTORS.map((f) => {
            const existing = (evaluation.amlFactors as AmlFactor[]).find(
              (af) => af.factorCode === f.code
            );
            return {
              factorCode: f.code,
              factorName: f.name,
              score: existing?.score ?? 1,
              notes: existing?.notes ?? '',
            };
          })
        : AML_FACTORS.map((f) => ({ factorCode: f.code, factorName: f.name, score: 1, notes: '' })),
      dataProtectionNoticeGiven: evaluation.dataProtectionNoticeGiven ?? false,
      dataProtectionNoticeDate: evaluation.dataProtectionNoticeDate
        ? new Date(evaluation.dataProtectionNoticeDate).toISOString().split('T')[0]
        : '',
    });
  }, [evaluation, form]);

  const amlFactors = form.watch('amlFactors');
  const totalScore = amlFactors.reduce((sum, f) => sum + (f.score ?? 1), 0);
  const riskLevel = classifyAml(totalScore);
  const levelStyle = LEVEL_STYLE[riskLevel];
  const { Icon } = levelStyle;

  const submitMutation = useMutation({
    mutationFn: (values: FormValues) => engagementApi.submitKyc(engagementId, values),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kyc', engagementId] });
      setSuccessMessage(
        `KYC/AML evaluation saved. Risk level: ${data.riskLevel}. Decision: ${data.riskDecision}.` +
        (data.epApprovalRequired ? ' EP approval required.' : '')
      );
      setServerError(null);
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'Submission failed'),
  });

  const epApproveMutation = useMutation({
    mutationFn: () =>
      engagementApi.epApproveKyc(engagementId, { overrideNotes: epNotes, riskDecision: epDecision }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kyc', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['engagement', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      setSuccessMessage(
        data.engagementDeclined
          ? 'EP decision recorded — engagement declined.'
          : 'EP approval recorded.'
      );
      setServerError(null);
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'EP approval failed'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="ams-page-title">KYC / AML Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {engagement?.engagementCode} — {engagement?.client?.clientName} ·{' '}
          <span className="italic">POCAMLA Cap. 59B + KDPA 2019</span>
        </p>
      </div>

      {/* Status banners */}
      {evaluation?.epApprovedAt &&
        (evaluation.riskDecision === 'DECLINE' ? (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800 font-medium">
              EP decision: DECLINE — engagement has been declined.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              EP approval recorded — decision: {evaluation.riskDecision}
            </p>
          </div>
        ))}

      {needsEpApproval && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            EP approval required before this engagement can proceed.
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

      <form onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))} className="space-y-6">
        {/* ── Section 1: UBO & PEP ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Ultimate Beneficial Owner (UBO) & PEP Screening</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Identify the natural person(s) who ultimately own or control the client entity.
            </p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  UBO Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Kamau Mwangi"
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
                  disabled={isLocked}
                  {...form.register('uboName')}
                />
                {form.formState.errors.uboName && (
                  <p className="text-xs text-destructive">{form.formState.errors.uboName.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  KRA PIN / National ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. A000000000Z or 12345678"
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
                  disabled={isLocked}
                  {...form.register('uboPinOrId')}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-surface-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Politically Exposed Person (PEP)?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Includes current or former senior public officials and their close associates.
                </p>
              </div>
              <Toggle
                checked={form.watch('isPep')}
                onChange={(v) => form.setValue('isPep', v)}
                disabled={isLocked}
              />
            </div>

            {form.watch('isPep') && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  PEP Details <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the PEP connection and position held"
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand disabled:opacity-50 resize-none"
                  disabled={isLocked}
                  {...form.register('pepDetails')}
                />
                {form.formState.errors.pepDetails && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.pepDetails.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Section 2: Sanctions checks ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Sanctions Screening</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Confirm manual checks against UN Consolidated List and OFAC SDN List.
            </p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              {
                field: 'unSanctionsCheck' as const,
                label: 'UN Consolidated Sanctions List checked',
                hint: 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list',
              },
              {
                field: 'ofacSanctionsCheck' as const,
                label: 'OFAC SDN List checked',
                hint: 'https://sanctionssearch.ofac.treas.gov/',
              },
              {
                field: 'sanctionsCleared' as const,
                label: 'Client cleared — no matches found on any list',
                hint: 'Confirm only if both lists have been checked and no matches identified.',
              },
            ].map(({ field, label, hint }) => (
              <div
                key={field}
                className="flex items-start justify-between gap-4 rounded-lg border border-surface-border px-4 py-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
                </div>
                <Toggle
                  checked={form.watch(field)}
                  onChange={(v) => form.setValue(field, v)}
                  disabled={isLocked}
                />
              </div>
            ))}
            {form.formState.errors.sanctionsCleared && (
              <p className="text-xs text-destructive">
                {form.formState.errors.sanctionsCleared.message}
              </p>
            )}
          </div>
        </div>

        {/* ── Section 3: AML factor scoring ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">AML Risk Factor Scoring</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Score each factor 1–3 per POCAMLA Cap. 59B. Total 7–10 = Low | 11–15 = Medium | 16–21 = High.
            </p>
          </div>

          <div className="divide-y divide-surface-border">
            {factorFields.map((field, index) => {
              const factor = AML_FACTORS[index];
              if (!factor) return null;
              return (
                <div key={field.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{factor.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{factor.guidance}</p>
                    </div>
                    <ScoreSelector
                      value={form.watch(`amlFactors.${index}.score`) ?? 1}
                      onChange={(v) => form.setValue(`amlFactors.${index}.score`, v)}
                      disabled={isLocked}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    className="w-full px-3 py-1.5 rounded-lg border border-surface-border text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
                    disabled={isLocked}
                    {...form.register(`amlFactors.${index}.notes`)}
                  />
                </div>
              );
            })}
          </div>

          {/* Score summary */}
          <div
            className={cn(
              'px-5 py-4 border-t flex items-center justify-between',
              levelStyle.bg,
              levelStyle.border,
              'border-t'
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={cn('w-5 h-5', levelStyle.text)} />
              <div>
                <p className={cn('text-sm font-semibold', levelStyle.text)}>{levelStyle.label}</p>
                <p className={cn('text-xs opacity-80', levelStyle.text)}>
                  {riskLevel === 'HIGH' && 'EP must review before engagement proceeds'}
                  {riskLevel === 'MEDIUM' && 'EP approval required; enhanced due diligence'}
                  {riskLevel === 'LOW' && 'Standard CDD procedures apply'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn('text-2xl font-bold', levelStyle.text)}>{totalScore}</p>
              <p className={cn('text-xs opacity-80', levelStyle.text)}>/ 21</p>
            </div>
          </div>
        </div>

        {/* ── Section 4: KDPA 2019 ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Data Protection Notice (KDPA 2019)</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Kenya Data Protection Act 2019 requires the data subject to be notified before
              collection and processing of personal data.
            </p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-surface-border px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Data protection notice given to data subject
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirm that the client / UBO has been informed of their rights under KDPA 2019.
                </p>
              </div>
              <Toggle
                checked={form.watch('dataProtectionNoticeGiven')}
                onChange={(v) => form.setValue('dataProtectionNoticeGiven', v)}
                disabled={isLocked}
              />
            </div>

            {form.watch('dataProtectionNoticeGiven') && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Date Notice Given
                </label>
                <input
                  type="date"
                  className="px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
                  disabled={isLocked}
                  {...form.register('dataProtectionNoticeDate')}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        {!isLocked && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitMutation.isPending
                ? 'Saving…'
                : isCompleted
                  ? 'Update KYC Evaluation'
                  : 'Submit KYC Evaluation'}
            </button>
          </div>
        )}
      </form>

      {/* ── EP Approval panel (shown after submission when required) ─────── */}
      {needsEpApproval && isPartner && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-200 bg-amber-50">
            <h2 className="ams-section-title text-amber-800">Engagement Partner — KYC Override</h2>
            <p className="text-xs text-amber-700 mt-1">
              This engagement requires EP approval due to elevated AML risk. Review the evaluation
              above and confirm your decision.
            </p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                EP Override Decision
              </label>
              <div className="flex gap-2">
                {(['PROCEED', 'ENHANCED_MONITORING', 'DECLINE'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEpDecision(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                      epDecision === d
                        ? d === 'PROCEED'
                          ? 'bg-green-600 text-white border-green-600'
                          : d === 'ENHANCED_MONITORING'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-red-600 text-white border-red-600'
                        : 'bg-white border-surface-border text-muted-foreground hover:border-brand/40'
                    )}
                  >
                    {d === 'ENHANCED_MONITORING' ? 'Enhanced Monitoring' : d.charAt(0) + d.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Override Notes <span className="text-destructive">*</span> (min 10 characters)
              </label>
              <textarea
                rows={3}
                value={epNotes}
                onChange={(e) => setEpNotes(e.target.value)}
                placeholder="Explain the basis for your decision, including any additional due diligence performed…"
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => epApproveMutation.mutate()}
                disabled={epApproveMutation.isPending || epNotes.trim().length < 10}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {epApproveMutation.isPending ? 'Recording…' : 'Record EP Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EP approved summary */}
      {evaluation?.epApprovedAt && (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">EP Approval Record</h2>
          </div>
          <div className="px-5 py-4 space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p>
                <span className="font-medium">Decision:</span>{' '}
                {evaluation.riskDecision}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p>
                <span className="font-medium">Approved by:</span>{' '}
                {userNames[evaluation.epApprovedBy ?? ''] ?? evaluation.epApprovedBy}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p>
                <span className="font-medium">Date:</span>{' '}
                {new Date(evaluation.epApprovedAt).toLocaleDateString('en-KE')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
