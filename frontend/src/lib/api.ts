/**
 * Typed API client — thin wrapper around fetch.
 * All requests go to /api (proxied to Fastify via next.config.ts in dev,
 * and via Nginx in production).
 */

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include', // Send httpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await res.json();

  if (!json.success) {
    throw new ApiError(
      json.error?.code ?? 'UNKNOWN',
      json.error?.message ?? 'An error occurred',
      res.status
    );
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ─── Auth ──────────────────────────────────────────────────────────────────

export type LoginStep1Response =
  | { requires2fa: true; userId: string }
  | { requires2faSetup: true; userId: string; qrDataUrl: string; secret: string };

export type LoginStep2Response = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginStep1Response>('/auth/login', { email, password }),

  verifyTotp: (userId: string, token: string) =>
    api.post<LoginStep2Response>('/auth/totp/verify', { userId, token }),

  logout: () => api.post<{ message: string }>('/auth/logout'),

  me: () =>
    api.get<{ user: LoginStep2Response['user'] }>('/auth/me'),
};

// ─── Clients ───────────────────────────────────────────────────────────────

export const clientApi = {
  list: () => api.get<{ clients: Client[] }>('/clients'),

  create: (data: CreateClientInput) =>
    api.post<{ client: Client }>('/clients', data),
};

export interface Client {
  id: string;
  clientCode: string;
  clientName: string;
  entityType?: string | null;
  kraPin?: string | null;
  registrationNo?: string | null;
  industry?: string | null;
  isActive: boolean;
}

export interface CreateClientInput {
  clientCode: string;
  clientName: string;
  entityType?: string;
  kraPin?: string;
  registrationNo?: string;
  industry?: string;
}

// ─── Users ─────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export const userApi = {
  list: () => api.get<{ users: UserSummary[] }>('/users'),
};

// ─── Engagements ───────────────────────────────────────────────────────────

export const engagementApi = {
  list: () => api.get<{ engagements: Engagement[] }>('/engagements'),

  get: (id: string) => api.get<{ engagement: Engagement }>(`/engagements/${id}`),

  create: (data: CreateEngagementInput) =>
    api.post<{ engagement: Engagement }>('/engagements', data),

  getAcceptance: (engagementId: string) =>
    api.get<{ acceptance: AcceptanceRecord | null; userNames: Record<string, string> }>(
      `/engagements/${engagementId}/acceptance`
    ),

  submitAcceptance: (engagementId: string, data: AcceptanceSubmission) =>
    api.post<AcceptanceResult>(
      `/engagements/${engagementId}/acceptance/submit`,
      data
    ),

  reviewAcceptance: (engagementId: string) =>
    api.post<{ acceptance: AcceptanceRecord }>(
      `/engagements/${engagementId}/acceptance/review`
    ),

  approveAcceptance: (engagementId: string) =>
    api.post<{ acceptance: AcceptanceRecord }>(
      `/engagements/${engagementId}/acceptance/approve`
    ),

  declineAcceptance: (engagementId: string, declineReason: string) =>
    api.post<{ message: string }>(
      `/engagements/${engagementId}/acceptance/decline`,
      { declineReason }
    ),

  getKyc: (engagementId: string) =>
    api.get<{ evaluation: KycEvaluation | null; userNames: Record<string, string> }>(
      `/engagements/${engagementId}/kyc`
    ),

  submitKyc: (engagementId: string, data: KycSubmission) =>
    api.post<KycResult>(`/engagements/${engagementId}/kyc/submit`, data),

  epApproveKyc: (engagementId: string, data: EpApproveInput) =>
    api.post<{ evaluation: KycEvaluation; engagementDeclined: boolean }>(
      `/engagements/${engagementId}/kyc/ep-approve`,
      data
    ),

  // ─── Team ───
  getTeam: (engagementId: string) =>
    api.get<{ members: TeamMember[] }>(`/engagements/${engagementId}/team`),

  assignTeamMember: (engagementId: string, data: { userId: string; teamRole: string }) =>
    api.post<{ member: TeamMember }>(`/engagements/${engagementId}/team`, data),

  removeTeamMember: (engagementId: string, userId: string) =>
    api.delete<{ member: TeamMember }>(`/engagements/${engagementId}/team/${userId}`),

  // ─── Materiality (Module 7) ───
  getMateriality: (engagementId: string) =>
    api.get<{ active: MaterialityVersion | null; versions: MaterialityVersion[] }>(
      `/engagements/${engagementId}/materiality`
    ),

  setMateriality: (engagementId: string, data: MaterialityInput) =>
    api.post<{ version: MaterialityVersion }>(
      `/engagements/${engagementId}/materiality`,
      data
    ),
};

export interface TeamMember {
  id: string;
  engagementId: string;
  userId: string;
  teamRole: string;
  assignedAt: string;
  removedAt?: string | null;
  user: { id: string; firstName: string; lastName: string; role: string };
}

export interface MaterialityInput {
  basis: string;
  basisAmount: number;
  basisPercentage: number;
  pemPercentage: number;
  trivialPercentage: number;
  manualOverrideJustification?: string;
  priorYearPbt?: number;
  revisionReason?: string;
}

export interface MaterialityVersion {
  id: string;
  engagementId: string;
  versionNumber: number;
  isActive: boolean;
  basis: string;
  basisAmount: number;
  basisPercentage: number;
  pm: number;
  pemPercentage: number;
  pem: number;
  trivialPercentage: number;
  trivialAmount: number;
  manualOverrideJustification?: string | null;
  pbtVolatilityFlag: boolean;
  setBy: string;
  setAt: string;
  supersededAt?: string | null;
  revisionReason?: string | null;
  user: { id: string; firstName: string; lastName: string };
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Engagement {
  id: string;
  engagementCode: string;
  periodStart: string;
  periodEnd: string;
  reportDate?: string;
  fsFramework: string;
  status: string;
  riskClassification?: string;
  eqrRequired: boolean;
  client: { clientCode: string; clientName: string };
  team: Array<{
    teamRole: string;
    user: { id: string; firstName: string; lastName: string; role: string };
  }>;
}

export interface CreateEngagementInput {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  fsFramework: string;
}

export interface GovFlag {
  factorCode: string;
  factorName: string;
  score: number;
  notes?: string;
}

export interface IndependenceCheckInput {
  userId: string;
  isIndependent: boolean;
  threats?: Array<{ threatType: string; description: string }>;
  safeguards?: Array<{ safeguardType: string; description: string }>;
  notes?: string;
}

export interface AcceptanceSubmission {
  govFlags: GovFlag[];
  independenceChecks: IndependenceCheckInput[];
}

export interface AcceptanceRecord {
  id: string;
  engagementId: string;
  govScore?: number;
  govFlags?: GovFlag[];
  riskClassification?: string;
  independenceCleared: boolean;
  preparedBy?: string;
  preparedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  declinedBy?: string;
  declinedAt?: string;
  declineReason?: string;
}

export interface AcceptanceResult {
  acceptance: AcceptanceRecord;
  govScore: number;
  riskClassification: string;
  eqrRequired: boolean;
  independenceCleared: boolean;
}

export interface AmlFactor {
  factorCode: string;
  factorName: string;
  score: number;
  notes?: string;
}

export interface KycSubmission {
  uboName: string;
  uboPinOrId?: string;
  isPep: boolean;
  pepDetails?: string;
  unSanctionsCheck: boolean;
  ofacSanctionsCheck: boolean;
  sanctionsCleared: boolean;
  amlFactors: AmlFactor[];
  dataProtectionNoticeGiven: boolean;
  dataProtectionNoticeDate?: string;
}

export interface KycEvaluation {
  id: string;
  engagementId: string;
  clientId: string;
  uboName?: string;
  uboPinOrId?: string;
  isPep: boolean;
  pepDetails?: string;
  unSanctionsCheck: boolean;
  ofacSanctionsCheck: boolean;
  sanctionsCleared: boolean;
  sanctionsClearedAt?: string;
  amlScore?: number;
  amlFactors?: AmlFactor[];
  riskDecision?: string;
  epApprovalRequired: boolean;
  epApprovedBy?: string;
  epApprovedAt?: string;
  dataProtectionNoticeGiven: boolean;
  dataProtectionNoticeDate?: string;
  completedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KycResult {
  evaluation: KycEvaluation;
  amlScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskDecision: string;
  epApprovalRequired: boolean;
}

export interface EpApproveInput {
  overrideNotes: string;
  riskDecision: 'PROCEED' | 'ENHANCED_MONITORING' | 'DECLINE';
}
