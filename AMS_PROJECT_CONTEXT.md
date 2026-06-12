# AMS Project Context — Gade Associates Audit Management System

> Read this file at session start. It describes all design decisions, module status, and
> architectural constraints. The schema and route files are authoritative; this doc explains *why*.

---

## Stack & Infrastructure

| Layer | Technology | Notes |
|---|---|---|
| Backend | Fastify 4.28.1 + TypeScript (ES modules) | Node ≥ 22 required |
| ORM | Prisma 5.15.0 → PostgreSQL 16 | `DATABASE_URL` injected by Docker |
| Cache | Redis 7 (ioredis) | password-auth; used for session tokens |
| Antivirus | ClamAV (clamscan) | scans every uploaded file |
| Frontend | Next.js 15, React Query 5, Tailwind 3.4, shadcn/ui (Radix) | App Router |
| Auth | JWT (httpOnly cookie) + TOTP (otplib) | 15-min access / 7-day refresh |
| Encryption | AES-256-GCM | ENCRYPTION_MASTER_KEY in .env; used for TB files and WP versions |
| Proxy | Nginx 1.25-alpine | /api/* → Fastify:4000; TLS via Certbot |
| Dev proxy | next.config.ts rewrites | BACKEND_URL env var (default http://localhost:4000) |
| Domain | ams.gadeassociates.co.ke | DOMAIN in .env |

### Environment variables (`.env`)
- `POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD` — database credentials
- `REDIS_PASSWORD` — Redis auth
- `JWT_SECRET` (64-byte hex) / `JWT_EXPIRY=15m` / `REFRESH_TOKEN_EXPIRY=7d`
- `ENCRYPTION_MASTER_KEY` (32-byte hex) — AES-256-GCM master key
- `MAX_FILE_SIZE_MB=25`
- `DOMAIN=ams.gadeassociates.co.ke`
- `CERTBOT_EMAIL=kichakuri@gadeassociates.co.ke`
- `NODE_ENV=production`

### `frontend/next.config.ts` behaviour
- `output: 'standalone'` — Docker-optimised build
- Dev rewrites: `source: '/api/:path*'` → `BACKEND_URL/:path*` (default `http://localhost:4000`)
- Security headers on all routes: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`

---

## Folder Structure

```
gade_ams/
├── backend/
│   ├── src/
│   │   ├── app.ts              — Fastify app factory (registers all plugins + routes)
│   │   ├── server.ts           — Entry point
│   │   ├── config.ts           — Typed env loader
│   │   ├── lib/
│   │   │   ├── auditLog.ts     — writeAuditLog() helper (INSERT-ONLY)
│   │   │   └── encryption.ts   — AES-256-GCM encrypt/decrypt
│   │   ├── plugins/
│   │   │   ├── auth.ts         — JWT verify + fastify.authenticate decorator
│   │   │   ├── cors.ts
│   │   │   ├── multipart.ts    — File upload + ClamAV scan
│   │   │   ├── prisma.ts       — fastify.prisma decorator
│   │   │   └── rateLimit.ts
│   │   └── routes/
│   │       ├── auth/index.ts   — login, refresh, TOTP verify, me, logout
│   │       ├── clients/index.ts — client registry: GET list, POST create (code regex [A-Z]\d{3})
│   │       ├── users/index.ts   — GET active users (read-only; for team pickers)
│   │       └── engagements/
│   │           ├── index.ts    — engagement CRUD + plugin registration
│   │           ├── acceptance.ts — Module 5: governance scoring + independence checks
│   │           ├── kyc.ts      — Module 6: KYC/AML evaluation (POCAMLA Cap. 59B)
│   │           ├── team.ts     — team assignment (soft remove; EQR reviewer must be partner)
│   │           └── materiality.ts — Module 7: ISA 320 versioned materiality
│   └── prisma/
│       ├── schema.prisma       — Single source of truth for all models
│       └── seed.ts
├── frontend/
│   ├── next.config.ts
│   └── src/
│       ├── app/
│       │   ├── (auth)/login/page.tsx
│       │   └── (dashboard)/
│       │       ├── layout.tsx
│       │       ├── page.tsx
│       │       └── engagements/
│       │           ├── page.tsx               — engagement list
│       │           ├── new/page.tsx           — new engagement (client picker + inline client reg.)
│       │           └── [id]/
│       │               ├── layout.tsx          — renders EngagementTabs (per-engagement nav)
│       │               ├── team/page.tsx       — team assignment panel
│       │               ├── acceptance/page.tsx — Module 5 form
│       │               ├── kyc/page.tsx        — Module 6 form
│       │               └── materiality/page.tsx — Module 7 form
│       ├── components/ams/
│       │   ├── AcceptanceForm.tsx  — Module 5 component
│       │   ├── AuthGuard.tsx
│       │   ├── EngagementList.tsx
│       │   ├── KycAmlForm.tsx      — Module 6 component
│       │   ├── LoginForm.tsx
│       │   └── Sidebar.tsx
│       ├── hooks/useAuth.ts
│       └── lib/
│           ├── api.ts   — typed fetch wrapper + engagementApi (incl. KYC methods)
│           └── utils.ts — cn, formatDate, formatCurrency, riskClassificationLabel
├── nginx/nginx.conf
├── docker-compose.yml
├── .env                — NEVER commit; generated from .env.example
└── .env.example
```

---

## Data Model Key Rules

1. `audit_log`, `review_comments`, `program_step_overrides` — **INSERT-ONLY** (no updates).
2. Lead schedule totals and FS figures are **never stored** — computed on-the-fly.
3. Every `TrialBalanceImport` and `WorkingPaperVersion` file is **encrypted at rest** (AES-256-GCM)
   and **ClamAV-scanned** before storage.
4. `MaterialityVersion` creates a new row on every change; prior row `isActive = false`.

---

## Module Status

### Phase 1 — Core (done)
- **M1** User auth (JWT + TOTP), roles: MANAGING_PARTNER / ASSURANCE_PARTNER / PROFESSIONAL_STAFF
- **M2** Firm settings singleton
- **M3** Client registry (clientCode matches A01.Admin billing codes)
  — `GET/POST /clients`; frontend inline registration on the New Engagement form
- **M4** Engagement creation (engagementCode = `{clientCode}-{year}`)
  — `/engagements/new` page: client picker, period dates, FS framework, live code preview;
  redirects to `/engagements/{id}/acceptance` on create

### Phase 2 — Acceptance (done)
- **M5** Governance scoring (7 factors × 0–3 = max 21; NORMAL ≤ 9 / GTN 10–15 / MGTN 16–21)
  + independence checks + 3-tier approval (Preparer → Reviewer → Approving Partner)
  + status advance to PLANNING on approval
  - Routes: `GET/POST /engagements/:id/acceptance/{submit,review,approve,decline}`
  - Frontend: `AcceptanceForm.tsx`, page at `/engagements/[id]/acceptance`

- **M6** KYC/AML Evaluation (POCAMLA Cap. 59B + KDPA 2019)
  - 7-factor AML score (each 1–3; total 7–21): Low 7–10 / Medium 11–15 / High 16–21
  - AML factors: COUNTRY_RISK, ENTITY_TYPE_RISK, PRODUCT_SERVICE_RISK,
    DELIVERY_CHANNEL_RISK, TRANSACTION_PATTERN_RISK, UBO_RISK, SOURCE_OF_FUNDS_RISK
  - Risk decision: PROCEED | ENHANCED_MONITORING | DECLINE
  - EP approval required when decision ≠ PROCEED
  - KDPA 2019: data-protection notice to data subject
  - Sanctions checks: UN + OFAC
  - Routes: `GET / POST /submit / POST /ep-approve` under `/engagements/:id/kyc`
  - Frontend: `KycAmlForm.tsx`, page at `/engagements/[id]/kyc`
  - **Workflow rules:**
    - Acceptance `/approve` gates on KYC: must be completed, not DECLINE, and
      EP-approved if `epApprovalRequired` (error codes KYC_NOT_COMPLETED / KYC_DECLINED / KYC_EP_PENDING)
    - EP decision DECLINE routes through the acceptance decline (the one place
      engagements die): upserts decline fields on EngagementAcceptance + sets status DECLINED
    - Zod self-consistency: sanctionsCleared requires both list checks; isPep requires pepDetails;
      AML factor codes must be unique
    - Form locks after EP records a final decision (resubmit would void the override)

### Phase 2.5 — Team assignment (done)
- `GET/POST /engagements/:id/team`, `DELETE /team/:userId` (soft remove via removedAt)
- Rules: EQR reviewer must be a partner; team locked on DECLINED/WITHDRAWN/SIGNED;
  upsert revives a previously removed member
- Frontend: `TeamPanel.tsx` at `/engagements/[id]/team` (first tab — team precedes acceptance)

### Phase 3 — Planning (M7 done; M8–M11 schema ready, routes/UI pending)
- **M7** Materiality (ISA 320) — **done**
  - `GET/POST /engagements/:id/materiality`; status gate PLANNING or EXECUTION (frozen from COMPLETION)
  - PM = basis × pct / 100; PeM default 75% of PM; Trivial default 5% of PM — computed server-side
  - Versioned: new version deactivates prior (supersededAt); revisionReason required from v2
  - MANUAL_OVERRIDE basis requires ≥10-char justification; PBT basis + priorYearPbt input
    sets pbtVolatilityFlag when YoY swing > 50%
  - Suggested ranges (guidance only): PBT 5–10% | Assets 1–2% | Revenue 0.5–1% | Expenditure 1–3% | Net assets 2–5%
  - Frontend: `MaterialityForm.tsx` at `/engagements/[id]/materiality` — live PM/PeM/Trivial
    preview, active-version card, collapsible version history
- **M8** Risk Assessment — `RiskType` library (25+ ISA mandatory risks) + `RiskAssessment`
- **M9** Audit Strategy — `AuditStrategy` + per-area approach (SUBSTANTIVE / COMBINED)
- **M10** Procedure Library — `ProcedureLibrary` + `RiskProcedureMapping`
- **M11** Audit Program generation — `AuditProgram` + `AuditProgramStep`

### Phase 4 — Execution (schema ready; routes/UI pending)
- **M12** Trial Balance import (encrypted XLSX, ClamAV) + account mapping
- **M13** Adjusting Journal Entries (AJEs) — PROPOSED / AGREED / WAIVED; 3-tier approval
- **M14** Working Papers — upload, version control (encrypted), review comments (INSERT-ONLY)

### Phase 5 — Completion (schema ready; routes/UI pending)
- **M15** EQR (External Quality Review) — 8 parts A–H
- **M16** Completion Gates — 3 sequential sign-off blockers
- **M17** Audit Report — UNMODIFIED / QUALIFIED / ADVERSE / DISCLAIMER
- **M18** Notes/Narrative templates

---

## API Conventions

- All responses: `{ success: true, data: {...} }` or `{ success: false, error: { code, message } }`
- Auth: httpOnly JWT cookie (set by `/auth/totp/verify`); all `/engagements/*` require `fastify.authenticate`
- Audit logs written via `writeAuditLog(fastify.prisma, { actorId, action, entityType, entityId, ... })`
- Preparer ≠ Reviewer enforced on all 3-tier workflows
- Only MANAGING_PARTNER / ASSURANCE_PARTNER can approve or decline

## Frontend Conventions

- API calls go through `frontend/src/lib/api.ts` — typed `engagementApi` object
- All dashboard pages are in `(dashboard)/` route group; protected by `AuthGuard`
- **`(dashboard)` is a route group — it does NOT appear in URLs.** Real paths are
  `/engagements`, `/engagements/[id]/acceptance`, `/engagements/[id]/kyc` (no `/dashboard` prefix)
- Per-engagement nav: `engagements/[id]/layout.tsx` renders `EngagementTabs.tsx`
  (header with code/client/status badge + phase tabs Acceptance · KYC/AML; future phases slot in)
- GET acceptance/kyc responses include a `userNames: Record<id, "First Last">` map for
  resolving preparedBy/reviewedBy/approvedBy/epApprovedBy IDs to display names
- Form state: React Hook Form + zod resolver
- Server state: React Query (queryKey conventions: `['engagement', id]`, `['acceptance', id]`, `['kyc', id]`)
- Styling: Tailwind utility classes; `cn()` from `lib/utils.ts`
- Class tokens used: `ams-page-title`, `ams-section-title`, `bg-brand`, `text-brand`,
  `border-surface-border`, `bg-surface-secondary`, `text-muted-foreground`

---

*Last updated: 2026-06-12*
