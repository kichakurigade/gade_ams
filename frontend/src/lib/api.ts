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

// ─── Engagements ───────────────────────────────────────────────────────────

export const engagementApi = {
  list: () => api.get<{ engagements: Engagement[] }>('/engagements'),

  get: (id: string) => api.get<{ engagement: Engagement }>(`/engagements/${id}`),

  create: (data: CreateEngagementInput) =>
    api.post<{ engagement: Engagement }>('/engagements', data),

  getAcceptance: (engagementId: string) =>
    api.get<{ acceptance: AcceptanceRecord | null }>(
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
};

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
