'use client';

/**
 * Engagement team assignment.
 *
 * Must be completed before acceptance (Module 5) — independence checks are
 * per team member. EQR reviewers must be partners (enforced server-side too).
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserMinus, Users } from 'lucide-react';
import { engagementApi, userApi, ApiError, type TeamMember, type UserSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

const TEAM_ROLES = [
  { value: 'ENGAGEMENT_PARTNER', label: 'Engagement Partner' },
  { value: 'EQR_REVIEWER', label: 'EQR Reviewer' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'STAFF', label: 'Staff' },
];

function teamRoleLabel(role: string): string {
  return TEAM_ROLES.find((r) => r.value === role)?.label ?? role;
}

const ROLE_BADGE: Record<string, string> = {
  ENGAGEMENT_PARTNER: 'bg-brand-muted text-brand border-brand/20',
  EQR_REVIEWER: 'bg-violet-50 text-violet-700 border-violet-200',
  MANAGER: 'bg-blue-50 text-blue-700 border-blue-200',
  SENIOR: 'bg-teal-50 text-teal-700 border-teal-200',
  STAFF: 'bg-gray-50 text-gray-600 border-gray-200',
};

export function TeamPanelClient({ engagementId }: { engagementId: string }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('STAFF');

  const { data: engData } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: () => engagementApi.get(engagementId),
  });

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['team', engagementId],
    queryFn: () => engagementApi.getTeam(engagementId),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list(),
  });

  const engagement = engData?.engagement;
  const members = teamData?.members ?? [];
  const allUsers = usersData?.users ?? [];
  const assignedIds = new Set(members.map((m: TeamMember) => m.userId));
  const availableUsers = allUsers.filter((u: UserSummary) => !assignedIds.has(u.id));
  const isLocked = ['DECLINED', 'WITHDRAWN', 'SIGNED'].includes(engagement?.status ?? '');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['team', engagementId] });
    queryClient.invalidateQueries({ queryKey: ['engagement', engagementId] });
  };

  const assignMutation = useMutation({
    mutationFn: () =>
      engagementApi.assignTeamMember(engagementId, {
        userId: selectedUserId,
        teamRole: selectedRole,
      }),
    onSuccess: () => {
      invalidate();
      setSelectedUserId('');
      setServerError(null);
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'Assignment failed'),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => engagementApi.removeTeamMember(engagementId, userId),
    onSuccess: () => {
      invalidate();
      setServerError(null);
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : 'Removal failed'),
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
        <h1 className="ams-page-title">Engagement Team</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {engagement?.engagementCode} — {engagement?.client?.clientName}. Independence
          declarations at acceptance are made per team member.
        </p>
      </div>

      {serverError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* ── Assign member ─────────────────────────────────────────────── */}
      {!isLocked && (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
            <h2 className="ams-section-title">Assign Team Member</h2>
          </div>
          <div className="px-5 py-4 flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                User
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand"
              >
                <option value="">— Select user —</option>
                {availableUsers.map((u: UserSummary) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.role.replace(/_/g, ' ').toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-52 space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Team Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand"
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => assignMutation.mutate()}
              disabled={!selectedUserId || assignMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {assignMutation.isPending ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </div>
      )}

      {/* ── Current team ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border bg-surface-secondary">
          <h2 className="ams-section-title">Current Team ({members.length})</h2>
        </div>

        {members.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No team members assigned yet. Assign at least the Engagement Partner before
              completing acceptance.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {members.map((m: TeamMember) => (
              <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-brand-muted flex items-center justify-center text-brand text-xs font-semibold flex-shrink-0">
                    {m.user.firstName[0]}
                    {m.user.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.user.firstName} {m.user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Assigned {new Date(m.assignedAt).toLocaleDateString('en-KE')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border',
                      ROLE_BADGE[m.teamRole] ?? ROLE_BADGE['STAFF']
                    )}
                  >
                    {teamRoleLabel(m.teamRole)}
                  </span>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removeMutation.mutate(m.userId)}
                      disabled={removeMutation.isPending}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                      title="Remove from team"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
