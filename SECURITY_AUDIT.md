# SECURITY_AUDIT.md — Edura pre-payment security audit

**Status:** Phase 1 (recon) and Phase 2 (deep audit, graded findings, PoCs) complete — 2026-09-05. Phase 3 (checklist, payment design, fix plan) written 2026-09-06, and **remediation executed the same day: every High, Medium and Low is Fixed in code except the M-05 gateway-refund executor, which is Deferred until the Paymob driver exists (see §4).** The Phase 1 §4 "preliminary observations" are superseded by the graded Phase 2 findings.

**Scope:** the working tree at commit `079f52f` plus the uncommitted refund work (`payments/[id]/route.ts`, `refund-payment.ts`, `center-money.ts`, migration `20260908120000_refund_multiple_partials`). Working tree is audited because that is what ships next.

**Rule followed:** no secret values appear in this document; only variable names and file paths.

---

## 1. Project map

### 1.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| Monorepo | Turborepo 2.10, Bun 1.3.12 workspaces (`apps/*`, `packages/*`) | Bun is package manager AND runtime for `start`; `next dev` still runs under Node. |
| Web apps | Next.js 16.3.0 (App Router, route handlers), React 19.2.8, TypeScript 7.0.2 | `apps/erp` (the product: center/teacher/assistant/parent/student), `apps/superadmin` (back office: super_admin/accountant), `apps/www` (marketing, no API). |
| Realtime | `apps/realtime` — Socket.IO 4.8 on a plain `node:http` server, run with `bun src/server.ts` | Deployed on Railway (`railway.json`), health at `/healthz`. |
| Auth | better-auth 1.6.25 (DB sessions, `twoFactor` plugin, custom `invite-token` and `view-as` plugins), bcryptjs cost 10 | Two independent instances with separate cookie prefixes and separate secrets (`NEXTAUTH_SECRET` vs `SUPERADMIN_NEXTAUTH_SECRET`). |
| Database | PostgreSQL on Neon, Prisma 7.10 (`@prisma/adapter-neon` over WebSocket, or `@prisma/adapter-pg`) | App role `edura_app` is `NOBYPASSRLS`; owner string only in `DIRECT_URL`/`ADMIN_URL`. 82 tables, 41 RLS tables, 62 policies, 75 migrations in `packages/database/prisma/migrations`. |
| Validation | zod 4.4.3 via `parseJson` / `parseOrThrow` / `parseOptionalJson` (`packages/server-core/src/validation/zod.ts`) | |
| Rate limiting | Token bucket, Redis (ioredis, Lua script) with in-memory fallback and a circuit breaker (`packages/server-core/src/rate-limit/token-bucket.ts`) | `REDIS_URL` required in production by `assertSharedRateLimitStore` (called from `instrumentation.ts`). |
| Payments | Gateway abstraction (`apps/erp/src/lib/services/payments/gateway/`): `mock` driver (HMAC-SHA512 over raw body) and an **empty** `paymob` driver stub | `PAYMENTS_MODE` must be explicit in production. Money is integer piasters (`Int`), currency `EGP`. |
| Media | Cloudinary signed uploads (`packages/server-core/src/media/cloudinary.ts`), PDFs (materials) with magic-byte checks | |
| Messaging egress | SMTP via nodemailer (`packages/notifications`), WhatsApp Cloud API driver (mock by default), Web Push (VAPID) | |
| Observability | Sentry (`@sentry/nextjs`), PostHog (proxied through `/ingest/*` rewrite) | |
| Hosting | Vercel for `erp`, `superadmin`, `www` (`apps/*/vercel.json`); Railway for `realtime` | No Dockerfile anywhere. No nginx. |
| CI/CD | GitHub Actions: `ci.yml` (gitleaks full history, typecheck, unit, DB suites on a throwaway Postgres, seeds idempotence), `deploy.yml`, `deploy-drift.yml`, `cron.yml` (POSTs to `/api/v1/cron/*` with `x-cron-secret`), `backup.yml` (nightly encrypted dump to B2 + weekly restore proof), `migrate-production.yml` (dispatch-only) | |

### 1.2 Entry points

| Surface | Location | How reached |
|---|---|---|
| ERP HTTP API | `apps/erp/src/app/api/**/route.ts` — **238 route files** | Browser (same-origin fetch via `ky`), PWA service worker |
| Back-office HTTP API | `apps/superadmin/src/app/api/**/route.ts` — **191 route files** | Browser, separate host + separate cookies |
| better-auth catch-all | `apps/{erp,superadmin}/src/app/api/auth/[...all]/route.ts` | sign-in, sign-out, 2FA, session, `invite-token/claim`, `view-as/claim` (ERP), `admin/*` (superadmin, 7 paths sealed) |
| Payment webhook | `POST /api/v1/payments/paymob/webhook` | Gateway server-to-server; HMAC in query string |
| Cron | `POST /api/v1/cron/[job]` (9 jobs) | GitHub Actions `cron.yml` with `CRON_SECRET` |
| Internal bridge | `POST /api/v1/internal/chat-notify` (ERP) and `POST /internal/message`, `/internal/read` (realtime) | Server-to-server with `INTERNAL_API_SECRET` header `x-internal-secret` |
| Socket.IO | `apps/realtime/src/server.ts` events `message:send`, `conversation:read`, `typing` + presence | Browser with a 60-second HS256 JWT minted by `GET /api/v1/realtime/token` |
| Health | `GET/HEAD /api/health` (both apps), `GET /api/v1/_ping` (ERP), `GET /healthz` (realtime) | Public |
| CSP reports | `POST /api/v1/security/csp-report` (both apps) | Public, rate limited, 16 KB cap |
| Pages / middleware | `apps/*/src/proxy.ts` is next-intl locale routing only — **no auth in middleware**; every route handler must guard itself | |
| DB tooling | `packages/database/scripts/*.ts` (`db-guard`, `verify-db`, `wipe-data`, `bootstrap-app-role`, seeds) | Operators only; guarded by the in-database `edura-env:<env>` label |

### 1.3 Environment and secrets handling

- Tracked in git: only `*.example` files (`.env.production.example`, `apps/*/.env.local.example`, `packages/database/.env.{local,test}.example`). `.gitignore` excludes `.env*` and `.vercelignore` excludes `.env*` from deploy uploads.
- `git log --all` shows only example files were ever added under an `.env*` name. A local full-history gitleaks run (`gitleaks git --log-opts=--all`, 267 commits) reports **no leaks**; CI runs the same scan on every push; a `pre-commit` hook runs `gitleaks protect --staged`.
- `.gitleaks.toml` allowlists one immutable historical commit (`8ad8e35…`) that contained demo logins and a since-rotated dev `NEXTAUTH_SECRET`. Acceptable, but note the rotated secret's history still exists in that commit.
- Untracked local files at repo root (`.env-erp`, `.env-superadmin`, `.env-realtime`, `.env-www`, `.env.production`) hold real values. They are gitignored. `.env.production` is mode 0600; the four `.env-*` paste files are **0644** (world-readable on a shared machine). Local hygiene item, not a product finding.
- Production-required, fail-closed variables (verified in code): `PAYMENTS_MODE`, `PAYMOB_HMAC_SECRET` (mock driver throws without it in production), `REALTIME_JWT_SECRET`, `INTERNAL_API_SECRET`, `CRON_SECRET` (fails closed when unset in every env), `STUDENT_QR_SECRET`, `VIEW_AS_SECRET`, `REDIS_URL`, `NEXT_PUBLIC_SENTRY_DSN` (build throws on Vercel production).
- Variables with **development fallbacks to fixed literals** (safe only because production throws): `VIEW_AS_SECRET` → `"edura-development-view-as-secret"`, mock HMAC → `"edura-mock-hmac"`, realtime `REALTIME_JWT_SECRET`/`INTERNAL_API_SECRET` → app auth secret.
- `apps/erp/src/lib/auth/auth.ts:29` reads `NEXTAUTH_SECRET` directly (no throw if absent — relies on better-auth's own production check) and `baseURL` defaults to `http://localhost:3000`, which makes `useSecureCookies=false` if `NEXTAUTH_URL` is ever missing. To verify in Phase 2.

### 1.4 Build and deploy configuration observations (to be graded in Phase 2)

- `apps/erp/next.config.ts:74` sets `typescript: { ignoreBuildErrors: true }`.
- `apps/{erp,superadmin}/vercel.json` `buildCommand` falls through to "success" if `bun run build` fails but `.next/BUILD_ID` and `.next/prerender-manifest.json` exist — a partially failed build can be deployed. Documented reason is a Bun teardown segfault, but the guard cannot tell a segfault from a real build failure.
- CSP on both apps (`next.config.ts`) is enforced unless `CSP_MODE=report-only`, but `script-src 'self' 'unsafe-inline'` and `style-src 'unsafe-inline'` remain, so the CSP does not stop injected inline scripts. HSTS (2 years, preload), `nosniff`, `Referrer-Policy`, `X-Frame-Options` (SAMEORIGIN on ERP, DENY on back office) are set. Paymob iframe allowed via `frame-src https://accept.paymob.com`.
- No CORS headers are set anywhere by the Next apps (same-origin only by default). Realtime CORS is `APP_ORIGIN` allow-list in production, loopback/LAN allowed in development.
- `ci.yml` uses fixed throwaway credentials for the ephemeral Postgres; not a leak (container-local).

---

## 2. Trust boundaries

```
 Browser (student / parent / teacher / assistant / center_admin / center_staff)
   │  same-origin fetch + better-auth cookie  (edura ERP host)
   ▼
 [B1] ERP route handlers ── requireSession / requireRole / centerStaff / delegated ── zod parseJson
   │                                                     │
   │ prisma (edura_app, NOBYPASSRLS)                     │ signed 60 s JWT
   ▼                                                     ▼
 [B2] Postgres ── RLS: center_id = current_center_id()   [B5] Socket.IO (apps/realtime) ── x-internal-secret ──► ERP /internal/chat-notify
        OR rls_bypass()                                    ▲
        + REVOKE UPDATE/DELETE on ledgers                  │ x-internal-secret (ERP → realtime /internal/*)
   ▲
   │ prisma (same role)
 [B3] Back-office route handlers ── withRole(super_admin | accountant) ── separate cookie + separate secret
   ▲  browser (superadmin host)              │ signed 60 s single-use handoff token (VIEW_AS_SECRET)
   │                                         ▼
   │                                    ERP /api/v1/auth/view-as/claim  (mints an ERP session with impersonated_by)
   │
 [B4] Third parties: Paymob (webhook in, checkout out — not yet implemented), Cloudinary (signed upload/destroy),
      SMTP, WhatsApp Cloud API, Web Push, Sentry, PostHog (proxied), Neon, Backblaze B2 (backups), Redis
 [B6] Machine callers: GitHub Actions cron (CRON_SECRET), gateway webhook (HMAC), realtime bridge (INTERNAL_API_SECRET)
 [B7] File uploads: images (≤4 MB, magic-byte + declared type → Cloudinary), PDFs (≤10 MB, %PDF magic → Cloudinary raw, signed time-limited URLs)
 [B8] Tokenised anonymous flows: invite/claim, walk-in onboarding, guardian email verification, password reset, student card QR (signed, mints nothing)
```

Key facts about each boundary that the deep audit builds on:

- **B1 — every ERP handler guards itself.** There is no auth middleware. Guards used: `withRole`/`requireRole` (role allow-list; superadmin's variant auto-passes `super_admin`, ERP's does not), `centerStaff(handler, {allow})` (center_admin or a linked `center_staff` row, re-keys the acting user to the center; accountant sub-role is read-only), `delegated`/`delegatedWithCenter` (teacher or their single active assistant; audit row per mutating call), plain `requireSession` (40 routes — any role; those must do their own ownership checks and are a Phase 2 focus).
- **B2 — RLS is tenant isolation for centers only.** `scopedDb()` (`packages/server-core/src/db/scope.ts:13`) uses `withTenant(centerId)` **only when the session role is `center_admin`**; every other role, and every `platformDb()` call, runs `set_config('app.bypass_rls','on')`. So for students, parents, teachers, staff-as-center and the whole back office, row isolation is entirely the service layer's `where` clauses. 15 tables carry a `tenant_isolation` policy (`centers`, `subscriptions`, `session_settlements`, `center_wallet_ledger`, `collaboration_requests`, `teacher_agreements`, `center_shifts`, `center_staff`, `center_stages`, `conversations`, `conversation_groups`, `team_notes`, `external_teacher_settlements`, `teacher_system_status_changes`, `blacklist_cascade_actions`); catalog tables are read-public/write-bypass. `UPDATE/DELETE` is revoked from `edura_app` on `transactions`, `audit_logs`, `points_ledger`, `session_settlements`, `external_teacher_settlements`, `teacher_system_status_changes`; `DELETE` on `invoices`, `payouts`, `blacklist_cascade_actions`. **Not revoked:** `payments`, `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger`, `payment_intents`, `subscriptions`, `centers.wallet_balance` — those are mutable by the app role and are protected only by application code plus CHECK constraints.
- **B3 — two auth instances, one `users` table.** `login-policy.ts` maps each role to exactly one app; the back office seals the raw better-auth admin endpoints (`SEALED_ADMIN_PATHS`) and only exposes audited equivalents. `withRole` in the back office lets `super_admin` through any role list, so accountant-only routes are super_admin-reachable by design.
- **B4/B6 — machine secrets are compared with `secretEquals` (SHA-256 then `timingSafeEqual`).** Cron requires `CRON_SECRET` set (fails closed). Webhook HMAC arrives in the **query string** (`?hmac=`), which is the Paymob convention, and the mock driver signs the raw body with `PAYMOB_HMAC_SECRET`.
- **B5 — realtime trusts the JWT claims (`role`, `centerId`, `name`) as minted by the ERP**, then performs its own conversation-policy checks in `@repo/database/chat` under `chatDb(user.id, …)`.

---

## 3. Endpoint inventory

**Totals:** 429 HTTP route files (238 ERP, 191 back office). Guard usage: `withRole` 182, `requireRole` 94, `centerStaff` 52, `delegated`/`delegatedWithCenter` 29, bare `requireSession` 40, explicit `withRateLimit` 34, public (no session) 8. Mutating routes with no request-body schema: 46 (most are action endpoints with no body — listed so Phase 2 can confirm each one ignores its body). Routes reading `searchParams` without a zod schema: 118 (mostly pagination/filters; Phase 2 checks for unbounded `limit`, injection into `orderBy`, and ID filters that widen reach).

Columns: **Auth** = guard detected in the handler file; **Roles** = literal roles passed to the guard (`center:RECEPTION|MANAGER|ACCOUNTANT` = the center-staff sub-roles allowed alongside `center_admin`; `teacher|assistant` = the delegation wrapper); **Validation** = body/query parsing detected (`query:unvalidated` = `searchParams` read without a schema; **NONE** = mutating method with no body parsing at all); **Notes** = `platformDb` (RLS bypassed), `scopedDb` (tenant RLS when center_admin), `rawSQL`.

### 3.1 HTTP routes (both Next apps)

| # | App | Methods | Path | Handler | Auth | Roles | Validation | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | erp | GET,POST | `/api/auth/[...all]` | erp…/api/auth/[...all] | better-auth (own rate limit) | - | **NONE** | no-withErrors,platformDb |
| 2 | erp | GET,HEAD | `/api/health` | erp…/api/health | **PUBLIC (no auth)** | - | query:unvalidated | no-withErrors |
| 3 | erp | GET | `/api/v1/%5Fping` | erp…/api/v1/%5Fping | **PUBLIC (no auth)** | - | n/a (GET) | rawSQL |
| 4 | erp | DELETE | `/api/v1/affiliations/[id]` | erp…/api/v1/affiliations/[id] | delegated | teacher | assistant | NONE! | dynamic,no-withErrors,scopedDb |
| 5 | erp | POST | `/api/v1/affiliations/[id]/accept` | erp…/api/v1/affiliations/[id]/accept | delegated | teacher | assistant | NONE! | dynamic,no-withErrors,scopedDb |
| 6 | erp | POST | `/api/v1/affiliations/[id]/decline` | erp…/api/v1/affiliations/[id]/decline | delegated | teacher | assistant | NONE! | dynamic,no-withErrors,scopedDb |
| 7 | erp | PATCH | `/api/v1/attendance/[id]` | erp…/api/v1/attendance/[id] | requireRole | center_admin | parseJson | - |
| 8 | erp | POST | `/api/v1/auth/invite/accept` | erp…/api/v1/auth/invite/accept | rateLimit | - | parseJson | platformDb |
| 9 | erp | POST | `/api/v1/auth/password/forgot` | erp…/api/v1/auth/password/forgot | rateLimit | - | parseJson | - |
| 10 | erp | POST | `/api/v1/auth/password/reset` | erp…/api/v1/auth/password/reset | rateLimit | - | parseJson | - |
| 11 | erp | POST | `/api/v1/auth/register/center` | erp…/api/v1/auth/register/center | rateLimit | - | parseJson | platformDb |
| 12 | erp | POST | `/api/v1/auth/register/parent` | erp…/api/v1/auth/register/parent | rateLimit | - | parseJson | - |
| 13 | erp | POST | `/api/v1/auth/register/student` | erp…/api/v1/auth/register/student | rateLimit | - | parseJson | - |
| 14 | erp | POST | `/api/v1/auth/register/teacher` | erp…/api/v1/auth/register/teacher | rateLimit | - | parseJson | - |
| 15 | erp | POST | `/api/v1/auth/view-as/claim` | erp…/api/v1/auth/view-as/claim | **PUBLIC (no auth)** | - | formData | no-withErrors |
| 16 | erp | POST | `/api/v1/auth/view-as/stop` | erp…/api/v1/auth/view-as/stop | session(optional) | - | **NONE** | no-withErrors |
| 17 | erp | GET | `/api/v1/catalog/subjects` | erp…/api/v1/catalog/subjects | requireSession | - | query:unvalidated | platformDb |
| 18 | erp | GET | `/api/v1/catalog/tree` | erp…/api/v1/catalog/tree | requireSession | - | n/a (GET) | - |
| 19 | erp | GET | `/api/v1/center/audit-logs` | erp…/api/v1/center/audit-logs | requireRole | center_admin | query:unvalidated | - |
| 20 | erp | GET | `/api/v1/center/audit-logs/actors` | erp…/api/v1/center/audit-logs/actors | requireRole | center_admin | n/a (GET) | - |
| 21 | erp | GET,POST | `/api/v1/center/blacklist` | erp…/api/v1/center/blacklist | requireRole | center_admin | parseJson | - |
| 22 | erp | DELETE | `/api/v1/center/blacklist/[id]` | erp…/api/v1/center/blacklist/[id] | requireRole | center_admin | parseJson | - |
| 23 | erp | POST | `/api/v1/center/checkin` | erp…/api/v1/center/checkin | centerStaff | - | parseJson | no-withErrors |
| 24 | erp | GET | `/api/v1/center/checkin/lookup` | erp…/api/v1/center/checkin/lookup | centerStaff | - | query:unvalidated | no-withErrors |
| 25 | erp | GET | `/api/v1/center/checkin/suggest` | erp…/api/v1/center/checkin/suggest | centerStaff | - | query:unvalidated | no-withErrors |
| 26 | erp | GET | `/api/v1/center/counter/roster` | erp…/api/v1/center/counter/roster | centerStaff | - | query:unvalidated | no-withErrors |
| 27 | erp | GET | `/api/v1/center/counter/sessions` | erp…/api/v1/center/counter/sessions | centerStaff | - | query:unvalidated | no-withErrors |
| 28 | erp | GET | `/api/v1/center/counter/teachers` | erp…/api/v1/center/counter/teachers | centerStaff | - | query:unvalidated | no-withErrors |
| 29 | erp | GET | `/api/v1/center/credit` | erp…/api/v1/center/credit | requireRole | center_admin | n/a (GET) | - |
| 30 | erp | POST | `/api/v1/center/credit/topup` | erp…/api/v1/center/credit/topup | requireRole | center_admin | parseJson | - |
| 31 | erp | GET,POST | `/api/v1/center/external-teachers` | erp…/api/v1/center/external-teachers | centerStaff+requireRole+centerActor | center_admin | parseJson+query:unvalidated | - |
| 32 | erp | GET,PATCH,DELETE | `/api/v1/center/external-teachers/[teacherId]` | erp…/api/v1/center/external-teachers/[teacherId] | centerStaff+requireRole+centerActor | center_admin | parseJson | - |
| 33 | erp | POST | `/api/v1/center/external-teachers/[teacherId]/convert` | erp…/api/v1/center/external-teachers/[teacherId]/convert | requireRole+centerActor | center_admin | parseJson | - |
| 34 | erp | GET,POST | `/api/v1/center/external-teachers/[teacherId]/grades` | erp…/api/v1/center/external-teachers/[teacherId]/grades | centerStaff | - | parseJson+query:unvalidated | no-withErrors |
| 35 | erp | PUT | `/api/v1/center/external-teachers/[teacherId]/grades/[gradeId]/scores` | erp…/api/v1/center/external-teachers/[teacherId]/grades/[gradeId]/scores | centerStaff | - | parseJson | no-withErrors |
| 36 | erp | POST | `/api/v1/center/external-teachers/[teacherId]/invite` | erp…/api/v1/center/external-teachers/[teacherId]/invite | requireRole+centerActor | center_admin | parseJson | - |
| 37 | erp | POST | `/api/v1/center/external-teachers/[teacherId]/restore` | erp…/api/v1/center/external-teachers/[teacherId]/restore | requireRole+centerActor | center_admin | **NONE** | - |
| 38 | erp | GET,POST | `/api/v1/center/external-teachers/[teacherId]/settlements` | erp…/api/v1/center/external-teachers/[teacherId]/settlements | centerStaff+requireRole+centerActor | center_admin | parseJson | - |
| 39 | erp | GET | `/api/v1/center/external-teachers/[teacherId]/statement` | erp…/api/v1/center/external-teachers/[teacherId]/statement | centerStaff | - | query:unvalidated | no-withErrors |
| 40 | erp | GET,POST | `/api/v1/center/external-teachers/[teacherId]/students` | erp…/api/v1/center/external-teachers/[teacherId]/students | centerStaff | - | parseJson | no-withErrors |
| 41 | erp | POST | `/api/v1/center/external-teachers/[teacherId]/students/enroll` | erp…/api/v1/center/external-teachers/[teacherId]/students/enroll | centerStaff | - | parseJson | no-withErrors |
| 42 | erp | POST | `/api/v1/center/external-teachers/[teacherId]/students/lookup` | erp…/api/v1/center/external-teachers/[teacherId]/students/lookup | centerStaff | - | parseJson | no-withErrors |
| 43 | erp | GET | `/api/v1/center/external-teachers/balances` | erp…/api/v1/center/external-teachers/balances | centerStaff | - | n/a (GET) | no-withErrors |
| 44 | erp | GET | `/api/v1/center/external-teachers/gaps` | erp…/api/v1/center/external-teachers/gaps | centerStaff | - | query:unvalidated | no-withErrors |
| 45 | erp | GET,POST | `/api/v1/center/shifts` | erp…/api/v1/center/shifts | centerStaff | - | parseJson+query:unvalidated | no-withErrors |
| 46 | erp | GET | `/api/v1/center/shifts/[id]` | erp…/api/v1/center/shifts/[id] | centerStaff | - | n/a (GET) | no-withErrors |
| 47 | erp | POST | `/api/v1/center/shifts/[id]/close` | erp…/api/v1/center/shifts/[id]/close | centerStaff | - | parseJson | no-withErrors |
| 48 | erp | GET | `/api/v1/center/shifts/current` | erp…/api/v1/center/shifts/current | centerStaff | - | n/a (GET) | no-withErrors |
| 49 | erp | GET,POST | `/api/v1/center/staff` | erp…/api/v1/center/staff | requireRole | center_admin | parseJson | - |
| 50 | erp | PATCH,DELETE | `/api/v1/center/staff/[id]` | erp…/api/v1/center/staff/[id] | requireRole | center_admin | parseJson | - |
| 51 | erp | POST | `/api/v1/center/staff/[id]/invite` | erp…/api/v1/center/staff/[id]/invite | requireRole+rateLimit | center_admin | parseJson | - |
| 52 | erp | GET | `/api/v1/center/staff/me` | erp…/api/v1/center/staff/me | requireRole | center_staff | n/a (GET) | - |
| 53 | erp | GET,POST | `/api/v1/center/students/[id]/guardian-contact` | erp…/api/v1/center/students/[id]/guardian-contact | centerStaff+rateLimit | - | parseJson | platformDb |
| 54 | erp | POST | `/api/v1/center/students/import` | erp…/api/v1/center/students/import | centerStaff+rateLimit | - | parseJson | - |
| 55 | erp | GET,POST | `/api/v1/center/subscriptions` | erp…/api/v1/center/subscriptions | centerStaff | - | parseJson+query:unvalidated | no-withErrors,scopedDb |
| 56 | erp | GET,POST | `/api/v1/center/teacher-agreements` | erp…/api/v1/center/teacher-agreements | requireRole | center_admin | parseJson+query:unvalidated | - |
| 57 | erp | POST | `/api/v1/center/temp-students` | erp…/api/v1/center/temp-students | centerStaff | - | parseJson | no-withErrors |
| 58 | erp | POST | `/api/v1/center/walk-in` | erp…/api/v1/center/walk-in | centerStaff+rateLimit | - | parseJson | - |
| 59 | erp | POST | `/api/v1/center/walk-in/resend` | erp…/api/v1/center/walk-in/resend | centerStaff+rateLimit | - | parseJson | - |
| 60 | erp | GET | `/api/v1/center/wallet` | erp…/api/v1/center/wallet | centerStaff | - | n/a (GET) | no-withErrors |
| 61 | erp | POST | `/api/v1/center/wallet-topup` | erp…/api/v1/center/wallet-topup | centerStaff | - | parseJson | no-withErrors |
| 62 | erp | POST | `/api/v1/center/wallet/payout-request` | erp…/api/v1/center/wallet/payout-request | requireRole | center_admin | parseJson | - |
| 63 | erp | GET | `/api/v1/center/wallet/payouts` | erp…/api/v1/center/wallet/payouts | centerStaff | - | n/a (GET) | no-withErrors |
| 64 | erp | POST | `/api/v1/center/wallet/payouts/[id]/cancel` | erp…/api/v1/center/wallet/payouts/[id]/cancel | requireRole | center_admin | **NONE** | - |
| 65 | erp | GET | `/api/v1/center/wallet/transactions` | erp…/api/v1/center/wallet/transactions | centerStaff | - | query:unvalidated | no-withErrors |
| 66 | erp | GET | `/api/v1/centers/[id]` | erp…/api/v1/centers/[id] | **PUBLIC (no auth)** | - | n/a (GET) | platformDb |
| 67 | erp | GET | `/api/v1/centers/[id]/rooms` | erp…/api/v1/centers/[id]/rooms | requireRole | teacher,assistant | n/a (GET) | platformDb |
| 68 | erp | GET,PATCH | `/api/v1/centers/me` | erp…/api/v1/centers/me | requireRole | center_admin | parseJson | scopedDb |
| 69 | erp | GET | `/api/v1/centers/me/admins` | erp…/api/v1/centers/me/admins | requireRole | center_admin | n/a (GET) | - |
| 70 | erp | DELETE | `/api/v1/centers/me/admins/[userId]` | erp…/api/v1/centers/me/admins/[userId] | requireRole | center_admin | **NONE** | - |
| 71 | erp | POST | `/api/v1/centers/me/admins/invite` | erp…/api/v1/centers/me/admins/invite | requireRole | center_admin | parseJson | - |
| 72 | erp | GET,POST,DELETE | `/api/v1/centers/me/logo` | erp…/api/v1/centers/me/logo | centerStaff | - | formData | no-withErrors |
| 73 | erp | GET,POST | `/api/v1/collaboration-requests` | erp…/api/v1/collaboration-requests | delegatedWithCenter | teacher | assistant | parseJson+raw-searchParams | dynamic,no-withErrors |
| 74 | erp | POST | `/api/v1/collaboration-requests/[id]/accept` | erp…/api/v1/collaboration-requests/[id]/accept | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 75 | erp | POST | `/api/v1/collaboration-requests/[id]/cancel` | erp…/api/v1/collaboration-requests/[id]/cancel | delegatedWithCenter | teacher | assistant | NONE! | dynamic,no-withErrors |
| 76 | erp | POST | `/api/v1/collaboration-requests/[id]/reject` | erp…/api/v1/collaboration-requests/[id]/reject | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 77 | erp | POST | `/api/v1/contact` | erp…/api/v1/contact | rateLimit | - | parseJson | - |
| 78 | erp | GET,POST | `/api/v1/courses` | erp…/api/v1/courses | requireRole+session(optional) | center_admin | parseJson+query:unvalidated | scopedDb |
| 79 | erp | GET,PATCH | `/api/v1/courses/[id]` | erp…/api/v1/courses/[id] | requireRole | center_admin,teacher | parseJson | platformDb |
| 80 | erp | POST | `/api/v1/courses/[id]/cancel` | erp…/api/v1/courses/[id]/cancel | requireRole | center_admin | parseJson | - |
| 81 | erp | POST | `/api/v1/courses/[id]/reassign-teacher` | erp…/api/v1/courses/[id]/reassign-teacher | requireRole | center_admin | parseJson | - |
| 82 | erp | POST | `/api/v1/cron/[job]` | erp…/api/v1/cron/[job] | CRON_SECRET | - | **NONE** | - |
| 83 | erp | GET | `/api/v1/dashboards/admin` | erp…/api/v1/dashboards/admin | centerStaff | - | query:unvalidated | no-withErrors |
| 84 | erp | GET | `/api/v1/dashboards/admin/checklist` | erp…/api/v1/dashboards/admin/checklist | centerStaff | - | n/a (GET) | no-withErrors |
| 85 | erp | GET | `/api/v1/dashboards/student` | erp…/api/v1/dashboards/student | requireRole | student | n/a (GET) | scopedDb |
| 86 | erp | GET | `/api/v1/dashboards/teacher` | erp…/api/v1/dashboards/teacher | delegated | teacher | assistant | raw-searchParams | dynamic,no-withErrors |
| 87 | erp | GET | `/api/v1/deletion-requests` | erp…/api/v1/deletion-requests | requireRole | center_admin | query:unvalidated | - |
| 88 | erp | POST | `/api/v1/deletion-requests/[id]/approve` | erp…/api/v1/deletion-requests/[id]/approve | requireRole | center_admin | **NONE** | - |
| 89 | erp | POST | `/api/v1/deletion-requests/[id]/reject` | erp…/api/v1/deletion-requests/[id]/reject | requireRole | center_admin | parseJson | - |
| 90 | erp | GET,POST | `/api/v1/door-checkin` | erp…/api/v1/door-checkin | requireRole | assistant,teacher | parseJson+query:unvalidated | - |
| 91 | erp | GET,POST | `/api/v1/enrollment-requests` | erp…/api/v1/enrollment-requests | requireRole+requireSession | student | parseJson+query:unvalidated | platformDb,scopedDb |
| 92 | erp | DELETE | `/api/v1/enrollment-requests/[id]` | erp…/api/v1/enrollment-requests/[id] | requireRole | student | **NONE** | scopedDb |
| 93 | erp | POST | `/api/v1/enrollment-requests/[id]/approve` | erp…/api/v1/enrollment-requests/[id]/approve | requireRole | center_admin | **NONE** | - |
| 94 | erp | POST | `/api/v1/enrollment-requests/[id]/decline` | erp…/api/v1/enrollment-requests/[id]/decline | requireRole | center_admin | parseJson | - |
| 95 | erp | GET,POST | `/api/v1/enrollments` | erp…/api/v1/enrollments | requireRole+requireSession | center_admin | parseJson+query:unvalidated | scopedDb |
| 96 | erp | DELETE | `/api/v1/enrollments/[id]` | erp…/api/v1/enrollments/[id] | requireRole | center_admin | **NONE** | - |
| 97 | erp | GET,POST | `/api/v1/expenses` | erp…/api/v1/expenses | centerStaff+requireRole | center_admin | parseJson+query:unvalidated | - |
| 98 | erp | PATCH,DELETE | `/api/v1/expenses/[id]` | erp…/api/v1/expenses/[id] | requireRole | center_admin | parseJson | - |
| 99 | erp | GET,POST | `/api/v1/grades` | erp…/api/v1/grades | delegated+requireSession | teacher | assistant | parseJson+raw-searchParams | dynamic |
| 100 | erp | GET,PATCH,DELETE | `/api/v1/grades/[id]` | erp…/api/v1/grades/[id] | delegated+requireSession | teacher | assistant | parseJson | dynamic |
| 101 | erp | PUT | `/api/v1/grades/[id]/scores` | erp…/api/v1/grades/[id]/scores | delegated | teacher | assistant | parseJson | dynamic,no-withErrors |
| 102 | erp | POST | `/api/v1/guardian/verify` | erp…/api/v1/guardian/verify | rateLimit | - | parseJson | - |
| 103 | erp | POST | `/api/v1/internal/chat-notify` | erp…/api/v1/internal/chat-notify | INTERNAL_SECRET | - | parseJson | platformDb |
| 104 | erp | GET,POST | `/api/v1/materials` | erp…/api/v1/materials | delegated+requireSession | teacher | assistant | raw-searchParams+formData | dynamic |
| 105 | erp | PATCH,DELETE | `/api/v1/materials/[id]` | erp…/api/v1/materials/[id] | delegated | teacher | assistant | formData | dynamic,no-withErrors |
| 106 | erp | GET | `/api/v1/materials/[id]/download` | erp…/api/v1/materials/[id]/download | requireSession | - | n/a (GET) | - |
| 107 | erp | GET,PATCH | `/api/v1/me` | erp…/api/v1/me | requireSession+centerActor+teacherActor | - | parseJson | platformDb,scopedDb |
| 108 | erp | GET | `/api/v1/me/affiliations` | erp…/api/v1/me/affiliations | delegated | teacher | assistant | n/a(GET) | dynamic,no-withErrors,scopedDb |
| 109 | erp | GET | `/api/v1/me/attendance` | erp…/api/v1/me/attendance | requireSession | - | query:unvalidated | scopedDb |
| 110 | erp | GET | `/api/v1/me/children` | erp…/api/v1/me/children | requireRole | parent | n/a (GET) | - |
| 111 | erp | POST | `/api/v1/me/credentials` | erp…/api/v1/me/credentials | requireSession+rateLimit | - | parseJson | platformDb |
| 112 | erp | GET,POST | `/api/v1/me/data-rights/deletion` | erp…/api/v1/me/data-rights/deletion | requireSession | - | parseJson+query:unvalidated | - |
| 113 | erp | DELETE | `/api/v1/me/data-rights/deletion/[id]` | erp…/api/v1/me/data-rights/deletion/[id] | requireSession | - | **NONE** | - |
| 114 | erp | GET,POST | `/api/v1/me/data-rights/exports` | erp…/api/v1/me/data-rights/exports | requireSession | - | parseJson+query:unvalidated | - |
| 115 | erp | GET,DELETE | `/api/v1/me/data-rights/exports/[id]` | erp…/api/v1/me/data-rights/exports/[id] | requireSession | - | **NONE** | - |
| 116 | erp | POST | `/api/v1/me/delete-request` | erp…/api/v1/me/delete-request | requireSession | - | parseJson | scopedDb |
| 117 | erp | POST | `/api/v1/me/device-tokens` | erp…/api/v1/me/device-tokens | requireSession | - | parseJson | - |
| 118 | erp | DELETE | `/api/v1/me/device-tokens/[token]` | erp…/api/v1/me/device-tokens/[token] | requireSession | - | **NONE** | scopedDb |
| 119 | erp | POST | `/api/v1/me/email` | erp…/api/v1/me/email | requireSession+rateLimit | - | parseJson | platformDb |
| 120 | erp | GET | `/api/v1/me/family-code` | erp…/api/v1/me/family-code | requireRole | student | n/a (GET) | - |
| 121 | erp | POST | `/api/v1/me/family-code/rotate` | erp…/api/v1/me/family-code/rotate | requireRole | student | **NONE** | - |
| 122 | erp | GET,POST | `/api/v1/me/guardian-contact` | erp…/api/v1/me/guardian-contact | requireSession+rateLimit | - | parseJson+query:unvalidated | platformDb |
| 123 | erp | GET,POST | `/api/v1/me/guardian-verification` | erp…/api/v1/me/guardian-verification | requireRole+rateLimit | student | **NONE** | platformDb |
| 124 | erp | GET,POST,PATCH | `/api/v1/me/onboarding` | erp…/api/v1/me/onboarding | requireSession | - | parseJson | - |
| 125 | erp | GET,POST | `/api/v1/me/onboarding-email` | erp…/api/v1/me/onboarding-email | requireSession+rateLimit | - | query:unvalidated | - |
| 126 | erp | GET | `/api/v1/me/parent-wallet` | erp…/api/v1/me/parent-wallet | requireRole | parent | n/a (GET) | - |
| 127 | erp | GET | `/api/v1/me/parent-wallet/history` | erp…/api/v1/me/parent-wallet/history | requireRole | parent | query:unvalidated | - |
| 128 | erp | POST | `/api/v1/me/password` | erp…/api/v1/me/password | requireSession+rateLimit | - | parseJson | - |
| 129 | erp | GET | `/api/v1/me/points` | erp…/api/v1/me/points | requireRole | student | n/a (GET) | - |
| 130 | erp | GET | `/api/v1/me/points/history` | erp…/api/v1/me/points/history | requireRole | student | query:unvalidated | - |
| 131 | erp | GET,PATCH | `/api/v1/me/prefs` | erp…/api/v1/me/prefs | requireSession | - | parseJson | scopedDb |
| 132 | erp | GET | `/api/v1/me/profile-checklist` | erp…/api/v1/me/profile-checklist | requireSession | - | query:unvalidated | - |
| 133 | erp | POST,DELETE | `/api/v1/me/push-subscription` | erp…/api/v1/me/push-subscription | requireSession | - | parseJson | scopedDb |
| 134 | erp | POST | `/api/v1/me/roster/choice` | erp…/api/v1/me/roster/choice | requireRole | student | parseJson | platformDb |
| 135 | erp | GET | `/api/v1/me/student-card` | erp…/api/v1/me/student-card | requireSession | - | query:unvalidated | - |
| 136 | erp | POST | `/api/v1/me/subject-requests` | erp…/api/v1/me/subject-requests | requireRole | teacher | parseJson | - |
| 137 | erp | GET | `/api/v1/me/subjects` | erp…/api/v1/me/subjects | requireRole+session(optional) | teacher,assistant | n/a (GET) | platformDb |
| 138 | erp | GET | `/api/v1/me/subscriptions` | erp…/api/v1/me/subscriptions | requireRole | student,parent | query:unvalidated | - |
| 139 | erp | GET | `/api/v1/me/unread-counts` | erp…/api/v1/me/unread-counts | requireSession | - | n/a (GET) | - |
| 140 | erp | GET | `/api/v1/me/wallet` | erp…/api/v1/me/wallet | requireRole | student,parent | query:unvalidated | - |
| 141 | erp | GET | `/api/v1/me/wallet/history` | erp…/api/v1/me/wallet/history | requireRole | student,parent | query:unvalidated | - |
| 142 | erp | POST | `/api/v1/messages` | erp…/api/v1/messages | requireSession | - | parseJson | - |
| 143 | erp | GET,POST,DELETE | `/api/v1/messages/blocks` | erp…/api/v1/messages/blocks | requireSession | - | parseJson | - |
| 144 | erp | GET | `/api/v1/messages/contacts` | erp…/api/v1/messages/contacts | requireSession | - | query:unvalidated | - |
| 145 | erp | GET,POST | `/api/v1/messages/conversations` | erp…/api/v1/messages/conversations | requireSession | - | parseJson+query:unvalidated | - |
| 146 | erp | GET | `/api/v1/messages/conversations/[id]` | erp…/api/v1/messages/conversations/[id] | requireSession | - | query:unvalidated | - |
| 147 | erp | POST | `/api/v1/messages/conversations/[id]/read` | erp…/api/v1/messages/conversations/[id]/read | requireSession | - | **NONE** | - |
| 148 | erp | GET,POST | `/api/v1/messages/groups` | erp…/api/v1/messages/groups | requireSession | - | parseJson | - |
| 149 | erp | GET,POST | `/api/v1/messages/groups/[id]` | erp…/api/v1/messages/groups/[id] | requireSession | - | parseJson+query:unvalidated | - |
| 150 | erp | POST | `/api/v1/messages/groups/[id]/mute` | erp…/api/v1/messages/groups/[id]/mute | requireSession | - | parseJson | - |
| 151 | erp | POST | `/api/v1/messages/groups/[id]/read` | erp…/api/v1/messages/groups/[id]/read | requireSession | - | **NONE** | - |
| 152 | erp | POST | `/api/v1/messages/reports` | erp…/api/v1/messages/reports | requireSession | - | parseJson | - |
| 153 | erp | GET | `/api/v1/notifications` | erp…/api/v1/notifications | requireSession | - | parsePageLimit | scopedDb |
| 154 | erp | POST | `/api/v1/notifications/[id]/read` | erp…/api/v1/notifications/[id]/read | requireSession | - | **NONE** | scopedDb |
| 155 | erp | POST | `/api/v1/notifications/broadcast` | erp…/api/v1/notifications/broadcast | requireRole+centerScope | center_admin | parseJson | scopedDb |
| 156 | erp | POST | `/api/v1/notifications/read-all` | erp…/api/v1/notifications/read-all | requireSession | - | **NONE** | scopedDb |
| 157 | erp | GET,POST | `/api/v1/parent-links` | erp…/api/v1/parent-links | requireRole | parent,student | parseJson | - |
| 158 | erp | DELETE | `/api/v1/parent-links/[id]` | erp…/api/v1/parent-links/[id] | requireRole | parent,student | **NONE** | - |
| 159 | erp | POST | `/api/v1/parent-links/[id]/approve` | erp…/api/v1/parent-links/[id]/approve | requireRole | parent,student | **NONE** | - |
| 160 | erp | POST | `/api/v1/parent-links/[id]/reject` | erp…/api/v1/parent-links/[id]/reject | requireRole | parent,student | **NONE** | - |
| 161 | erp | GET | `/api/v1/parent/oversight/children` | erp…/api/v1/parent/oversight/children | requireRole | parent | n/a (GET) | - |
| 162 | erp | GET | `/api/v1/parent/oversight/children/[studentId]/conversations` | erp…/api/v1/parent/oversight/children/[studentId]/conversations | requireRole | parent | n/a (GET) | - |
| 163 | erp | GET | `/api/v1/parent/oversight/children/[studentId]/conversations/[id]` | erp…/api/v1/parent/oversight/children/[studentId]/conversations/[id] | requireRole | parent | query:unvalidated | - |
| 164 | erp | GET,POST | `/api/v1/payments` | erp…/api/v1/payments | requireRole+requireSession | center_admin | parseJson+query:unvalidated | - |
| 165 | erp | GET | `/api/v1/payments/[id]` | erp…/api/v1/payments/[id] | requireSession | - | n/a (GET) | - |
| 166 | erp | GET | `/api/v1/payments/[id]/receipt` | erp…/api/v1/payments/[id]/receipt | requireSession | - | n/a (GET) | - |
| 167 | erp | POST | `/api/v1/payments/[id]/refund` | erp…/api/v1/payments/[id]/refund | requireRole | center_admin | parseJson | - |
| 168 | erp | POST | `/api/v1/payments/[id]/refund/confirm` | erp…/api/v1/payments/[id]/refund/confirm | requireRole | center_admin | parseJson | - |
| 169 | erp | GET | `/api/v1/payments/availability` | erp…/api/v1/payments/availability | **PUBLIC (no auth)** | - | n/a (GET) | - |
| 170 | erp | POST | `/api/v1/payments/initiate` | erp…/api/v1/payments/initiate | requireRole+rateLimit | student | parseJson | - |
| 171 | erp | GET | `/api/v1/payments/intents/[id]` | erp…/api/v1/payments/intents/[id] | requireRole | student,parent | n/a (GET) | - |
| 172 | erp | POST | `/api/v1/payments/intents/[id]/mock-complete` | erp…/api/v1/payments/intents/[id]/mock-complete | requireRole+HMAC | student,parent,center_admin | parseJson+zod.parse | platformDb |
| 173 | erp | POST | `/api/v1/payments/parent-wallet-topup/initiate` | erp…/api/v1/payments/parent-wallet-topup/initiate | requireRole+rateLimit | parent | parseJson | - |
| 174 | erp | POST | `/api/v1/payments/paymob/webhook` | erp…/api/v1/payments/paymob/webhook | rateLimit | - | zod.parse | - |
| 175 | erp | GET | `/api/v1/payments/refunds/unconfirmed` | erp…/api/v1/payments/refunds/unconfirmed | requireRole | center_admin | n/a (GET) | - |
| 176 | erp | POST | `/api/v1/payments/wallet-topup/initiate` | erp…/api/v1/payments/wallet-topup/initiate | requireRole+rateLimit | student | parseJson | - |
| 177 | erp | GET | `/api/v1/realtime/token` | erp…/api/v1/realtime/token | requireSession | - | n/a (GET) | - |
| 178 | erp | GET | `/api/v1/reports/attendance-by-course` | erp…/api/v1/reports/attendance-by-course | centerStaff | - | parseOrThrow | no-withErrors |
| 179 | erp | GET | `/api/v1/reports/course-fill-rates` | erp…/api/v1/reports/course-fill-rates | centerStaff | - | n/a (GET) | no-withErrors |
| 180 | erp | GET | `/api/v1/reports/enrollment-funnel` | erp…/api/v1/reports/enrollment-funnel | centerStaff | - | parseOrThrow | no-withErrors |
| 181 | erp | GET | `/api/v1/reports/expenses` | erp…/api/v1/reports/expenses | centerStaff | - | query:unvalidated | no-withErrors |
| 182 | erp | GET | `/api/v1/reports/expenses-timeseries` | erp…/api/v1/reports/expenses-timeseries | centerStaff | - | parseOrThrow | no-withErrors |
| 183 | erp | GET | `/api/v1/reports/export` | erp…/api/v1/reports/export | centerStaff | - | query:unvalidated | no-withErrors |
| 184 | erp | GET | `/api/v1/reports/net-profit` | erp…/api/v1/reports/net-profit | centerStaff | - | query:unvalidated | no-withErrors |
| 185 | erp | GET | `/api/v1/reports/revenue` | erp…/api/v1/reports/revenue | centerStaff | - | query:unvalidated | no-withErrors |
| 186 | erp | GET | `/api/v1/reports/revenue-timeseries` | erp…/api/v1/reports/revenue-timeseries | centerStaff | - | parseOrThrow | no-withErrors |
| 187 | erp | GET,POST | `/api/v1/reviews` | erp…/api/v1/reviews | requireRole+requireSession | student | parseJson+query:unvalidated | - |
| 188 | erp | PATCH | `/api/v1/reviews/[id]` | erp…/api/v1/reviews/[id] | requireRole | student | parseJson | - |
| 189 | erp | GET | `/api/v1/reviews/eligible` | erp…/api/v1/reviews/eligible | requireRole | student | n/a (GET) | - |
| 190 | erp | GET,POST | `/api/v1/rooms` | erp…/api/v1/rooms | centerStaff | - | parseJson | no-withErrors,scopedDb |
| 191 | erp | PATCH,DELETE | `/api/v1/rooms/[id]` | erp…/api/v1/rooms/[id] | centerStaff+centerScope | - | parseJson | no-withErrors,scopedDb |
| 192 | erp | POST | `/api/v1/rooms/[id]/photos` | erp…/api/v1/rooms/[id]/photos | centerStaff | - | formData | no-withErrors |
| 193 | erp | GET | `/api/v1/rooms/per-student-availability` | erp…/api/v1/rooms/per-student-availability | centerStaff | - | n/a (GET) | no-withErrors,scopedDb |
| 194 | erp | GET,POST | `/api/v1/roster/students` | erp…/api/v1/roster/students | centerStaff | - | parseJson+query:unvalidated | no-withErrors |
| 195 | erp | GET,PATCH,DELETE | `/api/v1/roster/students/[studentId]` | erp…/api/v1/roster/students/[studentId] | centerStaff+requireRole | center_admin | parseJson | - |
| 196 | erp | POST | `/api/v1/roster/students/invite` | erp…/api/v1/roster/students/invite | centerStaff | - | parseJson | no-withErrors |
| 197 | erp | POST | `/api/v1/roster/students/lookup` | erp…/api/v1/roster/students/lookup | centerStaff+rateLimit | - | parseJson | - |
| 198 | erp | GET | `/api/v1/roster/teachers` | erp…/api/v1/roster/teachers | requireRole | center_admin | query:unvalidated | - |
| 199 | erp | DELETE | `/api/v1/roster/teachers/[teacherId]` | erp…/api/v1/roster/teachers/[teacherId] | requireRole | center_admin | **NONE** | - |
| 200 | erp | POST | `/api/v1/roster/teachers/invite` | erp…/api/v1/roster/teachers/invite | requireRole | center_admin | parseJson | - |
| 201 | erp | POST | `/api/v1/roster/teachers/lookup` | erp…/api/v1/roster/teachers/lookup | requireRole+rateLimit | center_admin | parseJson | - |
| 202 | erp | GET | `/api/v1/search` | erp…/api/v1/search | requireSession+centerActor | - | query:unvalidated | - |
| 203 | erp | GET | `/api/v1/search/centers` | erp…/api/v1/search/centers | rateLimit | - | query:unvalidated | - |
| 204 | erp | GET | `/api/v1/search/courses` | erp…/api/v1/search/courses | session(optional)+rateLimit | - | query:unvalidated | platformDb |
| 205 | erp | GET | `/api/v1/search/teachers` | erp…/api/v1/search/teachers | rateLimit | - | query:unvalidated | - |
| 206 | erp | POST | `/api/v1/security/csp-report` | erp…/api/v1/security/csp-report | rateLimit | - | **NONE** | - |
| 207 | erp | GET | `/api/v1/sessions` | erp…/api/v1/sessions | requireSession+centerActor | - | query:unvalidated | scopedDb |
| 208 | erp | GET | `/api/v1/sessions/[id]` | erp…/api/v1/sessions/[id] | requireSession | - | n/a (GET) | scopedDb |
| 209 | erp | GET,PUT | `/api/v1/sessions/[id]/attendance` | erp…/api/v1/sessions/[id]/attendance | delegatedWithCenter+requireSession+centerScope | teacher | assistant | parseJson | dynamic,scopedDb |
| 210 | erp | POST | `/api/v1/sessions/[id]/attendance/reopen` | erp…/api/v1/sessions/[id]/attendance/reopen | delegatedWithCenter | teacher | assistant | NONE! | dynamic,no-withErrors |
| 211 | erp | POST | `/api/v1/sessions/[id]/cancel` | erp…/api/v1/sessions/[id]/cancel | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 212 | erp | POST | `/api/v1/sessions/[id]/complete` | erp…/api/v1/sessions/[id]/complete | delegatedWithCenter | teacher | assistant | NONE! | dynamic,no-withErrors,platformDb |
| 213 | erp | POST | `/api/v1/sessions/[id]/postpone` | erp…/api/v1/sessions/[id]/postpone | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 214 | erp | GET | `/api/v1/sessions/[id]/settlement-preview` | erp…/api/v1/sessions/[id]/settlement-preview | delegatedWithCenter | teacher | assistant | n/a(GET) | dynamic,no-withErrors |
| 215 | erp | GET | `/api/v1/subjects` | erp…/api/v1/subjects | **PUBLIC (no auth)** | - | n/a (GET) | platformDb |
| 216 | erp | POST | `/api/v1/subscriptions/[id]/cancel` | erp…/api/v1/subscriptions/[id]/cancel | requireRole | student,parent | **NONE** | - |
| 217 | erp | POST | `/api/v1/subscriptions/checkout` | erp…/api/v1/subscriptions/checkout | requireRole+rateLimit | student,parent | parseJson | - |
| 218 | erp | GET,POST | `/api/v1/teacher/assistants` | erp…/api/v1/teacher/assistants | requireRole | teacher | parseJson | - |
| 219 | erp | DELETE | `/api/v1/teacher/assistants/[id]` | erp…/api/v1/teacher/assistants/[id] | requireRole | teacher | **NONE** | - |
| 220 | erp | POST | `/api/v1/teacher/assistants/[id]/invite` | erp…/api/v1/teacher/assistants/[id]/invite | requireRole+rateLimit | teacher | parseJson | - |
| 221 | erp | GET,PATCH | `/api/v1/teacher/attendance-mode` | erp…/api/v1/teacher/attendance-mode | delegated | teacher | assistant | parseJson | dynamic,no-withErrors,platformDb |
| 222 | erp | POST | `/api/v1/teacher/attendance/sync` | erp…/api/v1/teacher/attendance/sync | requireRole | teacher,assistant | parseJson | - |
| 223 | erp | GET,POST | `/api/v1/teacher/blacklist` | erp…/api/v1/teacher/blacklist | delegated | teacher | assistant | parseJson | dynamic,no-withErrors |
| 224 | erp | DELETE | `/api/v1/teacher/blacklist/[id]` | erp…/api/v1/teacher/blacklist/[id] | delegated | teacher | assistant | parseJson | dynamic,no-withErrors |
| 225 | erp | GET | `/api/v1/teacher/coverage` | erp…/api/v1/teacher/coverage | delegated | teacher | assistant | raw-searchParams | dynamic,no-withErrors |
| 226 | erp | POST | `/api/v1/teacher/temp-students` | erp…/api/v1/teacher/temp-students | delegated | teacher | assistant | parseJson | dynamic,no-withErrors |
| 227 | erp | GET | `/api/v1/teacher/wallet` | erp…/api/v1/teacher/wallet | requireRole | teacher | n/a (GET) | - |
| 228 | erp | POST | `/api/v1/teacher/wallet/payout-request` | erp…/api/v1/teacher/wallet/payout-request | requireRole | teacher | parseJson | - |
| 229 | erp | GET | `/api/v1/teacher/wallet/payouts` | erp…/api/v1/teacher/wallet/payouts | requireRole | teacher | n/a (GET) | - |
| 230 | erp | POST | `/api/v1/teacher/wallet/payouts/[id]/cancel` | erp…/api/v1/teacher/wallet/payouts/[id]/cancel | requireRole | teacher | **NONE** | - |
| 231 | erp | GET | `/api/v1/teacher/wallet/transactions` | erp…/api/v1/teacher/wallet/transactions | requireRole | teacher | query:unvalidated | - |
| 232 | erp | GET | `/api/v1/teachers/[teacherId]` | erp…/api/v1/teachers/[teacherId] | **PUBLIC (no auth)** | - | n/a (GET) | - |
| 233 | erp | GET,POST,DELETE | `/api/v1/teachers/me/photo` | erp…/api/v1/teachers/me/photo | requireRole | teacher | formData | scopedDb |
| 234 | erp | GET,POST | `/api/v1/team-notes` | erp…/api/v1/team-notes | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 235 | erp | PATCH,DELETE | `/api/v1/team-notes/[id]` | erp…/api/v1/team-notes/[id] | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 236 | erp | POST | `/api/v1/temp-students` | erp…/api/v1/temp-students | delegatedWithCenter | teacher | assistant | parseJson | dynamic,no-withErrors |
| 237 | erp | POST | `/api/v1/temp-students/[id]/send-invite` | erp…/api/v1/temp-students/[id]/send-invite | delegatedWithCenter | teacher | assistant | NONE! | dynamic,no-withErrors |
| 238 | erp | POST | `/api/v1/temp-students/claim` | erp…/api/v1/temp-students/claim | requireRole | student | parseJson | - |
| 239 | superadmin | GET,POST | `/api/auth/[...all]` | superadmin…/api/auth/[...all] | better-auth (own rate limit) | - | **NONE** | no-withErrors,platformDb |
| 240 | superadmin | GET,HEAD | `/api/health` | superadmin…/api/health | **PUBLIC (no auth)** | - | n/a (GET) | no-withErrors |
| 241 | superadmin | POST | `/api/v1/admin/accountants` | superadmin…/api/v1/admin/accountants | withRole | super_admin | parseJson | - |
| 242 | superadmin | GET | `/api/v1/admin/audit-logs` | superadmin…/api/v1/admin/audit-logs | withRole | super_admin | query:unvalidated | - |
| 243 | superadmin | GET | `/api/v1/admin/audit-logs/actions` | superadmin…/api/v1/admin/audit-logs/actions | withRole | super_admin | n/a (GET) | - |
| 244 | superadmin | GET | `/api/v1/admin/blacklist` | superadmin…/api/v1/admin/blacklist | withRole | super_admin | query:unvalidated | - |
| 245 | superadmin | POST | `/api/v1/admin/blacklist/[id]/remove` | superadmin…/api/v1/admin/blacklist/[id]/remove | withRole | super_admin | parseJson | - |
| 246 | superadmin | GET,POST | `/api/v1/admin/catalog/grade-levels` | superadmin…/api/v1/admin/catalog/grade-levels | withRole | super_admin | parseJson+query:unvalidated | - |
| 247 | superadmin | PATCH | `/api/v1/admin/catalog/grade-levels/[id]` | superadmin…/api/v1/admin/catalog/grade-levels/[id] | withRole | super_admin | parseJson | - |
| 248 | superadmin | POST | `/api/v1/admin/catalog/grade-tracks` | superadmin…/api/v1/admin/catalog/grade-tracks | withRole | super_admin | parseJson | - |
| 249 | superadmin | DELETE | `/api/v1/admin/catalog/grade-tracks/[id]` | superadmin…/api/v1/admin/catalog/grade-tracks/[id] | withRole | super_admin | **NONE** | - |
| 250 | superadmin | GET,POST | `/api/v1/admin/catalog/offerings` | superadmin…/api/v1/admin/catalog/offerings | withRole | super_admin | parseJson+query:unvalidated | - |
| 251 | superadmin | PATCH,DELETE | `/api/v1/admin/catalog/offerings/[id]` | superadmin…/api/v1/admin/catalog/offerings/[id] | withRole | super_admin | parseJson | - |
| 252 | superadmin | GET,POST | `/api/v1/admin/catalog/stages` | superadmin…/api/v1/admin/catalog/stages | withRole | super_admin | parseJson+query:unvalidated | - |
| 253 | superadmin | PATCH | `/api/v1/admin/catalog/stages/[id]` | superadmin…/api/v1/admin/catalog/stages/[id] | withRole | super_admin | parseJson | - |
| 254 | superadmin | GET | `/api/v1/admin/catalog/subject-requests` | superadmin…/api/v1/admin/catalog/subject-requests | withRole | super_admin | query:unvalidated | - |
| 255 | superadmin | POST | `/api/v1/admin/catalog/subject-requests/[id]/approve` | superadmin…/api/v1/admin/catalog/subject-requests/[id]/approve | withRole | super_admin | parseJson | - |
| 256 | superadmin | POST | `/api/v1/admin/catalog/subject-requests/[id]/reject` | superadmin…/api/v1/admin/catalog/subject-requests/[id]/reject | withRole | super_admin | parseJson | - |
| 257 | superadmin | GET,POST | `/api/v1/admin/catalog/subjects` | superadmin…/api/v1/admin/catalog/subjects | withRole | super_admin | parseJson | - |
| 258 | superadmin | PATCH | `/api/v1/admin/catalog/subjects/[id]` | superadmin…/api/v1/admin/catalog/subjects/[id] | withRole | super_admin | parseJson | - |
| 259 | superadmin | GET,POST | `/api/v1/admin/catalog/systems` | superadmin…/api/v1/admin/catalog/systems | withRole | super_admin | parseJson | - |
| 260 | superadmin | PATCH | `/api/v1/admin/catalog/systems/[id]` | superadmin…/api/v1/admin/catalog/systems/[id] | withRole | super_admin | parseJson | - |
| 261 | superadmin | GET,POST | `/api/v1/admin/catalog/tracks` | superadmin…/api/v1/admin/catalog/tracks | withRole | super_admin | parseJson+query:unvalidated | - |
| 262 | superadmin | PATCH | `/api/v1/admin/catalog/tracks/[id]` | superadmin…/api/v1/admin/catalog/tracks/[id] | withRole | super_admin | parseJson | - |
| 263 | superadmin | GET | `/api/v1/admin/centers` | superadmin…/api/v1/admin/centers | withRole | super_admin | query:unvalidated | - |
| 264 | superadmin | GET,PATCH | `/api/v1/admin/centers/[id]` | superadmin…/api/v1/admin/centers/[id] | withRole | super_admin | parseJson | - |
| 265 | superadmin | GET | `/api/v1/admin/centers/[id]/admins` | superadmin…/api/v1/admin/centers/[id]/admins | withRole | super_admin | n/a (GET) | - |
| 266 | superadmin | DELETE | `/api/v1/admin/centers/[id]/admins/[userId]` | superadmin…/api/v1/admin/centers/[id]/admins/[userId] | withRole | super_admin | **NONE** | - |
| 267 | superadmin | POST | `/api/v1/admin/centers/[id]/admins/invite` | superadmin…/api/v1/admin/centers/[id]/admins/invite | withRole | super_admin | parseJson | - |
| 268 | superadmin | GET | `/api/v1/admin/centers/[id]/affiliations` | superadmin…/api/v1/admin/centers/[id]/affiliations | withRole | super_admin | n/a (GET) | - |
| 269 | superadmin | PUT | `/api/v1/admin/centers/[id]/affiliations/[affiliationId]` | superadmin…/api/v1/admin/centers/[id]/affiliations/[affiliationId] | withRole | super_admin | parseJson | - |
| 270 | superadmin | POST | `/api/v1/admin/centers/[id]/approve` | superadmin…/api/v1/admin/centers/[id]/approve | withRole | super_admin | **NONE** | - |
| 271 | superadmin | PATCH | `/api/v1/admin/centers/[id]/attendance/[attendanceId]` | superadmin…/api/v1/admin/centers/[id]/attendance/[attendanceId] | withRole | super_admin | parseJson | - |
| 272 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/blacklist` | superadmin…/api/v1/admin/centers/[id]/blacklist | withRole | super_admin | parseJson | - |
| 273 | superadmin | DELETE | `/api/v1/admin/centers/[id]/blacklist/[entryId]` | superadmin…/api/v1/admin/centers/[id]/blacklist/[entryId] | withRole | super_admin | parseJson | - |
| 274 | superadmin | POST | `/api/v1/admin/centers/[id]/broadcast` | superadmin…/api/v1/admin/centers/[id]/broadcast | withRole | super_admin | parseJson | - |
| 275 | superadmin | POST | `/api/v1/admin/centers/[id]/collaboration-requests` | superadmin…/api/v1/admin/centers/[id]/collaboration-requests | withRole | super_admin | parseJson | - |
| 276 | superadmin | POST | `/api/v1/admin/centers/[id]/courses` | superadmin…/api/v1/admin/centers/[id]/courses | withRole | super_admin | parseJson | - |
| 277 | superadmin | GET,PATCH | `/api/v1/admin/centers/[id]/courses/[courseId]` | superadmin…/api/v1/admin/centers/[id]/courses/[courseId] | withRole | super_admin | parseJson | - |
| 278 | superadmin | POST | `/api/v1/admin/centers/[id]/courses/[courseId]/cancel` | superadmin…/api/v1/admin/centers/[id]/courses/[courseId]/cancel | withRole | super_admin | parseJson | - |
| 279 | superadmin | POST | `/api/v1/admin/centers/[id]/courses/[courseId]/reassign-teacher` | superadmin…/api/v1/admin/centers/[id]/courses/[courseId]/reassign-teacher | withRole | super_admin | parseJson | - |
| 280 | superadmin | GET | `/api/v1/admin/centers/[id]/dashboard` | superadmin…/api/v1/admin/centers/[id]/dashboard | withRole | super_admin | n/a (GET) | - |
| 281 | superadmin | GET | `/api/v1/admin/centers/[id]/deletion-requests` | superadmin…/api/v1/admin/centers/[id]/deletion-requests | withRole | super_admin | query:unvalidated | - |
| 282 | superadmin | POST | `/api/v1/admin/centers/[id]/deletion-requests/[requestId]/decide` | superadmin…/api/v1/admin/centers/[id]/deletion-requests/[requestId]/decide | withRole | super_admin | parseJson | - |
| 283 | superadmin | GET | `/api/v1/admin/centers/[id]/enrollment-requests` | superadmin…/api/v1/admin/centers/[id]/enrollment-requests | withRole | super_admin | query:unvalidated | - |
| 284 | superadmin | POST | `/api/v1/admin/centers/[id]/enrollment-requests/[requestId]/decide` | superadmin…/api/v1/admin/centers/[id]/enrollment-requests/[requestId]/decide | withRole | super_admin | parseJson | - |
| 285 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/enrollments` | superadmin…/api/v1/admin/centers/[id]/enrollments | withRole | super_admin | parseJson+query:unvalidated | - |
| 286 | superadmin | DELETE | `/api/v1/admin/centers/[id]/enrollments/[enrollmentId]` | superadmin…/api/v1/admin/centers/[id]/enrollments/[enrollmentId] | withRole | super_admin | **NONE** | - |
| 287 | superadmin | POST | `/api/v1/admin/centers/[id]/members/[userId]/status` | superadmin…/api/v1/admin/centers/[id]/members/[userId]/status | withRole | super_admin | parseJson | - |
| 288 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/money/expenses` | superadmin…/api/v1/admin/centers/[id]/money/expenses | withRole | super_admin | parseJson+query:unvalidated | - |
| 289 | superadmin | PATCH,DELETE | `/api/v1/admin/centers/[id]/money/expenses/[expenseId]` | superadmin…/api/v1/admin/centers/[id]/money/expenses/[expenseId] | withRole | super_admin | parseJson | - |
| 290 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/money/payments` | superadmin…/api/v1/admin/centers/[id]/money/payments | withRole | super_admin | parseJson+query:unvalidated | - |
| 291 | superadmin | GET | `/api/v1/admin/centers/[id]/money/payments/[paymentId]` | superadmin…/api/v1/admin/centers/[id]/money/payments/[paymentId] | withRole | super_admin | n/a (GET) | - |
| 292 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/money/payout-request` | superadmin…/api/v1/admin/centers/[id]/money/payout-request | withRole | super_admin | parseJson | - |
| 293 | superadmin | POST | `/api/v1/admin/centers/[id]/money/subscriptions` | superadmin…/api/v1/admin/centers/[id]/money/subscriptions | withRole | super_admin | parseJson | - |
| 294 | superadmin | POST | `/api/v1/admin/centers/[id]/money/wallet-topup` | superadmin…/api/v1/admin/centers/[id]/money/wallet-topup | withRole | super_admin | parseJson | - |
| 295 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/attendance` | superadmin…/api/v1/admin/centers/[id]/oversight/attendance | withRole | super_admin | query:unvalidated | - |
| 296 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/courses` | superadmin…/api/v1/admin/centers/[id]/oversight/courses | withRole | super_admin | query:unvalidated | - |
| 297 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/enrollments` | superadmin…/api/v1/admin/centers/[id]/oversight/enrollments | withRole | super_admin | query:unvalidated | - |
| 298 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/finance` | superadmin…/api/v1/admin/centers/[id]/oversight/finance | withRole | super_admin | query:unvalidated | - |
| 299 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/invoices` | superadmin…/api/v1/admin/centers/[id]/oversight/invoices | withRole | super_admin | query:unvalidated | - |
| 300 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/overview` | superadmin…/api/v1/admin/centers/[id]/oversight/overview | withRole | super_admin | n/a (GET) | - |
| 301 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/payments` | superadmin…/api/v1/admin/centers/[id]/oversight/payments | withRole | super_admin | query:unvalidated | - |
| 302 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/payouts` | superadmin…/api/v1/admin/centers/[id]/oversight/payouts | withRole | super_admin | query:unvalidated | - |
| 303 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/pending` | superadmin…/api/v1/admin/centers/[id]/oversight/pending | withRole | super_admin | query:unvalidated | - |
| 304 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/sessions` | superadmin…/api/v1/admin/centers/[id]/oversight/sessions | withRole | super_admin | query:unvalidated | - |
| 305 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/settlements` | superadmin…/api/v1/admin/centers/[id]/oversight/settlements | withRole | super_admin | query:unvalidated | - |
| 306 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/staff` | superadmin…/api/v1/admin/centers/[id]/oversight/staff | withRole | super_admin | query:unvalidated | - |
| 307 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/statement` | superadmin…/api/v1/admin/centers/[id]/oversight/statement | withRole | super_admin | query:unvalidated | - |
| 308 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/students` | superadmin…/api/v1/admin/centers/[id]/oversight/students | withRole | super_admin | query:unvalidated | - |
| 309 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/subscriptions` | superadmin…/api/v1/admin/centers/[id]/oversight/subscriptions | withRole | super_admin | query:unvalidated | - |
| 310 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/transactions` | superadmin…/api/v1/admin/centers/[id]/oversight/transactions | withRole | super_admin | query:unvalidated | - |
| 311 | superadmin | GET | `/api/v1/admin/centers/[id]/oversight/wallet` | superadmin…/api/v1/admin/centers/[id]/oversight/wallet | withRole | super_admin | query:unvalidated | - |
| 312 | superadmin | PUT,DELETE | `/api/v1/admin/centers/[id]/per-student-rate` | superadmin…/api/v1/admin/centers/[id]/per-student-rate | withRole | super_admin | parseJson | - |
| 313 | superadmin | POST | `/api/v1/admin/centers/[id]/reject` | superadmin…/api/v1/admin/centers/[id]/reject | withRole | super_admin | parseJson | - |
| 314 | superadmin | GET | `/api/v1/admin/centers/[id]/reports/[report]` | superadmin…/api/v1/admin/centers/[id]/reports/[report] | withRole | super_admin | query:unvalidated | - |
| 315 | superadmin | GET | `/api/v1/admin/centers/[id]/rooms` | superadmin…/api/v1/admin/centers/[id]/rooms | withRole | super_admin | n/a (GET) | - |
| 316 | superadmin | PATCH | `/api/v1/admin/centers/[id]/rooms/[roomId]` | superadmin…/api/v1/admin/centers/[id]/rooms/[roomId] | withRole | super_admin | parseJson | - |
| 317 | superadmin | PUT,DELETE | `/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | superadmin…/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate | withRole | super_admin | parseJson | - |
| 318 | superadmin | PUT,DELETE | `/api/v1/admin/centers/[id]/rooms/[roomId]/split` | superadmin…/api/v1/admin/centers/[id]/rooms/[roomId]/split | withRole | super_admin | parseJson | - |
| 319 | superadmin | POST | `/api/v1/admin/centers/[id]/rooms/[roomId]/status` | superadmin…/api/v1/admin/centers/[id]/rooms/[roomId]/status | withRole | super_admin | parseJson | - |
| 320 | superadmin | POST | `/api/v1/admin/centers/[id]/rooms/create` | superadmin…/api/v1/admin/centers/[id]/rooms/create | withRole | super_admin | parseJson | - |
| 321 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/roster/students` | superadmin…/api/v1/admin/centers/[id]/roster/students | withRole | super_admin | parseJson+query:unvalidated | - |
| 322 | superadmin | GET,PATCH,DELETE | `/api/v1/admin/centers/[id]/roster/students/[studentId]` | superadmin…/api/v1/admin/centers/[id]/roster/students/[studentId] | withRole | super_admin | parseJson | - |
| 323 | superadmin | POST | `/api/v1/admin/centers/[id]/roster/students/invite` | superadmin…/api/v1/admin/centers/[id]/roster/students/invite | withRole | super_admin | parseJson | - |
| 324 | superadmin | GET | `/api/v1/admin/centers/[id]/roster/teachers` | superadmin…/api/v1/admin/centers/[id]/roster/teachers | withRole | super_admin | query:unvalidated | - |
| 325 | superadmin | DELETE | `/api/v1/admin/centers/[id]/roster/teachers/[teacherId]` | superadmin…/api/v1/admin/centers/[id]/roster/teachers/[teacherId] | withRole | super_admin | **NONE** | - |
| 326 | superadmin | POST | `/api/v1/admin/centers/[id]/roster/teachers/invite` | superadmin…/api/v1/admin/centers/[id]/roster/teachers/invite | withRole | super_admin | parseJson | - |
| 327 | superadmin | GET,PUT | `/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance` | superadmin…/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance | withRole | super_admin | parseJson | - |
| 328 | superadmin | POST | `/api/v1/admin/centers/[id]/sessions/[sessionId]/cancel` | superadmin…/api/v1/admin/centers/[id]/sessions/[sessionId]/cancel | withRole | super_admin | parseJson | - |
| 329 | superadmin | POST | `/api/v1/admin/centers/[id]/sessions/[sessionId]/complete` | superadmin…/api/v1/admin/centers/[id]/sessions/[sessionId]/complete | withRole | super_admin | **NONE** | - |
| 330 | superadmin | POST | `/api/v1/admin/centers/[id]/sessions/[sessionId]/postpone` | superadmin…/api/v1/admin/centers/[id]/sessions/[sessionId]/postpone | withRole | super_admin | parseJson | - |
| 331 | superadmin | GET | `/api/v1/admin/centers/[id]/sessions/[sessionId]/settlement-preview` | superadmin…/api/v1/admin/centers/[id]/sessions/[sessionId]/settlement-preview | withRole | super_admin | n/a (GET) | - |
| 332 | superadmin | GET,PUT,DELETE | `/api/v1/admin/centers/[id]/split` | superadmin…/api/v1/admin/centers/[id]/split | withRole | super_admin | parseJson | - |
| 333 | superadmin | GET,POST | `/api/v1/admin/centers/[id]/staff` | superadmin…/api/v1/admin/centers/[id]/staff | withRole | super_admin | parseJson | - |
| 334 | superadmin | PATCH,DELETE | `/api/v1/admin/centers/[id]/staff/[linkId]` | superadmin…/api/v1/admin/centers/[id]/staff/[linkId] | withRole | super_admin | parseJson | - |
| 335 | superadmin | POST | `/api/v1/admin/centers/[id]/staff/[linkId]/invite` | superadmin…/api/v1/admin/centers/[id]/staff/[linkId]/invite | withRole+rateLimit | super_admin | parseJson | - |
| 336 | superadmin | POST | `/api/v1/admin/centers/[id]/status` | superadmin…/api/v1/admin/centers/[id]/status | withRole | super_admin | parseJson | - |
| 337 | superadmin | POST | `/api/v1/admin/centers/[id]/students/[studentId]/membership` | superadmin…/api/v1/admin/centers/[id]/students/[studentId]/membership | withRole | super_admin | parseJson | - |
| 338 | superadmin | GET | `/api/v1/admin/collaboration-requests` | superadmin…/api/v1/admin/collaboration-requests | withRole | super_admin | query:unvalidated | - |
| 339 | superadmin | GET | `/api/v1/admin/collaboration-requests/[id]` | superadmin…/api/v1/admin/collaboration-requests/[id] | withRole | super_admin | n/a (GET) | - |
| 340 | superadmin | POST | `/api/v1/admin/collaboration-requests/[id]/decide` | superadmin…/api/v1/admin/collaboration-requests/[id]/decide | withRole | super_admin | parseJson | - |
| 341 | superadmin | GET,PUT | `/api/v1/admin/commission-settings` | superadmin…/api/v1/admin/commission-settings | withRole | super_admin | parseJson | - |
| 342 | superadmin | GET | `/api/v1/admin/contact-submissions` | superadmin…/api/v1/admin/contact-submissions | withRole | super_admin | query:unvalidated | - |
| 343 | superadmin | POST | `/api/v1/admin/contact-submissions/[id]/status` | superadmin…/api/v1/admin/contact-submissions/[id]/status | withRole | super_admin | parseJson | - |
| 344 | superadmin | GET | `/api/v1/admin/dashboard/decision-queue` | superadmin…/api/v1/admin/dashboard/decision-queue | withRole | super_admin | n/a (GET) | - |
| 345 | superadmin | GET | `/api/v1/admin/dashboard/kpis` | superadmin…/api/v1/admin/dashboard/kpis | withRole | super_admin | n/a (GET) | - |
| 346 | superadmin | GET | `/api/v1/admin/dashboard/revenue-chart` | superadmin…/api/v1/admin/dashboard/revenue-chart | withRole | super_admin | query:unvalidated | - |
| 347 | superadmin | GET | `/api/v1/admin/dashboard/user-growth-chart` | superadmin…/api/v1/admin/dashboard/user-growth-chart | withRole | super_admin | n/a (GET) | - |
| 348 | superadmin | GET | `/api/v1/admin/deletion-requests` | superadmin…/api/v1/admin/deletion-requests | withRole | super_admin | query:unvalidated | - |
| 349 | superadmin | POST | `/api/v1/admin/deletion-requests/[id]` | superadmin…/api/v1/admin/deletion-requests/[id] | withRole | super_admin | parseJson | - |
| 350 | superadmin | GET,PUT | `/api/v1/admin/feature-flags` | superadmin…/api/v1/admin/feature-flags | withRole | super_admin | parseJson | - |
| 351 | superadmin | POST | `/api/v1/admin/impersonation/stop` | superadmin…/api/v1/admin/impersonation/stop | session(optional) | - | **NONE** | - |
| 352 | superadmin | GET | `/api/v1/admin/messaging/blocks` | superadmin…/api/v1/admin/messaging/blocks | withRole | super_admin | query:unvalidated | - |
| 353 | superadmin | GET | `/api/v1/admin/messaging/conversations` | superadmin…/api/v1/admin/messaging/conversations | withRole | super_admin | query:unvalidated | - |
| 354 | superadmin | GET | `/api/v1/admin/messaging/conversations/[id]` | superadmin…/api/v1/admin/messaging/conversations/[id] | withRole | super_admin | query:unvalidated | - |
| 355 | superadmin | DELETE | `/api/v1/admin/messaging/messages/[id]` | superadmin…/api/v1/admin/messaging/messages/[id] | withRole | super_admin | parseJson | - |
| 356 | superadmin | GET | `/api/v1/admin/messaging/reports` | superadmin…/api/v1/admin/messaging/reports | withRole | super_admin | query:unvalidated | - |
| 357 | superadmin | PATCH | `/api/v1/admin/messaging/reports/[id]` | superadmin…/api/v1/admin/messaging/reports/[id] | withRole | super_admin | parseJson | - |
| 358 | superadmin | GET | `/api/v1/admin/notifications/history` | superadmin…/api/v1/admin/notifications/history | withRole | super_admin | query:unvalidated | - |
| 359 | superadmin | GET | `/api/v1/admin/payment-intents` | superadmin…/api/v1/admin/payment-intents | withRole | super_admin | query:unvalidated | - |
| 360 | superadmin | POST | `/api/v1/admin/platform/students/[studentId]/move` | superadmin…/api/v1/admin/platform/students/[studentId]/move | withRole | super_admin | parseJson | - |
| 361 | superadmin | POST | `/api/v1/admin/platform/students/[studentId]/verify-dob` | superadmin…/api/v1/admin/platform/students/[studentId]/verify-dob | withRole | super_admin | parseJson | - |
| 362 | superadmin | POST | `/api/v1/admin/platform/users/[userId]/force-logout` | superadmin…/api/v1/admin/platform/users/[userId]/force-logout | withRole | super_admin | parseJson | - |
| 363 | superadmin | GET,POST | `/api/v1/admin/points/rules` | superadmin…/api/v1/admin/points/rules | withRole | super_admin | parseJson | - |
| 364 | superadmin | PATCH,DELETE | `/api/v1/admin/points/rules/[id]` | superadmin…/api/v1/admin/points/rules/[id] | withRole | super_admin | parseJson | - |
| 365 | superadmin | POST | `/api/v1/admin/points/students/[id]/adjust` | superadmin…/api/v1/admin/points/students/[id]/adjust | withRole | super_admin | parseJson | - |
| 366 | superadmin | GET | `/api/v1/admin/points/students/[id]/ledger` | superadmin…/api/v1/admin/points/students/[id]/ledger | withRole | super_admin | query:unvalidated | - |
| 367 | superadmin | GET | `/api/v1/admin/registrations` | superadmin…/api/v1/admin/registrations | withRole | super_admin | query:unvalidated | - |
| 368 | superadmin | GET | `/api/v1/admin/registrations/count` | superadmin…/api/v1/admin/registrations/count | withRole | super_admin | n/a (GET) | - |
| 369 | superadmin | GET,PUT | `/api/v1/admin/revenue-split` | superadmin…/api/v1/admin/revenue-split | withRole | super_admin | parseJson | - |
| 370 | superadmin | PUT,DELETE | `/api/v1/admin/revenue-split/per-student-rate` | superadmin…/api/v1/admin/revenue-split/per-student-rate | withRole | super_admin | parseJson | - |
| 371 | superadmin | GET | `/api/v1/admin/session-settlements` | superadmin…/api/v1/admin/session-settlements | withRole | super_admin | query:unvalidated | - |
| 372 | superadmin | GET | `/api/v1/admin/session-settlements/export` | superadmin…/api/v1/admin/session-settlements/export | withRole | accountant,super_admin | query:unvalidated | - |
| 373 | superadmin | GET | `/api/v1/admin/students` | superadmin…/api/v1/admin/students | withRole | super_admin | query:unvalidated | - |
| 374 | superadmin | GET | `/api/v1/admin/students/[id]` | superadmin…/api/v1/admin/students/[id] | withRole | super_admin | n/a (GET) | - |
| 375 | superadmin | POST | `/api/v1/admin/students/[id]/blacklist` | superadmin…/api/v1/admin/students/[id]/blacklist | withRole | super_admin | parseJson | - |
| 376 | superadmin | POST | `/api/v1/admin/students/[id]/link-parent` | superadmin…/api/v1/admin/students/[id]/link-parent | withRole | super_admin | parseJson | - |
| 377 | superadmin | DELETE | `/api/v1/admin/students/[id]/unlink-parent` | superadmin…/api/v1/admin/students/[id]/unlink-parent | withRole | super_admin | query:unvalidated | - |
| 378 | superadmin | GET | `/api/v1/admin/subscriptions` | superadmin…/api/v1/admin/subscriptions | withRole | super_admin | query:unvalidated | - |
| 379 | superadmin | GET | `/api/v1/admin/teacher-agreements` | superadmin…/api/v1/admin/teacher-agreements | withRole | super_admin | query:unvalidated | - |
| 380 | superadmin | POST | `/api/v1/admin/teacher-agreements/[id]/approve` | superadmin…/api/v1/admin/teacher-agreements/[id]/approve | withRole | super_admin | parseOptionalJson | - |
| 381 | superadmin | POST | `/api/v1/admin/teacher-agreements/[id]/reject` | superadmin…/api/v1/admin/teacher-agreements/[id]/reject | withRole | super_admin | **NONE** | - |
| 382 | superadmin | POST | `/api/v1/admin/teacher-agreements/[id]/terminate` | superadmin…/api/v1/admin/teacher-agreements/[id]/terminate | withRole | super_admin | **NONE** | - |
| 383 | superadmin | GET | `/api/v1/admin/teachers` | superadmin…/api/v1/admin/teachers | withRole | super_admin | query:unvalidated | - |
| 384 | superadmin | POST | `/api/v1/admin/teachers/[id]/approve` | superadmin…/api/v1/admin/teachers/[id]/approve | withRole | super_admin | **NONE** | - |
| 385 | superadmin | PATCH | `/api/v1/admin/teachers/[id]/attendance-mode` | superadmin…/api/v1/admin/teachers/[id]/attendance-mode | withRole | super_admin | parseJson | - |
| 386 | superadmin | POST | `/api/v1/admin/teachers/[id]/blacklist` | superadmin…/api/v1/admin/teachers/[id]/blacklist | withRole | super_admin | parseJson | - |
| 387 | superadmin | POST | `/api/v1/admin/teachers/[id]/link-center` | superadmin…/api/v1/admin/teachers/[id]/link-center | withRole | super_admin | parseJson | - |
| 388 | superadmin | POST | `/api/v1/admin/teachers/[id]/reject` | superadmin…/api/v1/admin/teachers/[id]/reject | withRole | super_admin | parseJson | - |
| 389 | superadmin | DELETE | `/api/v1/admin/teachers/[id]/unlink-center` | superadmin…/api/v1/admin/teachers/[id]/unlink-center | withRole | super_admin | query:unvalidated | - |
| 390 | superadmin | GET | `/api/v1/admin/users` | superadmin…/api/v1/admin/users | withRole | super_admin | query:unvalidated | - |
| 391 | superadmin | GET | `/api/v1/admin/users/[id]` | superadmin…/api/v1/admin/users/[id] | withRole | super_admin | n/a (GET) | - |
| 392 | superadmin | POST | `/api/v1/admin/users/[id]/blacklist` | superadmin…/api/v1/admin/users/[id]/blacklist | withRole | super_admin | parseJson | - |
| 393 | superadmin | GET,POST | `/api/v1/admin/users/[id]/card` | superadmin…/api/v1/admin/users/[id]/card | withRole | super_admin | parseJson | - |
| 394 | superadmin | POST | `/api/v1/admin/users/[id]/impersonate` | superadmin…/api/v1/admin/users/[id]/impersonate | withRole | super_admin | **NONE** | - |
| 395 | superadmin | POST | `/api/v1/admin/users/[id]/password-reset` | superadmin…/api/v1/admin/users/[id]/password-reset | withRole | super_admin | parseJson | - |
| 396 | superadmin | POST | `/api/v1/admin/users/[id]/reset-2fa` | superadmin…/api/v1/admin/users/[id]/reset-2fa | withRole | super_admin | parseJson | - |
| 397 | superadmin | POST | `/api/v1/admin/users/[id]/revoke-sessions` | superadmin…/api/v1/admin/users/[id]/revoke-sessions | withRole | super_admin | parseJson | - |
| 398 | superadmin | DELETE | `/api/v1/admin/users/[id]/sessions/[sessionId]` | superadmin…/api/v1/admin/users/[id]/sessions/[sessionId] | withRole | super_admin | **NONE** | - |
| 399 | superadmin | PATCH | `/api/v1/admin/users/[id]/status` | superadmin…/api/v1/admin/users/[id]/status | withRole | super_admin | parseJson | - |
| 400 | superadmin | POST | `/api/v1/admin/users/[id]/view-as` | superadmin…/api/v1/admin/users/[id]/view-as | withRole | super_admin | **NONE** | - |
| 401 | superadmin | GET,PUT | `/api/v1/admin/wallet-settings` | superadmin…/api/v1/admin/wallet-settings | withRole | super_admin | parseJson | - |
| 402 | superadmin | GET | `/api/v1/admin/whatsapp-messages` | superadmin…/api/v1/admin/whatsapp-messages | withRole | super_admin | query:unvalidated | - |
| 403 | superadmin | GET | `/api/v1/finance/alerts` | superadmin…/api/v1/finance/alerts | withRole | accountant,super_admin | n/a (GET) | - |
| 404 | superadmin | GET | `/api/v1/finance/commission-settings` | superadmin…/api/v1/finance/commission-settings | withRole | accountant,super_admin | n/a (GET) | - |
| 405 | superadmin | GET | `/api/v1/finance/dashboard` | superadmin…/api/v1/finance/dashboard | withRole | accountant,super_admin | n/a (GET) | - |
| 406 | superadmin | GET,POST | `/api/v1/finance/invoices` | superadmin…/api/v1/finance/invoices | withRole | accountant,super_admin | parseJson+query:unvalidated | - |
| 407 | superadmin | GET | `/api/v1/finance/invoices/[id]` | superadmin…/api/v1/finance/invoices/[id] | withRole | accountant,super_admin | n/a (GET) | - |
| 408 | superadmin | GET | `/api/v1/finance/invoices/[id]/pdf` | superadmin…/api/v1/finance/invoices/[id]/pdf | withRole | accountant,super_admin | n/a (GET) | - |
| 409 | superadmin | POST | `/api/v1/finance/invoices/[id]/send-email` | superadmin…/api/v1/finance/invoices/[id]/send-email | withRole | accountant,super_admin | **NONE** | - |
| 410 | superadmin | GET,POST | `/api/v1/finance/payouts` | superadmin…/api/v1/finance/payouts | withRole | accountant,super_admin | query:unvalidated | - |
| 411 | superadmin | POST | `/api/v1/finance/payouts/[id]/approve` | superadmin…/api/v1/finance/payouts/[id]/approve | withRole | accountant,super_admin | **NONE** | - |
| 412 | superadmin | GET | `/api/v1/finance/payouts/[id]/receipt` | superadmin…/api/v1/finance/payouts/[id]/receipt | withRole | accountant,super_admin | n/a (GET) | - |
| 413 | superadmin | POST | `/api/v1/finance/payouts/[id]/reject` | superadmin…/api/v1/finance/payouts/[id]/reject | withRole | accountant,super_admin | parseJson | - |
| 414 | superadmin | GET | `/api/v1/finance/payouts/counts` | superadmin…/api/v1/finance/payouts/counts | withRole | accountant,super_admin | n/a (GET) | - |
| 415 | superadmin | POST | `/api/v1/finance/refunds` | superadmin…/api/v1/finance/refunds | withRole | accountant,super_admin | parseJson | - |
| 416 | superadmin | GET | `/api/v1/finance/reports/center-statement/[centerId]` | superadmin…/api/v1/finance/reports/center-statement/[centerId] | withRole | accountant,super_admin | query:unvalidated | - |
| 417 | superadmin | GET | `/api/v1/finance/reports/refunds` | superadmin…/api/v1/finance/reports/refunds | withRole | accountant,super_admin | query:unvalidated | - |
| 418 | superadmin | GET | `/api/v1/finance/reports/revenue` | superadmin…/api/v1/finance/reports/revenue | withRole | accountant,super_admin | query:unvalidated | - |
| 419 | superadmin | GET | `/api/v1/finance/reports/teacher-statement/[teacherId]` | superadmin…/api/v1/finance/reports/teacher-statement/[teacherId] | withRole | accountant,super_admin | query:unvalidated | - |
| 420 | superadmin | GET | `/api/v1/finance/reports/trial-balance` | superadmin…/api/v1/finance/reports/trial-balance | withRole | accountant,super_admin | query:unvalidated | - |
| 421 | superadmin | GET | `/api/v1/finance/subscriptions` | superadmin…/api/v1/finance/subscriptions | withRole | accountant,super_admin | query:unvalidated | - |
| 422 | superadmin | GET | `/api/v1/finance/transactions` | superadmin…/api/v1/finance/transactions | withRole | accountant,super_admin | query:unvalidated | - |
| 423 | superadmin | GET,PATCH | `/api/v1/me` | superadmin…/api/v1/me | requireSession | - | parseJson | scopedDb |
| 424 | superadmin | GET,PATCH | `/api/v1/me/prefs` | superadmin…/api/v1/me/prefs | requireSession | - | parseJson | scopedDb |
| 425 | superadmin | GET | `/api/v1/notifications` | superadmin…/api/v1/notifications | requireSession | - | parsePageLimit | scopedDb |
| 426 | superadmin | POST | `/api/v1/notifications/[id]/read` | superadmin…/api/v1/notifications/[id]/read | requireSession | - | **NONE** | scopedDb |
| 427 | superadmin | POST | `/api/v1/notifications/read-all` | superadmin…/api/v1/notifications/read-all | requireSession | - | **NONE** | scopedDb |
| 428 | superadmin | GET | `/api/v1/search` | superadmin…/api/v1/search | withRole | super_admin,accountant | query:unvalidated | - |
| 429 | superadmin | POST | `/api/v1/security/csp-report` | superadmin…/api/v1/security/csp-report | rateLimit | - | **NONE** | - |


### 3.2 Non-HTTP and machine entry points

| Kind | Name | Handler | Auth | Validation |
|---|---|---|---|---|
| Socket.IO handshake | `auth.token` | `apps/realtime/src/server.ts:38` → `auth.ts:verifySocketToken` | HS256 JWT, `aud=edura-realtime`, `iss=edura`, 60 s, secret `REALTIME_JWT_SECRET` | claims `sub`, `role` required |
| Socket event | `message:send` | `server.ts:~100` | socket user | zod `sendSchema` (uuid ids, body ≤ `MAX_MESSAGE_LENGTH`, clientId ≤ 64); policy in `@repo/database/chat.appendMessage`; per-user limiter |
| Socket event | `conversation:read` | `server.ts` | socket user | zod `readSchema` |
| Socket event | `typing` | `server.ts` | socket user | zod `typingSchema`; membership cache per socket |
| Internal HTTP | `POST /internal/message`, `POST /internal/read` | `apps/realtime/src/internal.ts` | `x-internal-secret` = `INTERNAL_API_SECRET` (`secretEquals`) | zod; 256 KB body cap |
| Internal HTTP | `POST /api/v1/internal/chat-notify` | ERP | same secret | zod |
| Cron jobs (9) | `month-end-statements`, `lesson-reminders`, `expire-payment-intents`, `expire-subscriptions`, `subscription-renewal-reminders`, `expire-collaboration-requests`, `guardian-contact-reminders`, `data-exports`, `weekly-center-digest` | `apps/erp/src/app/api/v1/cron/[job]/route.ts` | `Authorization: Bearer` or `x-cron-secret` = `CRON_SECRET`; unset → all rejected | job name is a switch; unknown → 400 |
| Webhook | `POST /api/v1/payments/paymob/webhook` | `apps/erp/src/app/api/v1/payments/paymob/webhook/route.ts` | driver `verifyWebhook(rawBody, query)`; IP rate limit 120/min | body parsed after HMAC; `processWebhookEvent` claims intent with `updateMany where status='pending'` |
| GitHub Actions | `cron.yml`, `backup.yml`, `migrate-production.yml`, `deploy*.yml` | `.github/workflows` | repo secrets (`CRON_SECRET`, `BACKUP_*`, Vercel tokens) | n/a |
| Prisma client extensions | `sessionRevocation`, `softDelete`, `immutable`, `auditLog`, `roleGuard` | `packages/database/src/extensions` | in-process | enforce soft-delete, immutability of ledgers and role-based refusal at the ORM layer (Phase 2 reads these) |

---

## 4. Preliminary observations from recon (unverified, to be confirmed or discarded in Phase 2)

These are things noticed while mapping, recorded now so nothing is lost. None is graded yet.

1. **Webhook event carries no amount or currency.** `WebhookEvent` (`gateway/types.ts:15`) has `gatewayOrderId`, `success`, `gatewayRef`, `reason` only, and `processWebhookEvent` settles `intent.amount` on any `success=true` event for a known order id. When the Paymob driver is written it MUST compare the provider's `amount_cents`/`currency`/`success`/`is_refunded` against the intent, or a partially captured or voided transaction settles in full. This is the single most important payment-integration requirement and will be written up in Phase 3.
2. **Expired-but-charged intents.** The claim is `status='pending'` only; an intent moved to `expired` by the cron cannot be settled if the provider charges late. Needs a reconciliation path or a "paid_after_expiry" state, not silent `not_pending`.
3. **Mock driver reachable in production.** `resolveDriver()` returns the mock driver whenever `PAYMENTS_MODE=mock`, including in production; `onlineCheckoutAvailable()` hides checkout but the public webhook route still verifies with the mock HMAC (keyed on `PAYMOB_HMAC_SECRET`). Safe only while that secret is strong; Phase 2 will check whether the mock driver should refuse to exist in production outright.
4. **RLS bypass is the default for non-center roles** (see B2). Every student/parent/teacher read is a hand-written `where`. Phase 2 IDOR review will go route by route through the 40 bare-`requireSession` routes and every `[id]` route.
5. **`payments`, `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger` are UPDATE/DELETE-able by the app role**, unlike `transactions`. Any bug or SQL-level compromise can rewrite balances there. To be graded.
6. **`minPasswordLength: 1`** in both better-auth configs; registration/reset schemas must enforce policy elsewhere (to verify in `register/*` and `password/reset`).
7. **`GET /api/health?deep=mail`** is public and opens an SMTP connection per call (rate limit: none on this route). Cheap amplification against the mail provider.
8. **CSP allows `'unsafe-inline'` scripts** on both apps, so XSS mitigation depends entirely on React escaping; Phase 2 will grep for `dangerouslySetInnerHTML`, `next-mdx-remote` usage, and raw HTML in emails/PDFs.
9. **`ignoreBuildErrors` + permissive Vercel build fallback** mean a type-broken or partially built app can deploy.
10. **View-as replay guard is a `findFirst` on `audit_logs` with no unique index on `jti`**, inside a transaction but without a lock — two concurrent claims of the same 60-second token can both succeed. Low impact (both sessions belong to the same super_admin), but easy to close.
11. **`assertSharedRateLimitStore` documents `ALLOW_UNSHARED_RATE_LIMIT=1` but never reads it** — the escape hatch in the error message does not exist. Harmless, but the message misleads an operator.
12. **`bun audit`: 8 advisories (4 high, 4 moderate)**, all in transitive tooling or unreachable paths: `mysql2` (via prisma/better-auth, MySQL not used), `qs` (via @refinedev/core), `uuid` (via exceljs), `deepmerge-ts` (via prisma CLI), `browserslist` (build tooling). None sits on a request path that takes attacker input; graded Low/Info in Phase 2 with the reachability argument written down.
13. **`TRUSTED_PROXY_HOPS` governs which `x-forwarded-for` entry is the client IP.** On Vercel a wrong value lets a client choose its own IP and defeat every per-IP limit (login, register, webhook). Deploy-config check for Phase 2.

---

*Phase 2 and Phase 3 sections will be appended below this line.*


---

# Phase 2 — Deep audit findings

**Status:** Phase 2 complete — 2026-09-05. Findings are graded and sorted by severity. Every finding was confirmed by reading the code at the cited lines; nothing here is inferred from names or documentation. No code was changed and no tool was installed. PoC test files are in Appendix A (written, deliberately NOT run and NOT placed under `tests/`, per the audit rules).

**Overall risk rating: HIGH until the four High findings and the payment-integration requirements in Phase 3 are addressed. The existing money engine is unusually well-built (integer piasters, server-side amounts, row locks, conditional decrements, append-only ledgers, idempotency keys on every gateway intent), so the remediation list is short and concrete. The High findings are edge-of-engine gaps — refunds, account merging, and the intent/subscription state machine — not core arithmetic.**

Severity scale: **Critical** = direct loss of money or full account takeover at scale, no preconditions. **High** = loss of money or account takeover with an ordinary precondition (a counter login, a known phone number, a normal race). **Medium** = cross-tenant data exposure, integrity or accountability gap, or a go-live design gap. **Low** = defence-in-depth, correctness drift, or hardening. **Info** = verified healthy, recorded so nobody re-audits it.

## 2.0 Findings table

| ID | Sev | Title | Location |
|---|---|---|---|
| H-01 | High | Refunding a cash wallet top-up hands back cash and leaves the wallet credited (double-spend) | `packages/server-core/src/services/payments/refund-payment.ts:126-131` |
| H-02 | High | Registration silently merges into any walk-in "shell" account whose phone or email matches — no proof of control | `apps/erp/src/lib/services/auth/register.ts:58-65` |
| H-03 | High | A gateway-paid intent whose subscription was cancelled or expired is marked `paid` but writes no payment, no ledger row and grants nothing | `apps/erp/src/lib/services/payments/payment-intents.ts:258-293`, `packages/server-core/src/services/subscriptions/subscriptions.ts:461` |
| H-04 | High | Webhook event has no amount/currency; settlement trusts the intent's amount on any `success=true` | `apps/erp/src/lib/services/payments/gateway/types.ts:15-20`, `payment-intents.ts:214` |
| M-01 | Medium | `center_staff` reads any session and its attendance/coverage platform-wide (IDOR, cross-tenant) | `apps/erp/src/app/api/v1/sessions/[id]/route.ts:21-54`, `sessions/[id]/attendance/route.ts:28-46`, `packages/server-core/src/services/attendance/attendance.ts:72` |
| M-02 | Medium | Two concurrent online checkouts for the same course/plan both settle — duplicate active subscriptions, double charge | `subscriptions.ts:424-450`, `subscriptions.ts:454-490` |
| M-03 | Medium | Payout approval is settlement: one accountant, one click, status `paid`, no external reference, no maker-checker | `apps/superadmin/src/lib/services/finance/payouts.ts:225-272` |
| M-04 | Medium | `payments`, `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger` are UPDATE/DELETE-able by the app role; `Payment` is not in `IMMUTABLE_MODELS`; no DB floor on student/parent wallet balances | `packages/database/prisma/migrations/00000000000003_integrity_sequences_indexes/migration.sql`, `packages/database/src/extensions/index.ts:6-14` |
| M-05 | Medium | `refundChannel: "gateway"` can be armed but nothing calls the provider and no refund webhook exists — such refunds can never be confirmed | `refund-payment.ts:18`, `refund-payment.ts` (`confirmRefund`), `payment-intents.ts:214` |
| M-06 | Medium | Login email can be switched without verifying the new address or notifying the old one | `apps/erp/src/app/api/v1/me/email/route.ts:71` |
| M-07 | Medium | Mock gateway driver is selectable in production; the public webhook then verifies with the mock HMAC | `apps/erp/src/lib/services/payments/gateway/index.ts:11`, `mock-driver.ts:12-19` |
| M-08 | Medium | Back office writes money (record payment, cash wallet top-up, walk-in subscription) despite the documented "money is read-only in the back office" invariant, and the DB revokes do not cover those tables | `apps/superadmin/src/lib/services/admin/center-money.ts:37,72,104` |
| M-09 | Medium | CSP `script-src 'unsafe-inline'` on both apps; `ignoreBuildErrors: true`; Vercel build falls through on failure | `apps/erp/next.config.ts:29,77`, `apps/superadmin/next.config.ts:26`, `apps/*/vercel.json` |
| M-10 | Medium | Public `GET /api/health?deep=mail` opens an SMTP connection per request with no rate limit | `packages/server-core/src/http/health.ts:37` |
| M-11 | Medium | Password-reset request has no per-email throttle, leaks existence by timing, and the ERP route resets back-office accounts | `apps/erp/src/app/api/v1/auth/password/forgot/route.ts:21-22`, `packages/server-core/src/services/auth/password-reset.ts:19` |
| L-01 | Low | Wallet ledger `balanceAfter` is read after the decrement, not returned by it — drifts under concurrency | `packages/server-core/src/services/wallet/wallet.ts:75`, `parent-wallet.ts` (same shape) |
| L-02 | Low | Rounding drift: monthly price ÷ lessons and course price ÷ planned sessions are rounded per lesson, so the sum ≠ the price | `distribution.ts:196`, `fees.ts:55` |
| L-03 | Low | `generatePayouts` takes no lock; two concurrent runs create duplicate pending payouts | `apps/superadmin/src/lib/services/finance/payouts.ts:115` |
| L-04 | Low | Invite acceptance is check-then-update on `usedAt` (race) | `apps/erp/src/lib/services/auth/invite-accept.ts:18-34` |
| L-05 | Low | View-as replay guard has no unique index on `jti` | `apps/erp/src/lib/auth/view-as-plugin.ts:39` |
| L-06 | Low | Temp-student claim endpoint has no rate limit (40-bit code) | `apps/erp/src/app/api/v1/temp-students/claim/route.ts:12` |
| L-07 | Low | `minPasswordLength: 1` in both better-auth configs | `apps/erp/src/lib/auth/auth.ts:73`, `apps/superadmin/src/lib/auth/auth.ts:98` |
| L-08 | Low | Any student can read any grade's metadata by id (scores are filtered, header is not) | `apps/erp/src/lib/services/grades/grades.ts:140-148` |
| L-09 | Low | `expireSubscriptions` caps per-session passes at 2 000 rows and cancels stale pending subscriptions while their intent is still payable | `subscriptions.ts:660-700` |
| L-10 | Low | Gateway checkout creates a new `pending_payment` subscription on every call, even when the idempotency key already resolved to an existing intent (orphans) | `subscriptions.ts:424-450` |
| L-11 | Low | `assertSharedRateLimitStore` documents `ALLOW_UNSHARED_RATE_LIMIT` but never reads it | `packages/server-core/src/rate-limit/require-shared-store.ts:22` |
| L-12 | Low | `TRUSTED_PROXY_HOPS` must match the Vercel proxy depth or clients choose their own IP for every limiter | `packages/server-core/src/rate-limit/token-bucket.ts` (`trustedClientIp`) |
| L-13 | Low | Local paste files `.env-erp`, `.env-superadmin`, `.env-realtime`, `.env-www` are mode 0644 | repo root (untracked) |
| I-01 | Info | `bun audit`: 8 advisories (4 high, 4 moderate), all transitive tooling, none reachable from request input | `bun.lock` |
| I-02…I-12 | Info | Verified healthy controls — see §2.5 | — |

## 2.1 High

### H-01 — Refunding a cash wallet top-up returns cash while the wallet keeps the credit
**Location:** `packages/server-core/src/services/payments/refund-payment.ts:126-131` (gates), `refund-payment.ts:188-230` (bound, refund row, ledger row); origin row written by `packages/server-core/src/services/wallet/cash-topup.ts:41-56`.
**Description.** `topUpWalletCashTx` writes an ordinary `payments` row (`centerId` = the centre, `studentId`, `courseId: null`, `amount > 0`, `paymentMethod: "cash"`) and credits the student wallet. `refundPaymentTx` accepts any positive, non-reversal `payments` row in the caller's centre. Its only money-side gates are (a) the settled-lesson check, which looks at `subscriptions.paymentId` — a top-up has none — and (b) the `refunded_total` bound. It never looks at `wallet_ledger`, never debits the wallet, and never checks that the receipt was a top-up. So a `center_admin` can refund the top-up receipt in full through `POST /api/v1/payments/[id]/refund` with `refundChannel: "cash_drawer"`, hand the cash back, confirm it, and the student's `walletBalance` is unchanged and spendable on any subscription.
**Proof.** Read-only trace: no reference to `walletLedger`, `walletDebit` or `WalletLedger` anywhere in `refund-payment.ts` (grep), while `cash-topup.ts:41` creates the very row shape the refund accepts. PoC test in Appendix A-1 (not run).
**Impact.** Direct loss of the top-up amount per repetition, bounded only by `maxTopup` (default 5 000 EGP) and the number of receipts. Requires a `center_admin` login — a colluding or careless operator, or a stolen session. This is the only place in the engine where money is returned without the balance it funded being reduced.
**Fix.** In `refundPaymentTx`, when the original payment funded a wallet (a `wallet_ledger` row with `paymentId = original.id`, or `original.courseId IS NULL AND note/purpose = top-up`), require the wallet to still hold the amount and debit it via `walletDebit` in the same transaction (a `refund` ledger entry), or refuse and route to a dedicated "reverse top-up" flow. Add a partial CHECK or a test (`c06-refund-guards`) that a top-up receipt cannot be refunded without a matching negative `wallet_ledger` row. **Effort:** S (half a day incl. test).

### H-02 — Registration merges into any shell account whose phone or email matches
**Location:** `apps/erp/src/lib/services/auth/register.ts:58-65` (student), `:77` (parent, email only).
**Description.** `registerStudent` looks up `users` with `status: "shell"` by the submitted email, then by the submitted **phone**, and activates that shell in place with the attacker's password — no invite token, no OTP, no walk-in link. Walk-in students created at a counter are shells keyed by phone (`walk-in.ts:147-157`). The secure path (WhatsApp tokenised link, `invite-token` plugin, 256-bit hashed tokens) exists but the public register route bypasses it. Phone numbers are 11 predictable digits and are known to classmates, other centres and anyone who saw a receipt.
**Proof.** Code path only; PoC in Appendix A-2. The `inviteCode` branch at `:63-65` is optional and unauthenticated as well (8 chars, 40 bits) — but the phone branch needs no code at all.
**Impact.** Account takeover of a walk-in child's account: their attendance history, grades, wallet balance (`studentProfile.walletBalance`), active subscriptions and centre roster attach to the attacker. With payments live, a wallet top-up made at the counter for that child is spendable by the attacker. Child-safety impact as well (messaging as the child).
**Fix.** Make the phone/email shell merge conditional on proof of control: either the walk-in token (already issued) or a phone OTP (deferred in CLAUDE.md — this finding is the concrete reason to un-defer it before wallets carry balances). Until then, register a NEW account on a phone/email match and let the claim happen only through `temp-students/claim` or the invite link. `ensureUniqueUnshelled` already exists; extend it to refuse shells too. **Effort:** M (1–2 days incl. OTP or token gating).

### H-03 — A paid intent whose subscription is no longer `pending_payment` is marked paid and grants nothing
**Location:** `apps/erp/src/lib/services/payments/payment-intents.ts:258-293`; `packages/server-core/src/services/subscriptions/subscriptions.ts:461` (`return null; // replay no-op`); `subscriptions.ts:639-657` (`cancelPendingSubscription`); `subscriptions.ts:686-693` (24 h stale-pending sweep).
**Description.** `processWebhookEvent` claims the intent (`pending → paid`, payload stored) and then calls `settleSubscriptionFromIntentTx`. That function returns `null` for any subscription that is not `pending_payment` — which is also the state after the student cancels the unpaid subscription, after the cron sweep cancels it at 24 h, or after a duplicate checkout activated a sibling. The claim has already committed inside the same transaction, so the outcome is: intent `paid`, gateway captured the money, **no `payments` row, no `transactions` row, no wallet credit, no notification**. The money exists only in the provider's dashboard. The mirror case — intent `expired` by cron, provider captures late — is refused at the claim (`not_pending`), again with money captured and nothing recorded.
**Proof.** Line 461 returns `null`; lines 258-293 only write `payments`/`transactions` inside the `settle` callbacks. PoC in Appendix A-3.
**Impact.** Silent revenue leak / unrecorded liability. Every such case is a customer who paid and got nothing, and a ledger that cannot see it. At scale this is the reconciliation nightmare that makes payment providers freeze accounts.
**Fix.** (1) In `settleSubscriptionFromIntentTx`, if the subscription is `cancelled`/`expired` but the intent is a genuine success, either re-activate it (preferred when the plan is still valid) or record the money as a wallet credit for the payer with a `payment` row and a `payments`-level flag `orphaned_capture`, and notify finance. (2) Never mark an intent `paid` in a transaction that then writes no money row: make the settle callback return the payment id and assert it. (3) Treat `expired` intents that receive a success webhook as `paid_late` and settle or credit them, do not drop them. (4) Stop the stale-pending sweep from cancelling a subscription whose intent is still `pending` and unexpired. **Effort:** M (2 days incl. tests).

### H-04 — The webhook event carries no amount or currency
**Location:** `apps/erp/src/lib/services/payments/gateway/types.ts:15-20` (`WebhookEvent`), `payment-intents.ts:214-300`.
**Description.** The driver contract reduces a provider callback to `{gatewayOrderId, success, gatewayRef, reason}`. Settlement then books `intent.amount`. For Paymob (and any real provider) the callback carries `amount_cents`, `currency`, `success`, `is_refunded`, `is_voided`, `is_capture`, `pending`, `integration_id` and an `order.id`; a partial capture, a voided auth, a refund notification, or a callback for a different integration all look like "success for this order" to this code and settle in full.
**Proof.** Type definition; no field named amount/currency reaches `processWebhookEvent`.
**Impact.** With Paymob live: settling an unpaid or partially paid order; treating a refund/void callback as a payment; a currency mismatch booked as EGP. This is the single most important pre-integration requirement and is written up as a design in Phase 3 §3.3.
**Fix.** Extend `WebhookEvent` with `amountMinor`, `currency`, `kind: "capture"|"refund"|"void"|"pending"` and `integrationId`; in `processWebhookEvent` refuse (log + 200, do not settle) unless `amountMinor === intent.amount && currency === intent.currency && kind === "capture"`. Store the mismatch on the intent (`failureReason`) and alert. **Effort:** S once the driver is written; it must ship with the driver.

## 2.2 Medium

### M-01 — `center_staff` can read any session and its attendance/coverage across all centres
**Location:** `apps/erp/src/app/api/v1/sessions/[id]/route.ts:21-54` — the `if/else if` chain handles `center_admin`, `teacher`, `student`, `parent` and has no final `else`; `sessions/[id]/attendance/route.ts:28-46` checks only `teacher`/`center_admin` before calling `getSessionAttendance`, whose fallthrough at `attendance.ts:72` returns every record plus enrolment and **subscription coverage** for the session.
**Why it works.** A receptionist's session has `role: "center_staff"`; `toActingUser` only rewrites assistants; `scopedDb` for anything but `center_admin` sets `app.bypass_rls = on` (Phase 1 B2). So no branch fires and no RLS filters.
**Impact.** Cross-tenant disclosure: student ids, attendance statuses and who has paid (coverage) for any session by id, to any centre's counter staff. Session ids are UUIDs, but they appear in QR/links, exports and other centres' URLs.
**Fix.** Add a terminal `else throw new ForbiddenError()` in both routes (as `getPayment` already does), and route `center_staff` through `runCenterActor` so they are re-keyed to their centre. Add the same terminal-else rule to a lint or a test that greps role chains. **Effort:** XS.

### M-02 — Concurrent online checkouts for the same plan both settle
**Location:** `subscriptions.ts:424-450` (gateway path creates the pending subscription with no row lock and no unique constraint), `subscriptions.ts:454-490` (`settleSubscriptionFromIntentTx` does not re-run `assertNoDuplicateActive`).
**Description.** The wallet path takes `FOR UPDATE` on the profile row, so it serialises. The gateway path does not: two requests with different `idempotencyKey`s both pass `assertNoDuplicateActive` (both subscriptions are `pending_payment`), both get intents, the student pays both, both webhooks settle. Same for a per-session pass. There is no partial unique index on `subscriptions (student_id, course_id) WHERE plan='monthly' AND status='active'` or `(student_id, session_id) WHERE plan='per_session' AND status='active'` — `c04`/`c05` dedupe guards cover other tables.
**Impact.** Double charge; two overlapping monthly periods; per-lesson price halved in `resolveStudentLessonPrices` (`mine.find` picks one) so the second subscription funds nothing.
**Fix.** Add the two partial unique indexes (migration in the style of C-4/C-5), lock the student profile row on the gateway path as the wallet path does, and re-run `assertNoDuplicateActive` inside `settleSubscriptionFromIntentTx` — on a clash, route the money to H-03's orphan-capture handling. **Effort:** S.

### M-03 — Payout approval is settlement, by one person, with no external evidence
**Location:** `payouts.ts:225-272` (`settlePayout` flips `pending → approved → paid` in one call, decrements the wallet, writes the `payout` ledger row, sets `paidAt`), route `finance/payouts/[id]/approve/route.ts:7` admits `accountant`. The same role runs `generatePayouts` (`:115`) and `refundLessonForStudent`.
**Description.** "Approved" and "paid" are the same instant, no bank reference is captured (`payouts.receipt_url` exists but is not required), and the person who generates the payout can approve it. `Payout.clientRequestId` protects the *request*, nothing protects the *approval* beyond the `status='pending'` claim.
**Impact.** A single compromised or dishonest accountant session moves every positive wallet to `paid` with no counterpart evidence; the books say paid while no transfer happened, or a transfer happened twice. This is the classic separation-of-duties gap payment auditors look for first.
**Fix.** Split `approved` (accountant) from `paid` (super_admin or a second accountant, with a mandatory `externalRef` unique per payout, mirroring `payments_refund_external_ref_unique`); refuse approving a payout you generated; require 2FA freshness for the paid step. **Effort:** M.

### M-04 — Mutable money tables
**Location:** `00000000000003_integrity_sequences_indexes/migration.sql` revokes UPDATE/DELETE on `transactions`, `audit_logs`, `points_ledger` and DELETE on `invoices`, `payouts`; nothing for `payments`, `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger`, `payment_intents`. `IMMUTABLE_MODELS` (`extensions/index.ts:6-14`) includes `WalletLedger` and `ParentWalletLedger` but not `Payment` or `CenterWalletLedger`. `student_profiles.wallet_balance` and `parent_profiles.wallet_balance` have no `CHECK (>= 0)` (only `centers` and `teacher_profiles` do).
**Impact.** Any application bug, injection, or compromised app-role credential can rewrite a receipt amount or a wallet ledger row with no database-level refusal, and the ORM guard is process-local. The conditional decrements keep balances non-negative today, but the floor is one missed `updateMany` away.
**Fix.** `REVOKE UPDATE, DELETE ON wallet_ledger, parent_wallet_ledger, center_wallet_ledger FROM edura_app` (they are already append-only in code); `REVOKE DELETE ON payments` and restrict UPDATE on `payments` to the refund-bookkeeping columns via a trigger or column-level grant; add `CHECK (wallet_balance >= 0)` on `student_profiles` and `parent_profiles`; add `CenterWalletLedger` and `Payment` (delete) to `IMMUTABLE_MODELS`. **Effort:** S (one migration + verify-db check).

### M-05 — Gateway refunds are armed but can never be confirmed
**Location:** `refund-payment.ts:18` (`"gateway"` in `COUNTER_REFUND_CHANNELS`), `confirmRefund` refuses `gateway` by design ("confirmed by the webhook"), but `processWebhookEvent` (`payment-intents.ts:214`) only resolves intents by `gatewayOrderId` and has no refund branch; no code calls a provider refund API.
**Impact.** A refund recorded with channel `gateway` sits `pending` forever; the student is told a refund was issued; finance's unconfirmed queue grows. When Paymob is integrated this becomes a real money path with no executor.
**Fix.** Part of the Phase 3 design: `refundPaymentTx` for `gateway` must call `driver.refund(intent, amount)` after commit (idempotent on `refund.id`), store the provider refund id in `refundExternalRef`, and a refund webhook (`kind: "refund"`) must be the thing that sets `refundConfirmedAt`. Until then, remove `gateway` from the counter's allowed channels. **Effort:** M with the driver; XS to hide the channel now.

### M-06 — Email change without verification of the new address
**Location:** `apps/erp/src/app/api/v1/me/email/route.ts:71`.
**Description.** With the current password (or with no password at all for walk-in accounts), the login email is switched immediately; `emailVerified` is reset but nothing gates on it, and the old address is not notified. Password reset then goes to the new address.
**Impact.** Session theft becomes durable takeover; a parent's guardian address can be silently diverted (guardian-email check only prevents equality with the student's own guardian email).
**Fix.** Send a confirmation link to the NEW address and only switch on confirmation; notify the OLD address with a revert link; bump `tokenVersion` on switch. **Effort:** S.

### M-07 — Mock driver is selectable in production
**Location:** `gateway/index.ts:11`, `mock-driver.ts:12-19` (`mockHmacSecret()` uses `PAYMOB_HMAC_SECRET` in production).
**Description.** C1 made `PAYMENTS_MODE` explicit and hid the mock-complete route, but `resolveDriver()` still returns the mock driver in production when the mode is `mock`, and `POST /api/v1/payments/paymob/webhook` will accept a mock-format body signed with the real HMAC secret. `onlineCheckoutAvailable()` blocks new intents, so today the only settleable intents are ones that already exist — but a deploy with `PAYMENTS_MODE=mock` and a leaked HMAC secret is a settlement oracle.
**Fix.** In `resolveDriver()`, throw when `NODE_ENV === "production" && mode === "mock"`; make the mock driver's `verifyWebhook` return invalid in production unconditionally. **Effort:** XS.

### M-08 — The back office writes money
**Location:** `center-money.ts:37` (`adminRecordPayment`), `:72` (`adminTopUpWallet`), `:104` (`adminCreateWalkInSubscription`), and `apps/superadmin/src/app/api/v1/finance/refunds/route.ts:23` (`refundLessonForStudent`, admits `accountant`).
**Description.** CLAUDE.md's binding invariant says money is read-only in `apps/superadmin` and the DB revokes bite for `super_admin` too. Measured: the revokes cover `transactions` (so the ledger rows these paths write go through `createMany`, allowed) but not `payments`, `wallet_ledger` or `centers.credit_balance`, and these four services write all three. They are audited (`writeAdminAudit`) and routed through the sanctioned `*Tx` functions, so this is policy drift rather than a hole — but the invariant that reviewers rely on is false as written.
**Fix.** Either update the invariant to "money writes in the back office go only through `superadminAsCenter` + the sanctioned Tx functions, audited", or remove these routes and use view-as. Also decide whether `accountant` should hold `refundLessonForStudent` (it credits wallets). **Effort:** XS (doc) / S (route removal).

### M-09 — CSP allows inline scripts; broken builds can deploy
**Location:** `apps/erp/next.config.ts:29`, `apps/superadmin/next.config.ts:26` (`script-src 'self' 'unsafe-inline'`); `apps/erp/next.config.ts:77` (`ignoreBuildErrors: true`); `apps/{erp,superadmin}/vercel.json` `buildCommand` treats a failed `bun run build` as success if `.next/BUILD_ID` exists.
**Description.** React escaping is the only XSS control; no `dangerouslySetInnerHTML` was found and the only MDX source is repo content, so exposure today is low — but the CSP is doing nothing against script injection, which matters most on the payment pages (iframe checkout, wallet). The build fallback is documented as a Bun segfault workaround, but it cannot distinguish a segfault from a real failure, and `ignoreBuildErrors` hides type regressions in money code.
**Fix.** Nonce-based `script-src` (Next supports it via middleware-generated nonces), remove `'unsafe-inline'`; gate the Vercel fallback on the specific segfault exit signature and `next build` having printed its completion line; drop `ignoreBuildErrors` (check-types already runs in CI). **Effort:** M for CSP, XS for the build flags.

### M-10 — Public deep mail health check
**Location:** `health.ts:37`, `apps/erp/src/app/api/health/route.ts:8`.
**Description.** `GET /api/health?deep=mail` is unauthenticated and unlimited; each call runs `verifySmtp()` (an SMTP handshake with credentials) and reports the result code.
**Impact.** Cheap amplification against the mail provider (rate-limit/lockout of the SMTP account, which is also the password-reset channel), and an oracle for mail configuration.
**Fix.** Require `CRON_SECRET`/`INTERNAL_API_SECRET` for `deep=`, or rate-limit it to 1/min per IP and remove the code from the response. **Effort:** XS.

### M-11 — Password-reset request hygiene
**Location:** `forgot/route.ts:21-22` (bucket 5, refill 60/min per IP), `password-reset.ts:19-33` (no per-email throttle; DB insert + email send only on hit; no role filter).
**Description.** (a) Sixty reset emails per minute per IP to one victim, unbounded token rows. (b) Response time differs between unknown and known email (bcrypt is not involved, but a token insert and an SMTP send are). (c) The ERP's public route issues reset links for `super_admin`/`accountant` accounts and the ERP reset endpoint sets their password — the two apps share one `users` table, so the ERP surface is a reset door for the back office.
**Fix.** Per-email bucket (e.g. 3/hour), constant-time path (always do the same work or always respond after a fixed delay), and refuse `SUPERADMIN_LOGIN_ROLES` in the ERP route (`canSignIn("www", role)`) so back-office resets only originate from the back office. **Effort:** S.

## 2.3 Low

- **L-01** `walletDebit`/`parentWalletDebit` read `walletBalance` after `updateMany` (`wallet.ts:75`); two concurrent debits record the same `balanceAfter`. Use `UPDATE … RETURNING` (as `creditMove` does) so the ledger's running balance is exact.
- **L-02** `Math.round(monthly.price / n)` (`distribution.ts:196`) and `Math.round(course.price / plannedSessions)` (`fees.ts:55`): over a period the distributed sum differs from the paid price by up to n/2 piasters. Distribute the remainder to the last lesson or keep a per-subscription "remaining" counter.
- **L-03** `generatePayouts` (`payouts.ts:115`) computes reserved amounts from open payouts without locking beneficiaries; two concurrent runs create duplicate pending rows (approval of the second fails on balance, but the queue is polluted). Take `pg_advisory_xact_lock` or a per-beneficiary `FOR UPDATE`.
- **L-04** `acceptInvite` checks `usedAt` then updates it (`invite-accept.ts:18,34`); use `updateMany where usedAt IS NULL` and treat `count === 0` as used (the invite-token plugin already does this at `:77`).
- **L-05** View-as replay check is a `findFirst` on `audit_logs.afterState.jti` (`view-as-plugin.ts:39`); add a unique index on a dedicated `view_as_claims(jti)` table or an expression index.
- **L-06** `POST /api/v1/temp-students/claim` has no `withRateLimit` (`claim/route.ts:12`); 40-bit codes are safe against brute force but a limiter costs nothing and the codes are also shown in UI.
- **L-07** `minPasswordLength: 1` (`auth.ts:73`, superadmin `:98`): registration and reset use `passwordSchema` (8 chars, letter, digit), so this only matters for better-auth's own set-password endpoints (sealed in the back office; check the ERP exposes none). Set it to 8 anyway.
- **L-08** `getGrade` (`grades.ts:140-148`) returns any grade's header (title, type, course id, max score) to any student; only scores are filtered. Require an active enrolment on `grade.courseId` for students, as `getMaterialDownloadUrl` does.
- **L-09** `expireSubscriptions` `take: 2000` (`subscriptions.ts:672`) — passes beyond the cap never expire; the same job cancels `pending_payment` subscriptions after 24 h even when their intent is still `pending` and inside its 1 h window (H-03 precondition). Paginate; only sweep subscriptions whose intent is not pending.
- **L-10** Gateway checkout creates a fresh `pending_payment` subscription before consulting the idempotency key (`subscriptions.ts:424-450`); repeated calls with the same key return the first intent but leave orphan subscriptions. Look up the intent first.
- **L-11** `assertSharedRateLimitStore` names `ALLOW_UNSHARED_RATE_LIMIT=1` in its error but never checks it (`require-shared-store.ts:22`). Either implement or drop the sentence.
- **L-12** `trustedClientIp` picks `x-forwarded-for[len - TRUSTED_PROXY_HOPS]`; on Vercel the hop count must be exactly right or a client-supplied XFF prefix becomes "the IP". Prefer `TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for` (or `x-real-ip`) on Vercel and assert it at boot next to `REDIS_URL`.
- **L-13** `.env-erp`, `.env-superadmin`, `.env-realtime`, `.env-www` at the repo root are `-rw-r--r--` while `.env.production` is `0600`; `chmod 600` them (local hygiene, not a product finding).

## 2.4 Info / dependency reachability

- **I-01** `bun audit` 2026-09-05: `mysql2` ×2 (via prisma/better-auth; MySQL not used, no import path), `qs` ×2 (via `@refinedev/core`; query strings are parsed by Next, not `qs`), `uuid` (via `exceljs`, back-office export of trusted data), `deepmerge-ts` (prisma CLI, build-time), `browserslist` ×2 (build-time). None sits on a request path that takes attacker-controlled input. Track, do not block on.
- gitleaks full history: clean (267 commits). No `.env` ever committed except examples.

## 2.5 Verified healthy (do not re-audit without a reason)

| Area | What was checked | Evidence |
|---|---|---|
| Server-side pricing | Every intent snapshots `course.price` / `pricePerMonth` / `pricePerSession` from the DB; the client sends ids and an idempotency key only | `payment-intents.ts:50-70`, `subscriptions.ts:34-60`, all four `initiate*` schemas are `.strict()` with `amount` only where it is a top-up bounded by `WalletSettings` |
| Integer money | `Int` piasters everywhere, `moneySchema` bounded `0…99 999 900`, no floats on any money column | `schema.prisma`, `validation/common.ts` |
| Webhook replay / idempotency | `updateMany where status='pending'` claim inside the same transaction as settlement; replay → `replay`/`not_pending` | `payment-intents.ts:258-283` |
| Webhook auth | HMAC over raw body, `timingSafeEqual`, secret required in production, 120/min IP limit | `mock-driver.ts:41-53`, `webhook/route.ts` |
| Wallet floors | Conditional decrement `walletBalance >= amount` in one statement; `FOR UPDATE` on the profile row for wallet checkouts and payout requests | `wallet.ts:59-74`, `subscriptions.ts:370-374`, `teacher-wallet.ts:77`, `center-wallet.ts:68` |
| Settlement | Row lock + atomic `distributedAt` claim; refuses unpriced lessons; per-student ledger rows; settled lessons block cancel/postpone/attendance edits | `distribution.ts:204-248`, `session-actions.ts:56,133`, `attendance.ts:125,306` |
| Refund bound | `refunded_total` bumped conditionally + DB CHECK; reversal rows negative-only by CHECK; one refund per ledger row by partial unique | `refund-payment.ts:188-192`, migrations `20260906`/`20260907`/`20260908` |
| Payout request | Locked, idempotent by `clientRequestId`, available = balance − open payouts | `teacher-wallet.ts:70-145`, `center-wallet.ts:59-115` |
| Centre-side IDOR | Every centre mutation reads the row then `requireCenterScope`/`centerId` filter; RLS `tenant_isolation` on `courses`, `payments`, `enrollments`, `transactions`, … for `center_admin`; `centerStaff` re-keys staff to their centre and makes `center_accountant` read-only | §2.2 M-01 is the only miss found across 84 parametrised routes |
| Teacher/assistant IDOR | `delegated` resolves the single active assistant→teacher; grades, materials, sessions, blacklist, collaboration all check `teacherId === user.id` | `grades.ts:182,201,215`, `materials.ts:284,353`, `session-actions.ts:52,131` |
| Student/parent IDOR | payments, receipts, wallet, subscriptions, attendance, data-rights, student card, checklist all check self or approved parent link; messaging goes through `@repo/database/chat` participant checks | `payments.ts:205-230`, `wallet.ts:resolveWalletSubject`, `data-export.ts:24-40`, `chat-groups.ts:497,583` |
| Mass assignment | Every mutating route parses a zod schema (46 body-less action routes confirmed to ignore the body); role/status/balance/split fields are never accepted from ERP clients; back-office spreads (`...input`) are over `.strict()` schemas | §Phase 1 inventory, grep of `passthrough|z.record|...body` |
| Auth kernel | bcrypt cost 10 with dummy-hash compare, per-IP and per-email login buckets, DB sessions with `token_version` revocation, 2FA, sealed admin endpoints, separate secrets/cookies per app, role→app login policy | `auth.ts` (both), `login-policy.ts`, `passwords.ts` |
| Tokens | Reset/invite/guardian tokens are 256-bit random, stored as SHA-256, TTL'd, single-use; view-as tokens HMAC-signed, 60 s, single-target, session capped at 1 h from `created_at` | `utils/random.ts`, `invite-token.ts:66-81`, `view-as-token.ts` |
| Uploads | Magic-byte sniffing (JPEG/PNG/WebP/GIF/AVIF), 4 MB images, `%PDF` + 10 MB for materials, Cloudinary signed uploads, signed time-limited raw URLs (1 h), no SVG | `media/images.ts`, `materials.ts:21-26`, `cloudinary.ts:122-126` |
| Logging / PII | Sentry `sendDefaultPii: false` with `beforeSend`/`beforeBreadcrumb` scrubbers; no console output of passwords/tokens; secrets compared via SHA-256 + `timingSafeEqual` | `observability/sentry-options.ts:67-77`, `secret-compare.ts` |
| Injection | No `$queryRawUnsafe`/`Prisma.raw`; all raw SQL is tagged-template; no `dangerouslySetInnerHTML`; CSV export neutralises `= + - @ \t \r` prefixes; no redirects built from user input | greps in §Phase 2 |
| Cron / internal | `CRON_SECRET` fails closed in every environment; POST-only; internal bridge secret-gated with a 256 KB body cap | `cron/[job]/route.ts:19-26`, `realtime/internal.ts` |
| Realtime | 60 s HS256 JWT with audience/issuer; per-user message limiter; 64 KB socket buffer; production CORS allow-list refuses loopback | `realtime/token/route.ts`, `realtime/env.ts` |
| Card data | No PAN/CVV/expiry field, column or log anywhere; checkout is provider-hosted iframe/redirect (`frame-src https://accept.paymob.com`) | schema + grep |


---

## Appendix A — PoC test cases (written, NOT run, NOT placed under `tests/`)

Each file follows the repo's own DB-suite shape (`assertDbEnv(["test"])`, `sweepTagQuietly`, tagged fixtures) so it can be dropped into `apps/erp/tests/db/` on approval. Each is written so that it FAILS on the current code and PASSES once the finding is fixed — the same "<<SUCCEEDED>> against the previous service" convention M5 used. None performs a destructive action beyond its own tagged fixtures. The full source of each file is embedded below; that is the only durable copy (the audit session's scratchpad is temporary).

### A-1 — H-01 wallet top-up refund double-spend

`poc-h01-wallet-topup-refund.test.ts`

```ts
// PoC for SECURITY_AUDIT.md H-01 — refunding a cash wallet top-up returns cash
// while the wallet keeps the credit. NOT RUN by the audit. Shape mirrors
// apps/erp/tests/db/refund-bound.test.ts so it can be dropped into tests/db.
//
// Expected TODAY (vulnerable): both asserts in [3] FAIL — the refund succeeds
// and walletBalance is still 50000 after 500 EGP cash was handed back.
// Expected AFTER the fix: refundPayment throws, or walletBalance becomes 0.
import { withPlatformContext } from "@repo/database";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { refundPayment } from "@repo/server-core/services/payments/refund-payment";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h01-wallet-topup-refund.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e; } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "h01-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: `${tag.toUpperCase()}F0` } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
    return { owner: owner.id, center: center.id, student: stu.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  console.log("\n[1] counter takes 500 EGP cash and credits the wallet");
  const topup = await topUpWalletCash({ studentId: fx.student, amount: 50000 }, owner);
  assert(topup.balanceAfter === 50000, "wallet balance is 500 EGP");
  const receipt = await withPlatformContext((tx) => tx.payment.findFirstOrThrow({ where: { receiptNumber: topup.receiptNumber } }));

  console.log("\n[2] the same counter 'refunds' the top-up receipt through the ordinary refund door");
  const err = await caught(() => refundPayment({ paymentId: receipt.id, amount: 50000, reason: "poc", refundChannel: "cash_drawer" }, owner));

  console.log("\n[3] what the books say afterwards");
  const wallet = await withPlatformContext((tx) => tx.studentProfile.findUniqueOrThrow({ where: { userId: fx.student }, select: { walletBalance: true } }));
  const ledgerDebits = await withPlatformContext((tx) => tx.walletLedger.count({ where: { studentId: fx.student, delta: { lt: 0 } } }));
  assert(err !== null, "refund of a wallet top-up receipt is REFUSED (or debits the wallet)");
  assert(wallet.walletBalance === 0 || err !== null, `wallet is not still spendable after cash left the drawer (balance=${wallet.walletBalance}, wallet debits=${ledgerDebits})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });

```

### A-2 — H-02 shell merge by phone

`poc-h02-shell-merge-by-phone.test.ts`

```ts
// PoC for SECURITY_AUDIT.md H-02 — public registration merges into a walk-in
// shell by PHONE with no proof of control. NOT RUN by the audit.
//
// Expected TODAY (vulnerable): assert in [2] FAILS — the attacker's new account
// IS the shell (same user id), so the shell's wallet/roster/history are theirs.
import { withPlatformContext } from "@repo/database";
import { registerStudent } from "@/lib/services/auth/register"; // apps/erp alias
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h02-shell-merge-by-phone.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "h02-" + rid(); __sweepTag = tag;
  const victimPhone = "0100" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");

  console.log("\n[1] a centre registers a walk-in child by phone (shell, no password) and tops up their wallet");
  const shell = await withPlatformContext(async (tx) => {
    const u = await tx.user.create({ data: { name: `${tag}-child`, role: "student", phone: victimPhone, status: "shell", email: null } });
    await tx.studentProfile.create({ data: { userId: u.id, fullName: `${tag}-child`, familyLinkCode: `${tag.toUpperCase()}F0`, walletBalance: 25000 } });
    return u;
  });
  assert(shell.status === "shell", "child exists as a shell with 250 EGP in the wallet");

  console.log("\n[2] a stranger registers with the child's phone number and their own email + password");
  const res = await registerStudent({ email: `${tag}-attacker@x.io`, password: "Attack3rPass", name: "Mallory", phone: victimPhone });
  assert(res.userId !== shell.id, "registration MUST create a new account, not activate the child's shell in place");

  const after = await withPlatformContext((tx) => tx.user.findUniqueOrThrow({ where: { id: shell.id }, select: { status: true, email: true, passwordHash: true } }));
  assert(after.status === "shell" && after.passwordHash === null, "the child's shell is untouched (still shell, no password set by a stranger)");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });

```

### A-3 — H-03 orphaned capture

`poc-h03-orphaned-capture.test.ts`

```ts
// PoC for SECURITY_AUDIT.md H-03 — a successful webhook for an intent whose
// subscription was cancelled is marked `paid` and books NOTHING. NOT RUN.
// Runs with PAYMENTS_MODE=mock (default outside production).
//
// Expected TODAY (vulnerable): asserts in [3] FAIL — intent.status === "paid",
// zero payments rows, zero transactions rows, subscription still cancelled.
import { withPlatformContext } from "@repo/database";
import { createSubscriptionCheckout, cancelPendingSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent, processWebhookEvent } from "@/lib/services/payments/payment-intents"; // apps/erp alias
import { signMockWebhook, resolveDriver } from "@/lib/services/payments/gateway";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h03-orphaned-capture.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "h03-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: `${tag.toUpperCase()}F0` } });
    return { course: course.id, student: stu.id };
  });
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;

  console.log("\n[1] student starts a card checkout (pending subscription + pending intent)");
  const intent = (await createSubscriptionCheckout({ courseId: fx.course, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: `${tag}-key-000001` }, student, initiateSubscriptionIntent)) as { id: string };
  const row = await withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }));
  assert(row.status === "pending" && !!row.subscriptionId && !!row.gatewayOrderId, "intent is pending and linked to a pending subscription");

  console.log("\n[2] student cancels the unpaid subscription in the app (or the 24h sweep does) — then the provider's success webhook arrives");
  await cancelPendingSubscription(row.subscriptionId!, student);
  const rawBody = JSON.stringify({ gateway_order_id: row.gatewayOrderId, success: true, gateway_ref: `poc_${tag}` });
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  const outcome = await processWebhookEvent(v.event, JSON.parse(rawBody));

  console.log("\n[3] what the books say afterwards");
  const after = await withPlatformContext(async (tx) => ({
    intent: await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }),
    payments: await tx.payment.count({ where: { studentId: fx.student } }),
    txns: await tx.transaction.count({ where: { fromEntityId: fx.student } }),
    sub: await tx.subscription.findUniqueOrThrow({ where: { id: row.subscriptionId! } }),
  }));
  console.log("   outcome:", JSON.stringify(outcome), "intent:", after.intent.status, "payments:", after.payments, "txns:", after.txns, "sub:", after.sub.status);
  assert(!(after.intent.status === "paid" && after.payments === 0 && after.txns === 0), "a captured payment is NEVER marked paid with zero payment and zero ledger rows");
  assert(after.sub.status === "active" || after.payments > 0, "the money either activates the subscription or is recorded somewhere the customer can see");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });

```

### A-4 — M-01 (no fixture needed; one HTTP call)

Sign in as any `center_staff` (receptionist) of centre A. Take a session id from centre B (any exported report, QR link, or a UUID seen in another centre's URL) and request:

```bash
curl -s -b "$STAFF_COOKIE" "$ERP/api/v1/sessions/$OTHER_CENTER_SESSION_ID/attendance"
```

Current behaviour: 200 with `records[]` (student ids + statuses), `coverage[]` (who has paid). Expected after fix: 403. The same call against `/api/v1/sessions/$ID` returns the session row.

### A-5 — M-02 (race; two parallel checkouts)

```bash
for k in 1 2; do
  curl -s -b "$STUDENT_COOKIE" -H 'content-type: application/json' \
    -d "{\"courseId\":\"$COURSE\",\"plan\":\"monthly\",\"method\":\"card\",\"idempotencyKey\":\"race-$k-$RANDOM$RANDOM\"}" \
    "$ERP/api/v1/subscriptions/checkout" & done; wait
```

Both return 201 with distinct intent ids. Complete both (mock: `POST /api/v1/payments/intents/{id}/mock-complete` with `{"outcome":"success"}` — non-production only). Current behaviour: two `active` monthly subscriptions for the same course and student, two `payments` rows. Expected after fix: the second settlement is refused/credited, one active subscription.

---

# Phase 3 — Remediation plan and payment-integration design

**Status:** Phase 3 written 2026-09-06 against the same working tree Phase 2 audited (`079f52f` + uncommitted refund work). Every file:line below was re-read while writing this section, not copied from Phase 2. Three Phase 2 claims turned out to be partly wrong against the live schema and are corrected in §3.2 before anything is planned on top of them. No code was changed while writing this section; the PoC files were placed under `apps/erp/tests/db/` (§3.6) and NOT run.

## 3.1 Must-fix checklist

Three gates, in the order the money arrives. A gate is "closed" only when every line under it is Fixed in the Status table (§4, written after remediation).

**Gate A — before any real money moves (cash counter is already live-ready; these bite today):**

- [ ] H-01 refund of a wallet top-up must debit the wallet in the same transaction or be refused.
- [ ] H-02 public registration must not activate a shell by phone/email match; the walk-in claim link and the temp-student invite code are the only merge doors.
- [ ] M-01 `center_staff` scoped to their own centre on `GET /api/v1/sessions/[id]` and `GET /api/v1/sessions/[id]/attendance`.
- [ ] M-04 `REVOKE UPDATE, DELETE` on the three wallet ledgers and `REVOKE DELETE` on `payments` (migration 76), `Payment` + `CenterWalletLedger` in the ORM guards, verify-db extended.
- [ ] M-07 mock driver refuses to exist in production.
- [ ] M-08 back-office money invariant rewritten to match what the code does (doc), `accountant` removed from `POST /api/v1/finance/refunds`.
- [ ] M-11 forgot-password: per-email bucket, back-office roles refused on the ERP route, constant-shape response.
- [ ] M-06 login-email change confirmed at the new address, old address notified.
- [ ] M-10 deep mail health check behind a secret.
- [ ] L-04, L-06, L-07, L-08, L-13 (small hygiene; all XS).

**Gate B — before `PAYMENTS_MODE=live` (Paymob):**

- [ ] H-04 webhook contract carries amount, currency, kind, integration id; settlement refuses anything but an exact-amount capture (§3.3.1).
- [ ] H-03 a captured intent is never left without a money row: late capture settles, cancelled-subscription capture is re-activated or credited, a settle that writes nothing fails the claim (§3.3.3).
- [ ] M-02 gateway checkout serialises per student; the settle re-checks the duplicate rule and routes a clash to the H-03 credit path instead of a P2002 rollback (§3.2 correction).
- [ ] M-05 refund executor + refund webhook (§3.3.2); until the driver ships, `gateway` refused at the API enum, not only hidden in the picker.
- [ ] L-09 stale-pending sweep must not cancel a subscription whose intent is still payable; per-session expiry paginated.
- [ ] L-10 checkout consults the idempotency key BEFORE creating a subscription row.
- [ ] L-01 wallet `balanceAfter` from `UPDATE … RETURNING`.
- [ ] L-02 rounding remainder assigned, not dropped.
- [ ] L-12 `TRUSTED_CLIENT_IP_HEADER` asserted at boot on Vercel.

**Gate C — before public launch:**

- [ ] M-03 payout maker-checker: `approved` and `paid` are two acts by two people with an external reference (needs a product decision, §3.5).
- [ ] M-09 nonce CSP, `ignoreBuildErrors` off, Vercel fallback narrowed.
- [ ] L-03 payout generation lock, L-05 view-as `jti` unique, L-11 dead env sentence removed.
- [ ] Full DB suites + unit suites + `bun audit` green; Status table filled; risk rating re-issued.

## 3.2 Corrections to Phase 2, found while re-reading for the plan

These change what is built. Each was measured on the local `edura_test` database, which is at the same 75 migrations as production (`expected-db-shape.json`).

1. **M-02 — the partial unique indexes ALREADY EXIST.** `subs_one_active_monthly ON subscriptions (student_id, course_id) WHERE status='active' AND plan='monthly'` and `subs_one_active_pass ON subscriptions (student_id, session_id) WHERE status='active' AND plan='per_session'` were created by migration `20260719120000_subscriptions:72-74`. Phase 2 said no such index existed. So the failure mode is different from the one described: two concurrent gateway checkouts still both produce `pending_payment` rows and two intents, the student pays both, the FIRST webhook settles, and the SECOND webhook's `activateSubscription` (`subscriptions.ts:148`) hits P2002 inside `processWebhookEvent`'s transaction — the whole claim rolls back, the route 500s, the provider retries forever, and **the second capture is money with no row**, i.e. an H-03 case rather than a duplicate-active case. The fix keeps its shape (lock the student on the gateway path, re-check inside the settle) but drops the "add two indexes" step and adds "route the clash to the H-03 credit path". No migration.
2. **M-04 — the wallet floors ALREADY EXIST.** `student_profiles_wallet_balance_nonneg CHECK (wallet_balance >= 0)` (migration `20260722000100_student_wallet:11-12`) and `parent_profiles_wallet_balance_nonneg` (`20260727110100_parent_wallet:21-22`) are present and VALIDATED. Phase 2's "no DB floor on student/parent wallet balances" is wrong. The REVOKE half is confirmed exactly as stated — `payments`, `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger`, `payment_intents`, `subscriptions` all grant `DELETE,INSERT,SELECT,UPDATE` to `edura_app` — and the student-wallet migration itself says at `:41-43` that the REVOKE was "deliberately NOT" applied yet and is "a launch-hardening step". M-04 is that step. The fix drops the CHECK part.
3. **M-05 — the UI half is already done.** `admin-fees-screen.tsx:64-68` types `gateway` as a channel that can be *displayed* but the picker offers only `cash_drawer` and `bank_transfer`. What remains open is exactly the API: `refund/route.ts:19` accepts `z.enum(COUNTER_REFUND_CHANNELS)` which includes `gateway`, so a hand-built request still arms an unconfirmable refund. The interim fix is one line at the API; the real fix is §3.3.2.
4. **M-01 — an existing suite covers the SERVICE, not the ROUTE.** `apps/erp/tests/db/sessions-staff-scope.test.ts` proves `authorizeCenterActor` re-keys staff to their centre and that an explicit `courseId IN (centre's courses)` filter is load-bearing because RLS does not scope `sessions`. `GET /api/v1/sessions` (the list, `sessions/route.ts:18-25`) already does this. The two `[id]` routes do not. So the fix is to make the `[id]` routes do what the list route already does; the PoC (A-4, now a test file) targets the routes' branching logic.
5. **M-08 — the accountant clawback route exists and admits `accountant`.** `apps/superadmin/src/app/api/v1/finance/refunds/route.ts:23` is untracked (part of the uncommitted refund work) and passes `["accountant", "super_admin"]`. `refundLessonForStudent` credits a wallet through `creditRefundTarget`. This is the one back-office money write that is NOT routed through `superadminAsCenter` + a sanctioned centre Tx function, so it is the one the rewritten invariant cannot describe away.

## 3.3 Payment-integration design (Paymob), for THIS codebase

Everything below is written against `apps/erp/src/lib/services/payments/gateway/{types,index,mock-driver,paymob-driver}.ts` and `payment-intents.ts`. Amounts are integer piasters throughout; Paymob's `amount_cents` is the same unit.

### 3.3.1 Webhook contract

**Today** (`gateway/types.ts:15-20`): `WebhookEvent = { gatewayOrderId, success, gatewayRef, reason }`. Settlement books `intent.amount` on `success === true` (`payment-intents.ts:258-295`).

**Required shape:**

```ts
export type WebhookEventKind = "capture" | "auth" | "void" | "refund" | "pending" | "failed";

export type WebhookEvent = {
  gatewayOrderId: string;      // Paymob obj.order.id  (mock: gateway_order_id)
  gatewayRef: string | null;   // Paymob obj.id — the TRANSACTION id, unique per event
  kind: WebhookEventKind;      // derived, see table
  success: boolean;            // obj.success && !obj.pending
  amountMinor: number;         // obj.amount_cents (integer)
  currency: string;            // obj.currency ("EGP")
  integrationId: string | null;// obj.integration_id
  parentRef: string | null;    // obj.parent_transaction — the capture a refund/void reverses
  reason: string | null;       // obj.data.message / acq_response_code text
  occurredAt: Date | null;     // obj.created_at
};
```

Paymob field → kind derivation (all flags are on `obj`):

| Paymob flags | kind |
|---|---|
| `is_refunded=true` (or `is_refund`), `parent_transaction` set | `refund` |
| `is_voided=true`, `parent_transaction` set | `void` |
| `is_auth=true`, `is_capture=false` | `auth` (never settles) |
| `pending=true` | `pending` (never settles; store payload only) |
| `success=true`, `is_capture=true` or `is_standalone_payment=true` | `capture` |
| `success=false` | `failed` |

Verification (Paymob driver): HMAC-SHA512 keyed by `PAYMOB_HMAC_SECRET` over the concatenation, in this fixed lexicographic order, of `amount_cents, created_at, currency, error_occured, has_parent_transaction, id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided, order.id, owner, pending, source_data.pan, source_data.sub_type, source_data.type, success`, compared with `timingSafeEqual` against the `hmac` query parameter (the mock driver already signs the raw body the same way; keep the query-string carriage). `type` must equal `"TRANSACTION"`; `TOKEN` and `DELIVERY_NEEDED` callbacks are acknowledged with 200 and ignored.

**Settlement rule in `processWebhookEvent`** — settle if and only if ALL hold:

1. `event.kind === "capture" && event.success`
2. `event.amountMinor === intent.amount`
3. `event.currency === intent.currency`
4. `PAYMOB_INTEGRATION_IDS` (comma-separated env, required when `PAYMENTS_MODE !== mock`) contains `event.integrationId`
5. the intent is `pending` or `expired` (§3.3.3 — an expired intent that the provider captured is still real money)

Anything else is **acknowledged (HTTP 200, so the provider stops retrying) and recorded, never settled**: `kind: failed` → intent `failed` with `failureReason`; `kind: pending|auth` → payload appended, status unchanged; `kind: refund|void` → §3.3.2; a `capture` failing rules 2–4 → intent `needs_review` (new enum value, migration 76) with `failureReason = "amount_mismatch: got X expected Y"` / `currency_mismatch` / `unknown_integration`, an `audit_logs` row `payment.webhook_rejected`, and a `notify` to finance. Nothing books money on a mismatch, because the provider dashboard is then the only truth and a human has to look. The webhook rate limit (120/min/IP) and the raw-body HMAC stay as they are.

The mock driver gains the same fields (`amount_cents`, `currency`, `kind`) so tests exercise the same rule; `mock-complete` sends the intent's own amount, and a new PoC sends a wrong one and asserts `needs_review`.

### 3.3.2 Refund executor and refund webhook

**Today:** `refundPaymentTx` accepts `refundChannel: "gateway"` (`refund-payment.ts:18`), writes the negative `payments` row and a `pending` ledger row, and `confirmRefund` refuses `gateway` because "the webhook confirms it" (`:377-381`) — but no code calls a provider and `processWebhookEvent` has no refund branch. Such a refund is unconfirmable forever (M-05).

**Design:**

1. `PaymentGatewayDriver` gains `refund(input: { gatewayRef: string; amountMinor: number; merchantRefundRef: string }): Promise<{ providerRefundId: string }>`. Paymob: `POST /api/acceptance/void_refund/refund` with `transaction_id = intent.gatewayRef`, `amount_cents`. `merchantRefundRef` is the refund `payments.id` — the idempotency handle if the provider supports one, and our own retry key regardless.
2. `refundPaymentTx` for `gateway` requires the original receipt to be `paymentMethod: "online_paymob"` and to have a `payment_intents` row with a `gatewayRef` (`payment_intents.payment_id = original.id`); a cash receipt cannot be refunded "via gateway". It writes exactly what it writes today (armed obligation), then returns an **effect** that runs after commit: call `driver.refund(...)`; on success `UPDATE payments SET refund_gateway_ref = providerRefundId WHERE id = refund.id` (new nullable column, migration 76 — it cannot reuse `refund_external_ref`, because `payments_refund_confirmation_complete` requires `refund_external_ref` to be set together with `refund_confirmed_at`/`_by` or not at all; a provider id known before confirmation needs its own column); on failure, an `audit_logs` row `payment.refund_gateway_failed` + finance notification, row left with `refund_gateway_ref IS NULL`.
3. A cron job `retry-gateway-refunds` (existing `cron/[job]` switch) re-issues `driver.refund` for `refund_channel='gateway' AND refund_gateway_ref IS NULL AND refund_confirmed_at IS NULL AND created_at > now()-7d`, same merchant ref, so a provider outage does not strand a refund.
4. **Refund webhook** (`kind: "refund"`): resolve the ORIGINAL intent by `gatewayOrderId`, then the armed refund row by `refund_gateway_ref = event.gatewayRef` (or, if the provider echoes only the parent, by `reversal_of_id = intent.payment_id AND refund_channel='gateway' AND refund_confirmed_at IS NULL AND -amount = event.amountMinor`). If found: run the existing confirmation write — `refund_external_ref = event.gatewayRef`, `refund_confirmed_at = now()`, `refund_confirmed_by = refund.recorded_by` (the operator who armed it; the evidence is the provider id, and the CHECK needs a user), append the `adjustment` ledger row exactly as `confirmRefund` does — factored into a shared `confirmRefundTx(tx, refund, ref, byUserId)` so the human path and the webhook path are one function. `payments_refund_external_ref_unique` already stops one provider refund id confirming two rows. If NO armed refund matches (a refund issued from the Paymob dashboard by hand): do NOT invent a refund row; write `audit_logs` `payment.unsolicited_refund` + notify finance, 200.
5. `kind: "void"` (auth reversed before capture): if the intent is `pending`/`expired` → `failed` with reason `voided`; if `paid` → same handling as an unsolicited refund (a void after capture is a refund we did not arm).
6. `confirmRefund` keeps refusing `gateway` from a human. The counter UI keeps not offering it. **Interim (before the driver ships):** `refund/route.ts:19` narrows to `z.enum(["cash_drawer","bank_transfer"])` and `COUNTER_REFUND_CHANNELS` drops `gateway`, so the unconfirmable state cannot be created at all.

### 3.3.3 Late capture and cancelled-subscription handling

**Today:** `processWebhookEvent` claims `status='pending'` only (`payment-intents.ts:258-259`). `settleSubscriptionFromIntentTx` returns `null` when the subscription is not `pending_payment` (`subscriptions.ts:461`) — after the claim already flipped the intent to `paid` inside the same transaction. `expirePaymentIntents` flips `pending → expired` at 1 h (`:383-391`); `expireSubscriptions` cancels `pending_payment` rows older than 24 h regardless of the intent (`:688-694`).

**Rules:**

1. **The claim accepts `pending` OR `expired`.** Intent expiry is a checkout-window hint for the UI, not a money boundary; if the provider captured, the money is real. A capture on an `expired` intent settles normally, with `audit_logs` `payment.captured_after_expiry` so finance can see how often it happens. Paymob's own checkout expiry should be set to the same 1 h so this stays rare.
2. **Every `settle` callback returns `{ paymentId }` and the claim asserts it.** If a settle path returns without a `payments` row, throw — the transaction rolls back, the intent stays `pending`, the provider retries, and the failure is a Sentry event with the intent id, not a silent `paid`. This is the guard that makes the rest of this list enforceable.
3. **Subscription no longer `pending_payment` at settle time** (student cancelled it; the 24 h sweep cancelled it; a sibling checkout won the race, §3.2/1):
   - if `cancelled` AND the course is still `active` AND `assertNoDuplicateActive` passes for its plan → **re-activate it**: `status: active`, `activatedAt`, period from now. The customer paid for coverage; give them coverage. Audit `subscription.reactivated_by_capture`.
   - otherwise → **credit the payer** using the existing `resolveRefundTarget` rule (parent wallet if `intent.payerUserId`, else student wallet): write the `payments` row (`courseId` inherited, `note: "Orphaned capture — credited to wallet"`), the `transactions` row (`fromEntityId = studentId`, `toEntityId = null`, platform-held, same shape as a wallet top-up), and the wallet ledger row (`type: "adjustment"`, `paymentIntentId`), set `payment_intents.payment_id`, notify the payer AND finance, audit `payment.orphan_capture_credited`. The intent is `paid`. A customer who can see the balance and finance who can see the row is the whole point.
   - a settle clash cannot be *caught* — a P2002 inside a Postgres transaction aborts it — so it is *prevented*: the settle takes `FOR UPDATE` on the student profile row and re-runs `assertNoDuplicateActive` under that lock for BOTH `pending_payment` and `cancelled`; a duplicate takes the credit branch.
4. **The stale-pending sweep only cancels a `pending_payment` subscription whose intent is NOT payable**: `paymentIntentId IS NULL`, or the intent's `status IN (failed, expired)` and `expiresAt < now() - 24h`. A subscription whose intent is still `pending` and unexpired is left alone (L-09).
5. `cancelPendingSubscription` (student/parent, `subscriptions.ts:639-658`) leaves the intent ALONE. (An earlier draft of this rule marked it `failed`; that was withdrawn during implementation because a customer who cancels in one tab and then completes the iframe in another has *paid*, and a terminal `failed` intent would turn that capture into precisely the silent loss this finding describes.) The provider decides whether money moved; a capture after cancel goes through rule 3 and ends as re-activation or a wallet credit, never as nothing. A capture for a genuinely `failed` intent (declined, then somehow captured) stays `not_pending` today and becomes `needs_review` with H-04.

### 3.3.4 State machines

**`payment_intents.status`** (enum `payment_intent_status`; migration 76 adds `needs_review`):

| From | To | Trigger | Writes money? |
|---|---|---|---|
| `pending` | `paid` | capture webhook passing all 5 rules | yes (settle) |
| `pending` | `failed` | `kind: failed` webhook; `kind: void`; payer cancels the pending subscription | no |
| `pending` | `expired` | cron `expire-payment-intents` at `expiresAt` | no |
| `pending` | `needs_review` | capture with amount/currency/integration mismatch | no |
| `expired` | `paid` | late capture (rule 1) | yes + audit |
| `expired` | `needs_review` | late capture with a mismatch | no |
| `paid` | `paid` | replay (same or different `gatewayRef` for the same order) | no (`replay`) |
| `needs_review` | `paid` / `failed` | superadmin resolution route (Gate B follow-on), audited | yes / no |
| `failed` | — | terminal; a later capture → `needs_review` on a NEW audit row, intent unchanged | no |

**`subscriptions.status`** (`pending_payment` / `active` / `expired` / `cancelled`; no enum change):

| From | To | Trigger |
|---|---|---|
| `pending_payment` | `active` | settle (gateway capture, wallet debit, counter cash) |
| `pending_payment` | `cancelled` | payer cancels; stale sweep (only when the intent is not payable) |
| `cancelled` | `active` | late/orphan capture re-activation (rule 3, course still active, no duplicate) |
| `active` | `expired` | cron at `periodEnd` (monthly) / session date passed (per-session) |
| `active` | `cancelled` | full refund (`refundPaymentTx`, existing) |
| `expired` | — | terminal (a renewal is a new subscription) |

**`payments` refund row** (columns, not an enum — `refund_confirmed_at` is the state):

`armed` (`reversal_of_id` set, `refund_channel` set, `refund_confirmed_at NULL`) → `executed` (gateway only: `refund_gateway_ref` set) → `confirmed` (`refund_confirmed_at`, `_by`, `refund_external_ref` set together, `adjustment` ledger row appended). Human confirmation for `cash_drawer`/`bank_transfer`; webhook confirmation for `gateway`. There is no "cancel a refund" transition: an armed refund that will not be paid is corrected by a second refund of the original? No — an armed refund is a promise; withdrawing it is a product decision recorded in §3.5, default is that it cannot be withdrawn, only confirmed.

**`payouts.status`** (M-03 target; `approved` already exists in the enum):

| From | To | Who | Evidence |
|---|---|---|---|
| `pending` | `approved` | `accountant` or `super_admin`, NOT the user whose audit row generated this payout | none (a decision, no money) |
| `approved` | `paid` | a DIFFERENT user than `approved_by`, `super_admin` or second `accountant`, fresh 2FA | `external_ref` required, unique per payout (new column, migration 76); wallet decrement + ledger row happen HERE |
| `pending`/`approved` | `rejected` | accountant/super_admin | reason |
| `pending`/`approved` | `cancelled` | beneficiary (existing `payout-cancel`) | — |

## 3.4 Fix plan, every finding

Effort: XS ≤ 1 h, S ≤ half day, M ≤ 2 days. "Mig" = needs a migration (stop and ask). "Dec" = needs a product decision (stop and ask). Tests named are the ones each fix must turn green; the PoCs are in `apps/erp/tests/db/poc-*.test.ts`.

| ID | Files | Change | Effort | Stop? |
|---|---|---|---|---|
| H-01 | `packages/server-core/src/services/payments/refund-payment.ts` (after the `subs` lookup, before the bound); `packages/server-core/src/services/wallet/wallet.ts` (export a `walletDebit` variant that takes `paymentId` + `type: "refund"`); `apps/erp/tests/db/poc-h01-wallet-topup-refund.test.ts`; `refund-bound.test.ts` (+1 case) | Detect a funded wallet: `walletLedger.findFirst({ paymentId: original.id, type: "topup" })`. If found: `refund-target` rule picks the wallet (student here — cash top-ups have no payer), `walletDebit` for `input.amount` with `type: "refund"`, `paymentId: refund.id`, `reason`; the existing `INSUFFICIENT_WALLET` refusal becomes "wallet no longer holds the top-up — refund refused". Partial top-up refunds allowed (debit the partial). Same `tx`. | S | no |
| H-02 | `apps/erp/src/lib/services/auth/register.ts:56-67` (student), `:135-136` (parent), `:194-195` (teacher), `:283` (center); `apps/erp/tests/db/poc-h02-shell-merge-by-phone.test.ts`; `registration-doors.test.ts` | Remove the email and phone shell lookups. Keep ONLY the `inviteCode` branch, and make it check `studentProfile.entityType === "invited"` and the code (already 40-bit, single-use — set `inviteCode: null` on merge). On email/phone collision with a shell: `ensureUniqueUnshelled` now also refuses shells with a message that names the door ("This phone is registered at a centre — use the link the centre sent you"). Parent/teacher/center shell merges by email are the same hole with a smaller blast radius: same removal; invite-token claim (`invite-accept.ts`) is their door. **Decision:** whether to add phone OTP now (CLAUDE.md defers OTP) or ship token-only gating. | S (token-only) / M (OTP) | Dec |
| H-03 | `apps/erp/src/lib/services/payments/payment-intents.ts:256-297`; `packages/server-core/src/services/subscriptions/subscriptions.ts:454-492` (settle), `:639-658` (cancel), `:688-694` (sweep); `packages/server-core/src/services/wallet/refund-target.ts` (reuse); `apps/erp/tests/db/poc-h03-orphaned-capture.test.ts`; `m1-webhook-atomicity.test.ts` (+ late-capture case) | §3.3.3 rules 1–5: claim on `pending|expired`; settle callbacks return `{paymentId}` and the claim throws when absent; cancelled-sub capture → re-activate or credit payer; cancel marks the intent failed; sweep respects payable intents. | M | Mig (only if `needs_review` is added in the same commit; the H-03 core needs no schema) |
| H-04 | `apps/erp/src/lib/services/payments/gateway/types.ts`, `mock-driver.ts`, `paymob-driver.ts` (real `verifyWebhook` + field mapping; `createCheckout` stays a stub until credentials exist), `payment-intents.ts` (rules 1–5), `apps/erp/src/app/api/v1/payments/intents/[id]/mock-complete/route.ts` (send amount/currency); new `apps/erp/tests/unit/webhook-contract.test.ts` (Paymob HMAC vector, kind derivation, mismatch refusal); new `apps/erp/tests/db/poc-h04-webhook-amount.test.ts` | §3.3.1. `needs_review` enum value. `PAYMOB_INTEGRATION_IDS` env (required when mode ≠ mock). | M | Mig (`ALTER TYPE payment_intent_status ADD VALUE 'needs_review'`) |
| M-01 | `apps/erp/src/app/api/v1/sessions/[id]/route.ts:13-52`, `sessions/[id]/attendance/route.ts:20-38`; new `apps/erp/tests/db/poc-m01-staff-session-idor.test.ts` | Resolve `center_staff` through `authorizeCenterActor` exactly as `sessions/route.ts:18-25` does, so the `center_admin` branch fires with the staff member's centre; add a terminal `else throw new ForbiddenError()` to both role chains. `getSessionAttendance` is then called with the re-keyed user. | XS | no |
| M-02 | `packages/server-core/src/services/subscriptions/subscriptions.ts:424-447` (gateway branch), `:454-492`; `apps/erp/tests/db/poc-m02-concurrent-checkout.test.ts` | `SELECT … FOR UPDATE` on `student_profiles` in the gateway branch (same statement the wallet branch uses at `:373`), `assertNoDuplicateActive` extended to count `pending_payment` rows with a live intent as a clash ("you already have a checkout in progress"), and the settle re-runs `assertNoDuplicateActive`; a clash at settle → H-03 credit branch. No index work (§3.2/1). | S | no |
| M-03 | `apps/superadmin/src/lib/services/finance/payouts.ts:225-294`, `finance/payouts/[id]/approve/route.ts`, new `[id]/pay/route.ts`, `payouts-screen` UI, `schema.prisma` (`payouts.external_ref`, `paid_by`), verify-db; `apps/superadmin/tests/db/payout-*.test.ts` | §3.3.4 payouts table. `approvePayout` stops moving money; new `payPayout` (different user than `approvedBy`, `external_ref` required + unique, 2FA freshness) does the decrement + ledger row + `paid`. Generator-cannot-approve check via the `payout.generated` audit row. | M | Mig + Dec (who may pay; whether `accountant`→`accountant` counts as two people) |
| M-04 | new migration `20260909120000_money_tables_revoke`; `packages/database/src/extensions/index.ts:6-16`; `packages/database/scripts/verify-db.ts:13-23` (`APPEND_ONLY` gains the three ledgers `[INSERT,SELECT]` and `payments [INSERT,SELECT,UPDATE]`); `expected-db-shape.json` 75→76; `c06-refund-guards.test.ts` (+grant assertions) | `REVOKE UPDATE, DELETE ON wallet_ledger, parent_wallet_ledger, center_wallet_ledger FROM edura_app; REVOKE DELETE ON payments FROM edura_app;` `Payment` → `NO_HARD_DELETE_MODELS`, `CenterWalletLedger` → `IMMUTABLE_MODELS`. UPDATE on `payments` stays (refund bookkeeping columns need it). Proven safe for the sweep: `test-cleanup.ts:51` and `wipe-data.ts:18` connect as `ADMIN_URL` (owner), not `edura_app`. Drop the CHECK part (§3.2/2). | S | Mig |
| M-05 | interim: `refund-payment.ts:18`, `apps/erp/src/app/api/v1/payments/[id]/refund/route.ts:19`; full: §3.3.2 files + migration 76 (`payments.refund_gateway_ref`), new cron `retry-gateway-refunds` | Interim: drop `gateway` from `COUNTER_REFUND_CHANNELS` (the type stays for display). Full: executor + refund webhook + shared `confirmRefundTx`. | XS interim / M full | Mig (full) |
| M-06 | `apps/erp/src/app/api/v1/me/email/route.ts`; new `me/email/confirm/route.ts`; reuse `passwordResetToken`-style table? No — new `email_change_requests` (or reuse `invite_tokens` with purpose `email_change`, which `CLAIMABLE` already models purposes for); mail template `email_change_confirm` + `email_change_notice`; `self-service-profile.test.ts` | Request → token to NEW address (1 h, hashed, single-use) + notice to OLD address; confirm → switch, `emailVerified: true`, `tokenVersion++`, audit. Until confirmed nothing changes. | S | Mig (one table or one enum value) |
| M-07 | `apps/erp/src/lib/services/payments/gateway/index.ts:10-12`, `mock-driver.ts:41-44`; `apps/erp/tests/unit/c1-payments-mode.test.ts` (+2) | `resolveDriver()` throws `PAYMENTS_MODE=mock is not allowed in production`; `mockDriver.verifyWebhook` returns `{valid:false}` when `NODE_ENV==="production"` regardless of HMAC. `onlineCheckoutAvailable()` unchanged. | XS | no |
| M-08 | `CLAUDE.md` (Money invariant), `docs/decisions/superadmin-center-oversight.md`; `apps/superadmin/src/app/api/v1/finance/refunds/route.ts:23` | Rewrite the invariant to what is true: "back-office money writes exist only as `superadminAsCenter` + the sanctioned centre Tx function + `writeAdminAudit`, on tables the DB does not revoke; `transactions` stays DB-append-only for everyone". Narrow the clawback route to `super_admin` (it credits wallets and reaches teacher/centre balances). | XS | Dec (keep the three centre-money routes or remove in favour of view-as) |
| M-09 | `apps/erp/next.config.ts:29,77`, `apps/superadmin/next.config.ts:26`, `apps/{erp,superadmin}/vercel.json`, `apps/*/src/proxy.ts` (nonce), root layout script tags; `csp-policy.test.ts` | Nonce per request in `proxy.ts` → `script-src 'self' 'nonce-…' 'strict-dynamic'`; drop `'unsafe-inline'` from script-src (style-src keeps it — Tailwind/inline styles); `ignoreBuildErrors: false`; vercel fallback only when the build log contains `Compiled successfully`/`Generating static pages` AND exit was a signal (137/139), not any failure. | M | no |
| M-10 | `packages/server-core/src/http/health.ts:34-40`, `apps/erp/src/app/api/health/route.ts`, superadmin equivalent; `health-rate-limiter.test.ts` (+1) | `deep=mail` requires `x-cron-secret`/`Authorization: Bearer CRON_SECRET` via the existing `secretEquals`; otherwise ignored (shallow response). Also `withRateLimit(…, 30, 30)` on the route. | XS | no |
| M-11 | `apps/erp/src/app/api/v1/auth/password/forgot/route.ts`, `packages/server-core/src/services/auth/password-reset.ts:18-22`; `mail-password-reset.test.ts` (+3) | Per-email bucket `reset:${sha256(email)}` 3/h in addition to per-IP; `requestPasswordReset(email, locale, { app: "www" })` refuses roles for which `canSignIn(app, role)` is false (back-office accounts reset only from the back office, which today has no public forgot route — so they reset only via `admin/users/[id]/password-reset`); constant-shape: always `await` a fixed 300 ms floor so unknown/known emails return in the same envelope. | S | no |
| L-01 | `packages/server-core/src/services/wallet/wallet.ts:68-79`, `parent-wallet.ts` (same shape); `wallet.test.ts` | `$queryRaw UPDATE … SET wallet_balance = wallet_balance - $1 WHERE user_id=$2 AND wallet_balance >= $1 RETURNING wallet_balance` — the same statement `creditMove` already uses. | XS | no |
| L-02 | `packages/server-core/src/services/finance/distribution.ts:196`, `fees.ts:55` (`resolveLessonPrice`); `money-distribution.test.ts` | Per-lesson share = `floor(price/n)` and the LAST lesson of the period/course gets `price - floor(price/n)*(n-1)`; document that a partially-attended period distributes `< price` by design. | S | no |
| L-03 | `apps/superadmin/src/lib/services/finance/payouts.ts:115`; `c02-payout-generation.test.ts` (Neon-only) | `SELECT pg_advisory_xact_lock(hashtext('payouts.generate'))` at the top of `generatePayouts`' first transaction; second concurrent caller gets `BusinessRuleError("Generation already running")` via `pg_try_advisory_xact_lock`. | XS | no |
| L-04 | `apps/erp/src/lib/services/auth/invite-accept.ts:16-34`; `invite-claim.test.ts` | `updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt } })` FIRST; `count===0` → `ExpiredError`. Mirrors `invite-token.ts:77`. | XS | no |
| L-05 | `apps/erp/src/lib/auth/view-as-plugin.ts:39-46`; migration 76: `CREATE UNIQUE INDEX audit_logs_view_as_jti ON audit_logs ((after_state->>'jti')) WHERE action='user.view_as_claimed'`; `view-as.test.ts` | Keep the `findFirst`; add the expression unique so the second concurrent claim fails on insert (P2002 → `null`). | XS | Mig |
| L-06 | `apps/erp/src/app/api/v1/temp-students/claim/route.ts:12` | `withRateLimit(…, 10, 10)`. | XS | no |
| L-07 | `apps/erp/src/lib/auth/auth.ts:73`, `apps/superadmin/src/lib/auth/auth.ts:98` | `minPasswordLength: 8`. Sign-in is unaffected (better-auth checks length on set, not on verify). | XS | no |
| L-08 | `apps/erp/src/lib/services/grades/grades.ts:140-160`; `materials-access.test.ts` pattern → new case in an existing grades suite | Student: require an active `enrollment` on `grade.courseId` (as `getMaterialDownloadUrl` does) else `NotFoundError`; parent: require a linked child enrolled. | XS | no |
| L-09 | `subscriptions.ts:660-702`; `renewal-reminders.test.ts` or new `expire-subscriptions.test.ts` | Paginate per-session passes by `id` cursor (`take: 2000` in a loop); sweep predicate per §3.3.3 rule 4. | S | no |
| L-10 | `subscriptions.ts:424-451`; `poc-m02-concurrent-checkout.test.ts` (+1) | Look up `paymentIntent.findUnique({ idempotencyKey })` FIRST; if it exists and belongs to the caller, return `initiateIntent` for the existing subscription; only then create. | XS | no |
| L-11 | `packages/server-core/src/rate-limit/require-shared-store.ts:17-24`; `mc-shared-rate-limit-store.test.ts` | Implement `ALLOW_UNSHARED_RATE_LIMIT=1` as the documented escape hatch (returns before the throw, logs a warning once). | XS | no |
| L-12 | `packages/server-core/src/rate-limit/require-shared-store.ts` (same boot assertion), `token-bucket.ts:188-202`; `mc-shared-rate-limit-store.test.ts` (+1) | In production, when `VERCEL=1` and neither `TRUSTED_CLIENT_IP_HEADER` nor `TRUSTED_PROXY_HOPS` is set, throw at boot with the fix in the message (`TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for`). | XS | no |
| L-13 | repo root (untracked files) | `chmod 600 .env-erp .env-superadmin .env-realtime .env-www`. Local hygiene; not committed. | XS | no |
| I-01 | `bun.lock` | Re-run `bun audit` at the end; record. No manifest change unless a reachable advisory appears. | XS | Dec (any dependency change) |

**Migration 76 (one file, `20260909120000_security_audit_phase3`), everything the plan needs from the database, so production is touched once:**

```sql
-- M-04
REVOKE UPDATE, DELETE ON wallet_ledger, parent_wallet_ledger, center_wallet_ledger FROM edura_app;
REVOKE DELETE ON payments FROM edura_app;
-- H-04 / H-03
ALTER TYPE payment_intent_status ADD VALUE IF NOT EXISTS 'needs_review';
-- M-05 (full)
ALTER TABLE payments ADD COLUMN refund_gateway_ref text;
CREATE UNIQUE INDEX payments_refund_gateway_ref_unique ON payments (refund_gateway_ref) WHERE refund_gateway_ref IS NOT NULL;
-- M-03
ALTER TABLE payouts ADD COLUMN external_ref text, ADD COLUMN paid_by uuid REFERENCES users(id);
CREATE UNIQUE INDEX payouts_external_ref_unique ON payouts (external_ref) WHERE external_ref IS NOT NULL;
-- L-05
CREATE UNIQUE INDEX audit_logs_view_as_jti ON audit_logs ((after_state->>'jti')) WHERE action = 'user.view_as_claimed';
-- M-06 (if a table is chosen over an invite purpose)
-- CREATE TABLE email_change_requests (...);
```

`ALTER TYPE … ADD VALUE` cannot run inside the same transaction as a statement that uses the new value, and `prisma migrate deploy` wraps each migration in one transaction — so the enum value goes in its OWN migration file (`20260909120000_needs_review_enum`) and the rest in `20260909120100_security_audit_phase3`. Prisma cannot model the two partial uniques or the REVOKEs; `c06-refund-guards` gains assertions for each so `prisma migrate dev` proposing to drop them is a red test. `expected-db-shape.json` → 77 migrations.

## 3.5 Decisions needed from Ali before the corresponding fix

1. **H-02:** token-only gating now (shell merge only via walk-in claim link or temp-student invite code) versus un-deferring phone OTP. Recommendation: token-only now; OTP is a separate feature.
2. **M-03:** who may move a payout to `paid` — `super_admin` only, or any accountant other than the approver? Recommendation: any of the two roles, but a different user than `approved_by` and than the generator, with `external_ref` mandatory.
3. **M-08:** keep `adminRecordPayment` / `adminTopUpWallet` / `adminCreateWalkInSubscription` in the back office (audited, sanctioned Tx) and rewrite the invariant, or delete the routes and use view-as. Recommendation: keep + rewrite; and narrow the lesson-clawback route to `super_admin`.
4. **Refund withdrawal:** can an armed-but-unconfirmed refund be withdrawn? Recommendation: no transition; it is a promise to the family.
5. **Migration 76/77 apply order:** dev → test (local + Neon) → production, each with read-only pre-flight, per the CLAUDE.md 2026-08-02 lesson (schema before code).

## 3.6 PoC files placed

| File | Finding | Origin |
|---|---|---|
| `apps/erp/tests/db/poc-h01-wallet-topup-refund.test.ts` | H-01 | Appendix A-1, verbatim |
| `apps/erp/tests/db/poc-h02-shell-merge-by-phone.test.ts` | H-02 | Appendix A-2, verbatim |
| `apps/erp/tests/db/poc-h03-orphaned-capture.test.ts` | H-03 | Appendix A-3, verbatim |
| `apps/erp/tests/db/poc-m01-staff-session-idor.test.ts` | M-01 | written in Phase 3 from the A-4 curl recipe (route-level, calls the two handlers with a `center_staff` session of centre A against a session of centre B) |
| `apps/erp/tests/db/poc-m02-concurrent-checkout.test.ts` | M-02 | written in Phase 3 from the A-5 recipe (two parallel `createSubscriptionCheckout`, both mock-completed; asserts one active subscription and one payment, second capture credited not lost) |

All five follow the DB-suite shape (`assertDbEnv(["test"])`, tagged fixtures, `sweepTagQuietly`) and are picked up by `run-db-suites.ts` because they end in `.test.ts`. They are expected RED until each fix lands; `bun run test:db:local` will report them as failures until then. NOT run in Phase 3.


---

# Phase 4 — Status after remediation (2026-09-06)

Every fix was applied on the working tree at `079f52f` + the refund work, one finding at a time, each with a PoC or proof suite that was red before and green after. Nothing here was verified by reading alone: the "Proof" column names the suite, and the totals at the end are the runs that were executed after the last change.

**Environment state, per the CLAUDE.md rule that state claims name their environment:**

| Migration | local test | dev | Neon test | production |
|---|---|---|---|---|
| 76 `20260909120000_needs_review_enum` | applied | applied | applied | **applied 2026-09-06 (Ali)** |
| 77 `20260909120100_money_tables_revoke` | applied | applied | applied | **applied 2026-09-06 (Ali)** |
| 78 `20260909120200_payout_maker_checker_email_change` | applied | applied | applied | **applied 2026-09-06 (Ali)** |

verify-db is **32/32 on all four databases**, production included (`ep-mute-rice-b2s8gg42`, label `edura-env:production`, 78 applied, 83 tables; census unchanged: 16 users, 0 payments, 0 transactions). `expected-db-shape.json` is at 83 tables / 78 migrations. Schema went first; the code may now deploy. Note from the production run: `$DIRECT_URL` is not in the interactive shell, so the `connect_timeout` variant needs `set -a; . ./.env.production; set +a` first — the plain `EDURA_ENV=production npx prisma migrate deploy` connected fine this time.

**New environment variables:** `PAYMOB_INTEGRATION_IDS` (required when `PAYMENTS_MODE` ≠ mock — captures park as `needs_review` without it); on Vercel, `TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for` (boot refuses production without it or `TRUSTED_PROXY_HOPS`); `ALLOW_UNSHARED_RATE_LIMIT=1` now genuinely exists.

## 4.1 Status table

| ID | Sev | Status | What changed | Proof |
|---|---|---|---|---|
| H-01 | High | **Fixed** | Refund of a wallet top-up debits the wallet in the same tx (`walletDebit`, `type: refund`, linked to the refund receipt) and reverses the centre's cash-collection credit; spent wallet → refused, everything rolls back | `poc-h01` 3/3, `refund-wallet-topup` 13/13, `refund-bound` 56/56 |
| H-02 | High | **Fixed** (token-only, per decision) | No shell activation by email/phone match in any register function; a shell counts as taken (door message); the only in-register merge is a single-use `entityType: invited` code; external-teacher shells refuse too | `poc-h02` 3/3, `h02-register-shell-gate` 12/12, `registration-doors` 17/17 |
| H-03 | High | **Fixed** | Claim accepts `pending`\|`expired`; settle must link a `payments` row or the claim rolls back; cancelled sub → re-activate or credit payer wallet (`resolvePayerTarget`); finance notified; sweep respects payable intents; cancel leaves the intent alone | `poc-h03` 3/3, `h03-capture-outcomes` 21/21, `m1-webhook-atomicity` 9/9 |
| H-04 | High | **Fixed** | `WebhookEvent` carries `kind`, `amountMinor`, `currency`, `integrationId`, `parentRef`; Paymob HMAC over the 20 fields; 5-rule settle gate; mismatch → `needs_review` + audit + finance, 200 not settle; void/refund/pending handled; mock driver same contract. Paymob `createCheckout` remains a stub until credentials exist | `webhook-contract` unit 22, `poc-h04` 14/14 |
| M-01 | Med | **Fixed** | Both `sessions/[id]` GETs re-key `center_staff` via `authorizeCenterActor`; terminal `else` | `poc-m01` 4/4, `sessions-staff-scope` 8/8 |
| M-02 | Med | **Fixed** | Checkout: idempotency key first (L-10), `FOR UPDATE` on the student, in-flight checkout refused; settle: lock + duplicate re-check → credit branch | `poc-m02` 3/3, `m02-checkout-serialisation` 7/7 |
| M-03 | Med | **Fixed** | `approve` = decision (no money, generator refused); new `pay` step by a different person with mandatory unique `external_ref` moves the wallet + ledger; reject from approved; dashboard counts approved as open. Residual: no per-action 2FA re-prompt exists in the app; the mandatory 2FA session gate covers all three steps | `m03-payout-maker-checker` 16/16, `h2-payout-floor` 9/9, `c07` |
| M-04 | Med | **Fixed** | `REVOKE UPDATE, DELETE` on the three wallet ledgers, `REVOKE DELETE` on `payments`; ORM guards; verify-db 28→32; demo seeds purge as owner (`owner-purge.ts`) and were run twice each | `c06` 25/25, `c07` 13/13, verify-db 32/32 ×3, seeds ×2 exit 0 |
| M-05 | Med | **Interim Fixed / executor Deferred** | `gateway` removed from `COUNTER_REFUND_CHANNELS` and refused at the service — no unconfirmable obligation can be armed. The executor + refund webhook + `retry-gateway-refunds` cron (§3.3.2) and the `payments.refund_gateway_ref` column are deferred until the Paymob driver and credentials exist; the design is written and the webhook already classifies `kind: refund` and audits unsolicited ones | `refund-bound` [13] |
| M-06 | Med | **Fixed** | Email change is a request: hashed 1 h token to the NEW address, notice to the OLD, switch only on confirm, `emailVerified: true`, `tokenVersion++` (all sessions out), audited both steps; new `/confirm-email` page | `self-service-profile` 30/30, `c07` |
| M-07 | Med | **Fixed** | `resolveDriver()` throws in production for `mock`; `mockDriver.verifyWebhook` refuses in production unconditionally; availability checked before the driver in all five initiate paths | `c1-payments-mode` +4 |
| M-08 | Med | **Fixed** (decision: keep routes) | CLAUDE.md invariant rewritten to what the code does; decision doc corrected; `POST /api/v1/finance/refunds` narrowed to `super_admin` | `center-money` 43/43, refund suites |
| M-09 | Med | **Fixed** | Nonce CSP minted per request in middleware, `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'`; API routes `default-src 'none'`; `ignoreBuildErrors` removed (build passed); Vercel fallback forgives only a signal death after a completed build. Route census 360 ƒ / 3 ○ / 0 ● (was 342/3/31) — nonce CSP makes the root layout dynamic | browser-verified both apps (nonce == every script tag, zero violations), `csp-policy` 25/25, `bun run build` exit 0 |
| M-10 | Med | **Fixed** | `?deep=mail` needs `CRON_SECRET`; route rate-limited 60/min/IP | `m10-health-deep-mail` 5/5 |
| M-11 | Med | **Fixed** | Per-email bucket 3/h; reset work after the response (`runAfter`) → identical bytes/timing; back-office roles refused on the ERP door (`app: "www"`) | `m11-forgot-password-route` 3/3, `mail-password-reset` 17/17 |
| L-01 | Low | **Fixed** | Wallet debits use `UPDATE … RETURNING`; concurrent debits record distinct running balances | `l01-wallet-balance-after` 8/8 |
| L-02 | Low | **Fixed** | `resolveLessonPrice` floors; monthly shares floor with the remainder on the period's last lesson — Σ === price | `l02-lesson-price-floor` unit, `l02-monthly-remainder` 3/3 |
| L-03 | Low | **Fixed (verified + pinned)** | Read again: `generateForChunk` takes `FOR UPDATE` on the beneficiaries BEFORE reading open payouts, so the second run sees the first's rows. Phase 2 was wrong that no lock existed; a race proof now pins the ordering | `l03-payout-generation-race` 4/4 |
| L-04 | Low | **Fixed** | `acceptInvite` claims `usedAt` with a conditional update first | `l04-invite-accept-race` 4/4 |
| L-05 | Low | **Fixed** | Expression unique `audit_logs_view_as_jti`; P2002 on the claim's audit row → null | `view-as` 36/36 (two concurrent claims → one session), `c07` |
| L-06 | Low | **Fixed** | `withRateLimit(10, 10)` on temp-student claim | route-conventions |
| L-07 | Low | **Fixed** | `minPasswordLength: 8` in both apps | unit suites |
| L-08 | Low | **Fixed** | `getGrade` requires an active enrolment (student) or an enrolled linked child (parent); 404 not 403 | `l08-grade-header-scope` 4/4 |
| L-09 | Low | **Fixed** | Per-session pass expiry paginated; stale-pending sweep respects payable intents (with H-03) | `h03-capture-outcomes` [6] |
| L-10 | Low | **Fixed** (with M-02) | Idempotency key consulted before any subscription row is minted | `m02-checkout-serialisation` [2] |
| L-11 | Low | **Fixed** | `ALLOW_UNSHARED_RATE_LIMIT=1` implemented, warns once | `mc-shared-rate-limit-store` |
| L-12 | Low | **Fixed** | Boot assertion on Vercel: `TRUSTED_CLIENT_IP_HEADER` or explicit `TRUSTED_PROXY_HOPS` required in production | `mc-shared-rate-limit-store` |
| L-13 | Low | **Fixed** (local) | `.env-erp`, `.env-superadmin`, `.env-realtime`, `.env-www` are `0600`. Untracked files; nothing to commit | `ls -la` |
| I-01 | Info | **Unchanged — Deferred by rule** | `bun audit` after remediation: 8 advisories (4 high, 4 moderate), the same set as Phase 2 (`mysql2` ×2, `qs` ×2, `uuid`, `deepmerge-ts`, `browserslist` ×2), all transitive tooling with no request-input path. No dependency was changed — that needs Ali's approval by the session rules | `bun audit` |

## 4.2 Test totals after the last change

| Suite | Result |
|---|---|
| `apps/erp` DB suites (local Postgres) | 81 suites, 1919 assertions, 0 failed |
| `apps/superadmin` DB suites (local Postgres) | 35 suites, 901 assertions, 0 failed |
| `apps/erp` unit | 107 files, 1534 tests, 0 failed |
| `apps/superadmin` unit | 14 files, 162 tests, 0 failed |
| `bun run check-types` | 10/10 packages |
| `apps/erp` production build (`ignoreBuildErrors` off) | exit 0 |

Not run locally (by design, see CLAUDE.md): `c02-payout-generation` (Neon-only latency proof), the four demo-seed-dependent suites, and Playwright E2E. CI covers the seed-idempotence job that M-04 touched; the five seeds were run twice each locally with exit 0.

## 4.3 Overall risk rating

**LOW.** Migrations 76–78 are on production (verify-db 32/32, 2026-09-06). What remains is deploy-time configuration, and each item fails closed if forgotten: `TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for` on both Vercel projects (boot refuses production without it or `TRUSTED_PROXY_HOPS`), `PAYMENTS_MODE` ≠ mock in production (M-07 refuses the mock driver), and `PAYMOB_INTEGRATION_IDS` when Paymob goes live (captures park as `needs_review` without it).

Residuals, all recorded above: the M-05 gateway refund executor (Deferred; the interim closes the hole by refusing the channel), Paymob `createCheckout` (stub until credentials), a per-action 2FA re-prompt for the payout pay step (the mandatory 2FA session gate stands in front of it), and the 8 transitive advisories (unreachable, unchanged).

Phase 2 called the money engine "unusually well-built" with edge-of-engine gaps. After Phase 4 those gaps are closed with tests that were red before each fix; the four Phase 2 claims that turned out inaccurate on re-measurement (M-02 indexes, M-04 wallet CHECKs, M-05 UI, L-03 locking) are corrected in §3.2 and §4.1 rather than fixed twice.
