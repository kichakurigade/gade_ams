'use client';

/**
 * Module 7: Materiality (ISA 320)
 *
 * Versioned — submitting supersedes the active version (revision reason
 * required from v2). PM / PeM / Trivial computed live for preview; the
 * backend recomputes authoritatively.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, History, Info } from 'lucide-react';
import { engagementApi, ApiError, type MaterialityVersion } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

// Suggested percentage ranges — guidance shown to the user, not enforced
const BASES = [
  { value: 'PBT', label: 'Profit Before Tax', range: '5–10%', defaultPct: 7.5 },
  { value: 'TOTAL_ASSETS', label: 'Total Assets', range: '1–2%', defaultPct: 1.5 },
  { value: 'REVENUE', label: 'Revenue', range: '0.5–1%', defaultPct: 0.75 },
  { value: 'EXPENDITURE', label: 'Total Expenditure', range: '1–3%', defaultPct: 2 },
  { value: 'NET_ASSETS', label: 'Net Assets', range: '2–5%', defaultPct: 3 },
  { value: 'MANUAL_OVERRIDE', label: 'Manual Override', range: 'justify', defaultPct: 100 },
];

const formSchema = z
  .object({
    basis: z.enum(['PBT', 'TOTAL_ASSETS', 'REVENUE', 'EXPENDITURE', 'NET_ASSETS', 'MANUAL_OVERRIDE']),
    basisAmount: z.coerce.number().positive('Enter a positive amount'),
    basisPercentage: z.coerce.number().positive().max(100),
    pemPercentage: z.coerce.number().positive().max(100),
    trivialPercentage: z.coerce.number().positive().max(100),
    manualOverrideJustification: z.string().optional(),
    priorYearPbt: z.coerce.number().optional(),
    revisionReason: z.string().optional(),
  })
  .refine(
    (d) =>
      d.basis !== 'MANUAL_OVERRIDE' ||
      (d.manualOverrideJustification != null &&
        d.manualOverrideJustification.trim().length >= 10),
    {
      message: 'Manual override requires a justification (min 10 characters)',
      path: ['manualOverrideJustification'],
    }
  );

type FormValues = z.infer<typeof formSchema>;

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand';

export function MaterialityFormClient({ engagementId }: { engagementId: string }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: engData } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: () => engagementApi.get(engagementId),
  });

  const { data: matData, isLoading } = useQuery({
    queryKey: ['materiality', engagementId],
    queryFn: () => engagementApi.getMateriality(engagementId),
  });

  const engagement = engData?.engagement;
  const active = matData?.active;
  const versions = matData?.versions ?? [];
  const isRevision = !!active;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      basis: 'PBT',
      basisAmount: 0,
      basisPercentage: 7.5,
      pemPercentage: 75,
      trivialPercentage: 5,
      manualOverrideJustification: '',
      revisionReason: '',
    },
  });

  const basis = form.watch('basis');
  const basisAmount = form.watch('basisAmount') || 0;
  const basisPercentage = form.watch('basisPercentage') || 0;
  const pemPercentage = form.watch('pemPercentage') || 0;
  const trivialPercentage = form.watch('trivialPercentage') || 0;

  // Live preview — backend recomputes authoritatively
  const pm = (basisAmount * basisPercentage) / 100;
  const pem = (pm * pemPercentage) / 100;
  const trivial = (pm * trivialPercentage) / 100;
  const selectedBasis = BASES.find((b) => b.value === basis);

  const submitMutation = useMutation({
    mutationFn: (values: FormValues) =>
      engagementApi.setMateriality(engagementId, {
        ...values,
        priorYearPbt: values.priorYearPbt || undefined,
        manualOverrideJustification: values.manualOverrideJustification || undefined,
        revisionReason: values.revisionReason || undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['materiality', engagementId] });
      setSuccessMessage(
        `Materiality v${data.version.versionNumber} set. PM ${formatCurrency(data.version.pm)} · ` +
          `PeM ${formatCurrency(data.version.pem)} · Trivial ${formatCurrency(data.version.trivialAmount)}.` +
          (data.version.pbtVolatilityFlag
            ? ' ⚠ PBT volatility flag raised (>50% YoY swing).'
            : '')
      );
      setServerError(null);
      form.setValue('revisionReason', '');
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'Failed to set materiality'),
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
      <div>
        <h1 className="ams-page-title">Materiality (ISA 320)</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {engagement?.engagementCode} — {engagement?.client?.clientName}
        </p>
      </div>

      {/* Active version summary */}
      {active && (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary flex items-center justify-between">
            <h2 className="ams-section-title">
              Active — Version {active.versionNumber}
            </h2>
            <p className="text-xs text-muted-foreground">
              Set by {active.user.firstName} {active.user.lastName} on{' '}
              {new Date(active.setAt).toLocaleDateString('en-KE')}
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-surface-border">
            {[
              { label: 'Planning Materiality (PM)', value: active.pm },
              { label: `Performance Materiality (${active.pemPercentage}%)`, value: active.pem },
              { label: `Trivial Threshold (${active.trivialPercentage}%)`, value: active.trivialAmount },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-4 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(value)}</p>
              </div>
            ))}
          </div>
          {active.pbtVolatilityFlag && (
            <div className="px-5 py-3 border-t border-amber-200 bg-amber-50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                PBT volatility flag — prior-year swing exceeded 50%. Consider a more stable basis.
              </p>
            </div>
          )}
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

      {/* ── Set / revise form ─────────────────────────────────────────── */}
      <form
        onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))}
        className="space-y-6"
      >
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">
              {isRevision ? `Revise Materiality (creates v${(active?.versionNumber ?? 0) + 1})` : 'Set Materiality'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Revisions supersede the active version; full history is preserved.
            </p>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Basis selection */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Benchmark Basis
              </label>
              <div className="grid grid-cols-3 gap-2">
                {BASES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => {
                      form.setValue('basis', b.value as FormValues['basis']);
                      form.setValue('basisPercentage', b.defaultPct);
                    }}
                    className={cn(
                      'px-3 py-2.5 rounded-lg text-sm font-medium border text-left transition-colors',
                      basis === b.value
                        ? 'bg-brand border-brand text-white'
                        : 'bg-white border-surface-border text-muted-foreground hover:border-brand/40'
                    )}
                  >
                    <span className="block">{b.label}</span>
                    <span className={cn('text-xs', basis === b.value ? 'text-white/70' : 'opacity-60')}>
                      {b.range}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {basis === 'MANUAL_OVERRIDE' ? 'Materiality Amount (KES)' : 'Basis Amount (KES)'}
                </label>
                <input
                  type="number"
                  step="any"
                  className={inputClass}
                  {...form.register('basisAmount')}
                />
                {form.formState.errors.basisAmount && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.basisAmount.message}
                  </p>
                )}
              </div>
              {basis !== 'MANUAL_OVERRIDE' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Percentage applied{' '}
                    {selectedBasis && (
                      <span className="normal-case font-normal">
                        (suggested {selectedBasis.range})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className={inputClass}
                    {...form.register('basisPercentage')}
                  />
                </div>
              )}
            </div>

            {basis === 'PBT' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Prior-Year PBT (KES) — optional volatility check
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Flags PBT volatility if the YoY swing exceeds 50%"
                  className={inputClass}
                  {...form.register('priorYearPbt')}
                />
              </div>
            )}

            {basis === 'MANUAL_OVERRIDE' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Override Justification <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Why is a manual amount appropriate for this engagement?"
                  className={cn(inputClass, 'resize-none')}
                  {...form.register('manualOverrideJustification')}
                />
                {form.formState.errors.manualOverrideJustification && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.manualOverrideJustification.message}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  PeM as % of PM (default 75%)
                </label>
                <input type="number" step="any" className={inputClass} {...form.register('pemPercentage')} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Trivial as % of PM (default 5%)
                </label>
                <input type="number" step="any" className={inputClass} {...form.register('trivialPercentage')} />
              </div>
            </div>

            {isRevision && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Revision Reason <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Final TB received — PBT materially different from estimate"
                  className={inputClass}
                  {...form.register('revisionReason')}
                />
              </div>
            )}
          </div>

          {/* Live preview */}
          <div className="px-5 py-4 border-t border-surface-border bg-surface-secondary grid grid-cols-3 gap-4">
            {[
              { label: 'PM', value: pm },
              { label: `PeM (${pemPercentage}%)`, value: pem },
              { label: `Trivial (${trivialPercentage}%)`, value: trivial },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-bold text-foreground">
                  {value > 0 ? formatCurrency(value) : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50"
          >
            {submitMutation.isPending
              ? 'Saving…'
              : isRevision
                ? 'Save as New Version'
                : 'Set Materiality'}
          </button>
        </div>
      </form>

      {/* ── Version history ───────────────────────────────────────────── */}
      {versions.length > 1 && (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-secondary/50 transition-colors"
          >
            <span className="flex items-center gap-2 ams-section-title">
              <History className="w-4 h-4" />
              Version History ({versions.length})
            </span>
            <span className="text-xs text-muted-foreground">{showHistory ? 'Hide' : 'Show'}</span>
          </button>
          {showHistory && (
            <div className="divide-y divide-surface-border border-t border-surface-border">
              {versions.map((v: MaterialityVersion) => (
                <div key={v.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      v{v.versionNumber} — {BASES.find((b) => b.value === v.basis)?.label ?? v.basis}
                      {v.isActive && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.user.firstName} {v.user.lastName} ·{' '}
                      {new Date(v.setAt).toLocaleDateString('en-KE')}
                      {v.revisionReason && ` · ${v.revisionReason}`}
                    </p>
                  </div>
                  <p className="text-muted-foreground flex-shrink-0">
                    PM {formatCurrency(v.pm)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
