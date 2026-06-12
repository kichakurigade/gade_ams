'use client';

/**
 * Per-engagement navigation — header (code, client, status) + phase tabs.
 * Rendered by app/(dashboard)/engagements/[id]/layout.tsx so every
 * engagement sub-page shares it.
 *
 * Tabs map to the audit lifecycle; future modules (Planning, Execution,
 * Completion) slot in here as their pages are built.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ShieldCheck, Users, Calculator } from 'lucide-react';
import { engagementApi } from '@/lib/api';
import { cn, riskClassificationLabel } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  ACCEPTANCE: 'bg-blue-50 text-blue-700 border-blue-200',
  PLANNING: 'bg-violet-50 text-violet-700 border-violet-200',
  EXECUTION: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETION: 'bg-teal-50 text-teal-700 border-teal-200',
  SIGNED: 'bg-green-50 text-green-700 border-green-200',
  DECLINED: 'bg-red-50 text-red-700 border-red-200',
  WITHDRAWN: 'bg-gray-50 text-gray-600 border-gray-200',
};

export function EngagementTabs({ engagementId }: { engagementId: string }) {
  const pathname = usePathname();

  const { data } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: () => engagementApi.get(engagementId),
  });
  const engagement = data?.engagement;

  const base = `/engagements/${engagementId}`;
  const tabs = [
    { href: `${base}/team`, label: 'Team', Icon: Users },
    { href: `${base}/acceptance`, label: 'Acceptance', Icon: ClipboardCheck },
    { href: `${base}/kyc`, label: 'KYC / AML', Icon: ShieldCheck },
    { href: `${base}/materiality`, label: 'Materiality', Icon: Calculator },
    // Future: risks, strategy, program (Planning); TB, AJEs, WPs (Execution);
    // EQR, gates, report (Completion)
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Engagement header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {engagement?.engagementCode ?? '…'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {engagement?.client?.clientName ?? ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {engagement?.riskClassification && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-surface-secondary border-surface-border text-muted-foreground">
              {riskClassificationLabel(engagement.riskClassification)}
            </span>
          )}
          {engagement?.status && (
            <span
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-semibold border',
                STATUS_STYLE[engagement.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
              )}
            >
              {engagement.status.charAt(0) + engagement.status.slice(1).toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {/* Phase tabs */}
      <nav className="flex gap-1 border-b border-surface-border">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-surface-border'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
