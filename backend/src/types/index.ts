import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

// ─── Augment Fastify types ─────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    user?: JwtPayload;
  }
}

// ─── JWT payload ──────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;       // User CUID
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

// ─── Governance scoring ───────────────────────────────────────────────────

export interface GovFlag {
  factorCode: string;
  factorName: string;
  score: number;     // 0 | 1 | 2 | 3
  notes?: string;
}

// ─── AML factors ─────────────────────────────────────────────────────────

export interface AmlFactor {
  factorCode: string;
  factorName: string;
  score: number;
  notes?: string;
}

// ─── API response envelope ────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
