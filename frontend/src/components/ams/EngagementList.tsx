'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, ChevronRight } from 'lucide-react';
import { engagementApi, type Engagement } from '@/lib/api';
import { formatDate, riskClassificationLabel, cn } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  ACCEPTANCE: 'bg-amber-50 text-amber-700 border-amber-200',
  PLANNING: 'bg-blue-50 text-blue-700 border-blue-200',
  EXECUTION: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  COMPLETION: 'bg-purple-50 text-purple-700 border-purple-200',
  SIGNED: 'bg-green-50 text-green-700 border-green-200',
  DECLINED: 'bg-red-50 text-red-700 border-red-200',
  WITHDRAWN: 'bg-gray-50 text-gray-600 border-gray-200',
};

const RISK_BADGE: Record<string, string> = {
  NORMAL: 'bg-green-50 text-green-700',
  GTN: 'bg-amber-50 text-amber-700',
  MGTN: 'bg-red-50 text-red-700',
};

export function EngagementListClient() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['engagements'],
    queryFn: () => engagementApi.list(),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ams-page-title">Engagements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All audit engagements across active clients
          </p>
        </div>
        <Link
          href="/dashboard/engagements/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          New engagement
        </Link>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive text-center">
          Failed to load engagements. Please refresh.
        </div>
      )}

      {data && (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          {data.engagements.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No engagements yet.{' '}
              <Link href="/dashboard/engagements/new" className="text-brand hover:underline">
                Create the first one.
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-secondary">
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                    Engagement
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                    Client
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                    Period
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                    Risk
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                    Framework
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.engagements.map((eng: Engagement) => (
                  <tr
                    key={eng.id}
                    className="hover:bg-surface-secondary/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/engagements/${eng.id}`}
                        className="font-medium text-foreground hover:text-brand"
                      >
                        {eng.engagementCode}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {eng.client.clientName}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {formatDate(eng.periodStart)} – {formatDate(eng.periodEnd)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                          STATUS_BADGE[eng.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
                        )}
                      >
                        {eng.status.charAt(0) + eng.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {eng.riskClassification ? (
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            RISK_BADGE[eng.riskClassification]
                          )}
                        >
                          {riskClassificationLabel(eng.riskClassification)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {eng.fsFramework.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
