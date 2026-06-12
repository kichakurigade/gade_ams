'use client';

/**
 * New Engagement form (Module 4).
 *
 * Select an existing client (or register one inline), set the audit period
 * and FS framework. The engagement code is derived as {clientCode}-{year of
 * period end} — previewed live, generated authoritatively by the backend.
 * On success, redirects to the Acceptance tab (Module 5), the first phase.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { clientApi, engagementApi, ApiError, type Client } from '@/lib/api';
import { cn } from '@/lib/utils';

const FS_FRAMEWORKS = [
  { value: 'IFRS_FOR_SMES', label: 'IFRS for SMEs' },
  { value: 'FULL_IFRS', label: 'Full IFRS' },
  { value: 'IPSAS_ACCRUAL', label: 'IPSAS (Accrual)' },
];

const formSchema = z
  .object({
    clientId: z.string().min(1, 'Select a client'),
    periodStart: z.string().min(1, 'Period start is required'),
    periodEnd: z.string().min(1, 'Period end is required'),
    fsFramework: z.enum(['IFRS_FOR_SMES', 'FULL_IFRS', 'IPSAS_ACCRUAL']),
  })
  .refine((d) => new Date(d.periodEnd) > new Date(d.periodStart), {
    message: 'Period end must be after period start',
    path: ['periodEnd'],
  });

type FormValues = z.infer<typeof formSchema>;

const newClientSchema = z.object({
  clientCode: z
    .string()
    .regex(/^[A-Z]\d{3}$/, 'Format: letter + 3 digits, e.g. H001'),
  clientName: z.string().min(2, 'Client name is required'),
  kraPin: z
    .string()
    .regex(/^[A-Z]\d{9}[A-Z]$/, 'Format: P051591395M')
    .optional()
    .or(z.literal('')),
  industry: z.string().optional(),
});

type NewClientValues = z.infer<typeof newClientSchema>;

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand';

export function NewEngagementForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);

  const { data: clientData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientApi.list(),
  });
  const clients = clientData?.clients ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { clientId: '', periodStart: '', periodEnd: '', fsFramework: 'IFRS_FOR_SMES' },
  });

  const clientForm = useForm<NewClientValues>({
    resolver: zodResolver(newClientSchema),
    defaultValues: { clientCode: '', clientName: '', kraPin: '', industry: '' },
  });

  // Live engagement-code preview: {clientCode}-{year of periodEnd}
  const selectedClient = clients.find((c: Client) => c.id === form.watch('clientId'));
  const periodEnd = form.watch('periodEnd');
  const codePreview =
    selectedClient && periodEnd
      ? `${selectedClient.clientCode}-${new Date(periodEnd).getFullYear()}`
      : null;

  const createClientMutation = useMutation({
    mutationFn: (values: NewClientValues) =>
      clientApi.create({
        clientCode: values.clientCode,
        clientName: values.clientName,
        kraPin: values.kraPin || undefined,
        industry: values.industry || undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      form.setValue('clientId', data.client.id);
      setShowNewClient(false);
      clientForm.reset();
      setServerError(null);
    },
    onError: (e) =>
      setServerError(e instanceof ApiError ? e.message : 'Failed to register client'),
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => engagementApi.create(values),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      router.push(`/engagements/${data.engagement.id}/acceptance`);
    },
    onError: (e) =>
      setServerError(e instanceof ApiError ? e.message : 'Failed to create engagement'),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="ams-page-title">New Engagement</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Creates the engagement in Acceptance status — governance scoring and KYC/AML follow.
        </p>
      </div>

      {serverError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <form
        onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
        className="space-y-6"
      >
        {/* ── Client selection ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary flex items-center justify-between">
            <h2 className="ams-section-title">Client</h2>
            <button
              type="button"
              onClick={() => setShowNewClient((s) => !s)}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              {showNewClient ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showNewClient ? 'Cancel' : 'Register new client'}
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Select Client <span className="text-destructive">*</span>
              </label>
              <select className={inputClass} disabled={clientsLoading} {...form.register('clientId')}>
                <option value="">
                  {clientsLoading ? 'Loading clients…' : '— Select a client —'}
                </option>
                {clients.map((c: Client) => (
                  <option key={c.id} value={c.id}>
                    {c.clientCode} — {c.clientName}
                  </option>
                ))}
              </select>
              {form.formState.errors.clientId && (
                <p className="text-xs text-destructive">{form.formState.errors.clientId.message}</p>
              )}
            </div>

            {/* Inline client registration */}
            {showNewClient && (
              <div className="rounded-lg border border-brand/20 bg-brand-muted/40 p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Code <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="H001"
                      className={inputClass}
                      {...clientForm.register('clientCode')}
                    />
                    {clientForm.formState.errors.clientCode && (
                      <p className="text-xs text-destructive">
                        {clientForm.formState.errors.clientCode.message}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Client Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Hambaga Investments Kenya Limited"
                      className={inputClass}
                      {...clientForm.register('clientName')}
                    />
                    {clientForm.formState.errors.clientName && (
                      <p className="text-xs text-destructive">
                        {clientForm.formState.errors.clientName.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      KRA PIN
                    </label>
                    <input
                      type="text"
                      placeholder="P000000000X"
                      className={inputClass}
                      {...clientForm.register('kraPin')}
                    />
                    {clientForm.formState.errors.kraPin && (
                      <p className="text-xs text-destructive">
                        {clientForm.formState.errors.kraPin.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Industry
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Real Estate"
                      className={inputClass}
                      {...clientForm.register('industry')}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clientForm.handleSubmit((v) => createClientMutation.mutate(v))}
                    disabled={createClientMutation.isPending}
                    className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50"
                  >
                    {createClientMutation.isPending ? 'Registering…' : 'Register Client'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Period & framework ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Audit Period &amp; Reporting Framework</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Period Start <span className="text-destructive">*</span>
                </label>
                <input type="date" className={inputClass} {...form.register('periodStart')} />
                {form.formState.errors.periodStart && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.periodStart.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Period End <span className="text-destructive">*</span>
                </label>
                <input type="date" className={inputClass} {...form.register('periodEnd')} />
                {form.formState.errors.periodEnd && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.periodEnd.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                FS Framework <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                {FS_FRAMEWORKS.map((fw) => (
                  <button
                    key={fw.value}
                    type="button"
                    onClick={() =>
                      form.setValue('fsFramework', fw.value as FormValues['fsFramework'])
                    }
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                      form.watch('fsFramework') === fw.value
                        ? 'bg-brand border-brand text-white'
                        : 'bg-white border-surface-border text-muted-foreground hover:border-brand/40'
                    )}
                  >
                    {fw.label}
                  </button>
                ))}
              </div>
            </div>

            {codePreview && (
              <div className="rounded-lg bg-surface-secondary border border-surface-border px-4 py-3">
                <p className="text-xs text-muted-foreground">Engagement code</p>
                <p className="text-sm font-semibold text-foreground">{codePreview}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/engagements')}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-surface-border text-muted-foreground hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Engagement'}
          </button>
        </div>
      </form>
    </div>
  );
}
