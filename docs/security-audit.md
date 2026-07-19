# Edura — Security Audit

**Date:** 2026-07-20
**Scope:** Full system — `apps/www`, `apps/superadmin`, `apps/realtime`, `packages/*` (238 API route files / 289 handlers, auth, money engine, RLS, dependencies, infra).
**Method:** Manual first-hand review of authentication/sessions + six parallel specialist passes (route-guard coverage, IDOR/isolation, money/ledger, injection/validation, dependencies/infra, secrets/rate-limiting).
**Status:** REPORT ONLY — nothing was fixed or changed. Findings below are for review before any remediation.

> **One-line takeaway:** The core money engine, authorization model, and data isolation are fundamentally sound and well-tested. The launch-blockers are a small, concentrated set: (1) the mock payment gateway can settle real money for free if deployed without explicit config, (2) the actual login path is unthrottled and enumerable in **both** apps, (3) payout/refund concurrency is TOCTOU without DB-level guards, and (4) no security headers on either web app. All are fixable without architectural change.

---

## Severity summary

| # | Severity | Area | Finding | Fix before launch? |
|---|----------|------|---------|--------------------|
| C1 | **CRITICAL** | Money / Config | Mock gateway is the default and settles real money; `mock-complete` + webhook gated only on `PAYMENTS_MODE`, not `NODE_ENV`; HMAC falls back to in-repo secret `edura-mock-hmac` | **YES — blocker** |
| C2 | **CRITICAL** | Auth / Abuse | Real login path (NextAuth credentials callback) has **no rate limiting** in www **and** superadmin — unlimited brute-force / credential-stuffing against all accounts incl. `super_admin`/`accountant` | **YES — blocker** |
| H1 | **HIGH** | Money | Payout request is TOCTOU (no row lock / conditional update / unique) — concurrent requests over-draw the wallet | **YES — blocker** |
| H2 | **HIGH** | Money | Payout settlement decrements wallet unconditionally; no `CHECK (wallet_balance >= 0)` → negative wallet / pay out unearned money | **YES — blocker** |
| H3 | **HIGH** | Money | Refund idempotency is TOCTOU (no unique on `reversal_of_id`) — concurrent refunds double-refund + double clawback | **YES — blocker** |
| H4 | **HIGH** | Infra | No security headers on either app (no CSP / HSTS / X-Frame-Options / nosniff / Referrer-Policy) — back-office clickjackable | **YES — blocker** |
| H5 | **HIGH** | Auth | Email/staff enumeration via login timing (NextAuth path returns before bcrypt for unknown users) | **YES (with C2)** |
| M1 | **MEDIUM** | Money | Webhook claim + settlement in separate transactions → charged intent with no ledger row, unrecoverable on crash | Strongly recommended |
| M2 | **MEDIUM** | Auth / Infra | `NEXTAUTH_SECRET` silently backs three trust boundaries (session, realtime JWT, internal bridge) via `??` fallback | Strongly recommended |
| M3 | **MEDIUM** | Infra / Abuse | Rate limiter is per-process in-memory + keyed on spoofable `x-forwarded-for` — weak on serverless/multi-instance and bypassable | Strongly recommended |
| M4 | **MEDIUM** | Errors | Raw `err.message` returned to clients on unhandled errors in production (info leak) | Strongly recommended |
| M5 | **MEDIUM** | IDOR | `temp-students/[id]/send-invite` has no center/teacher ownership check — cross-tenant invite-code + phone leak enabling shell-account hijack | Recommended |
| M6 | **MEDIUM** | Upload | Materials upload trusts client `file.type` (no magic-byte check); non-PDF payload served to students as "course material" | Recommended |
| M7 | **MEDIUM** | Auth | `cron/[job]` opens with no secret when `CRON_SECRET` unset & `NODE_ENV!=="production"`; `GET = POST` makes side-effectful jobs GET-triggerable | Recommended (verify prod env) |
| M8 | **MEDIUM** | Injection | `$queryRawUnsafe` + template interpolation in 3 finance/dashboard sites — safe today (closed enums), fragile by construction | Recommended |
| L1 | **LOW** | Auth | Password reset / password change does not invalidate existing 30-day JWT sessions | Recommended |
| L2 | **LOW** | Auth | 30-day JWT sessions for the superadmin/finance back-office (no server revocation) | Recommended |
| L3 | **LOW** | IDOR | Ownership hijack: `me/device-tokens` + `me/push-subscription` upsert reassigns `userId` on a known token/endpoint | Recommended |
| L4 | **LOW** | Enumeration | `roster/students/lookup` + `roster/teachers/lookup` resolve any platform user globally by email/phone (role-gated, unrated) | Recommended |
| L5 | **LOW** | IDOR | `grades/[id]` GET leaks grade/course/center/teacher metadata to any student (scores stay private) | Optional |
| L6 | **LOW** | Redirect | Login `next=` open-redirect bypass via backslash (`/\evil.com`) | Recommended |
| L7 | **LOW** | Upload | External material links accept any `http`/`https` URL, opened for students with no interstitial | Optional |
| L8 | **LOW** | Validation | Unvalidated enum casts + a few unbounded fields → 500s (materials type, notifications type, grade scores, NaN `take`) | Optional |
| L9 | **LOW** | Infra | Internal-bridge secret compared with `!==` (not constant-time) | Optional |
| L10 | **LOW** | Money | Walk-in cash subscription has no idempotency; concurrent double-POST double-charges (staff-initiated) | Optional |
| D* | **LOW** | Deps | 13 `pnpm audit` advisories (7 high / 6 moderate) — **all dev/build-time transitive tooling**, none on the runtime request path | Clear before launch (low urgency) |

**Blockers (must fix before production): C1, C2, H1, H2, H3, H4, H5.** Everything else is post-launch-acceptable but several are cheap and should be batched with the blockers.

---

## 1. Authentication & Sessions

### C2 — CRITICAL: Login path has no rate limiting (both apps)
- **Where:** `apps/www/src/lib/auth/options.ts:29-62`, `apps/superadmin/src/lib/auth/options.ts` (password `CredentialsProvider.authorize`).
- **What:** The login UI calls `signIn("credentials", …)` → NextAuth `/api/auth/callback/credentials`. That `authorize()` runs `bcrypt.compare` with **no `checkRateLimit`**. A separately-written, correctly rate-limited mirror exists at `POST /api/v1/auth/login` (`withRateLimit(…,10,30)` + dummy-hash) but **the UI does not use it** — it's effectively dead code. The superadmin portal (`super_admin`, `accountant`) has the identical unprotected path.
- **Exploit:** Unlimited online password brute-force / credential-stuffing against every account, including the highest-value back-office roles. No lockout, no throttle.
- **Fix (do NOT apply yet):** port the `walkin-token` provider's own pattern (`options.ts:88`) — add per-IP + per-email `checkRateLimit` inside both `authorize()` functions; add failure backoff/lockout for staff roles. This single change also closes H5.

### H5 — HIGH: Login timing enumeration (NextAuth path)
- **Where:** `apps/www/src/lib/auth/options.ts:32-41` (and superadmin equivalent).
- **What:** `if (!user) return null;` returns *before* any `bcrypt.compare`, so a nonexistent (or wrong-role/inactive/no-hash) email responds measurably faster than a real one. The manual `/auth/login` route defends against this with a `DUMMY_HASH` constant-time compare — the NextAuth path (the one actually used) does not.
- **Exploit:** Enumerate valid user/staff emails by response latency, then brute-force (unthrottled, per C2).
- **Fix:** always run `bcrypt.compare` against a dummy hash when the user is missing/ineligible, mirroring the manual route.

### L1 — LOW: Password reset doesn't invalidate existing sessions
- **Where:** `apps/www/src/lib/services/auth/password-reset.ts:44-58`.
- **What:** `resetPassword` updates `passwordHash` but sessions are stateless 30-day JWTs with no server-side revocation, so a reset (e.g. after compromise) does not log out an attacker's existing session.
- **Fix:** add a `sessionInvalidBefore`/token-version claim checked in the JWT callback, bumped on password change; or move to database sessions for critical roles.

### L2 — LOW: 30-day JWT for the back-office
- **Where:** `apps/superadmin/src/lib/auth/options.ts` `maxAge: 60*60*24*30`.
- **What:** A stolen `super_admin`/`accountant` token is valid 30 days with no revocation.
- **Fix:** shorten superadmin `maxAge` (1–7 days) and/or database-strategy sessions.

### Verified OK (auth)
- **Walk-in passwordless provider (Step 7) is tightly scoped and correct** — purpose-locked to `walk_in_onboarding`, atomic single-use via `updateMany where usedAt:null`, refuses any account with a `passwordHash` (no takeover), IP rate-limited *inside* `authorize`, 256-bit SHA-256-hashed tokens. (Re-verified against Step 7's own six proofs.)
- **Role isolation at credential-check time** — `WWW_ROLES` / `STAFF_ROLES` enforced inside `authorize()`, so a staff account cannot mint a www session or vice-versa; not merely a route guard.
- **Cookie isolation between apps** — superadmin sets distinct cookie names (`edura-superadmin.session-token`) **and** a distinct `SUPERADMIN_NEXTAUTH_SECRET`; tokens are mutually invalid across apps even on one domain. Both apps: `httpOnly`, `sameSite:lax`, `secure` in prod (`__Secure-`/`__Host-` prefixes).
- **Password reset flow** — hashed single-use token, 1h TTL, `usedAt` set in the same tx, generic forgot-password response (no enumeration).
- **Password hashing** — `bcryptjs@3.0.3`, `bcrypt.compare`, cost 10.
- **Quick-login** — `SHOW_QUICK_LOGINS = process.env.NODE_ENV !== "production"`, statically inlined/dead-code-eliminated in prod builds; seed refuses staff roles in prod without explicit env passwords.

---

## 2. Authorization & Data Isolation

**Coverage sweep result:** 289 handlers across 238 files. **Zero mutating handlers unguarded by oversight.** The 24 no-session-guard handlers are all deliberate: 4 NextAuth internals, 7 rate-limited public auth flows, 7 public read-only discovery routes, 2 nullable-session public reads, 4 alternative-auth (cron secret, chat-notify shared secret, webhook HMAC). The assistant delegation boundary (Step 8) is default-closed and was independently re-verified — money and assistant-management routes stay teacher-only.

### M5 — MEDIUM: `temp-students/[id]/send-invite` cross-tenant leak (IDOR)
- **Where:** `apps/www/src/lib/services/temp-students/temp-students.ts:70-100` (route: `.../temp-students/[id]/send-invite/route.ts`, guard `delegatedWithCenter`).
- **What:** `sendTempStudentInvite` does a bare `studentProfile.findFirst({ where: { userId: tempUserId } })` under `platformDb` (RLS bypassed) with **no check the temp student belongs to the caller's center/teacher**, and returns `{ inviteCode, phone }`. That `inviteCode` is exactly what `temp-students/claim` consumes to absorb a shell account (its enrollments, payments, attendance, roster).
- **Exploit:** Center A discovers a rival's walk-in shell `userId` (e.g. via the platform-wide `center/checkin/lookup`), calls send-invite, reads the returned code + phone, hands the code to a colluding student who claims (hijacks) the shell.
- **Fix:** require a `centerStudentRoster` row for `{centerId: actor.centerId, studentId: tempUserId}` (and the teacher-scope equivalent) before returning the code.

### L3 — LOW: Device-token / push-subscription ownership reassignment
- **Where:** `apps/www/src/app/api/v1/me/device-tokens/route.ts` POST, `me/push-subscription/route.ts` POST.
- **What:** Both upsert on the globally-unique key (`token` / `endpoint`) and set `userId: user.id` in the update branch. Any authenticated user who learns another user's device token/endpoint can silently reassign it and receive that user's pushes.
- **Fix:** on upsert conflict, only reassign if the row has no owner or already belongs to the caller; otherwise create-new / reject.

### L4 — LOW: Global user lookup / enumeration
- **Where:** `roster/students/lookup`, `roster/teachers/lookup` (POST, `center_admin`).
- **What:** Resolve any platform user by exact email/phone globally (not center-scoped), unrated. Account-existence + PII oracle for any center account.
- **Fix:** rate-limit; consider returning only "invite sendable" boolean rather than the resolved record.

### L5 — LOW: `grades/[id]` GET metadata read
- **Where:** `apps/www/src/lib/services/grades/grades.ts:140-149`.
- **What:** For students, returns the full grade row (name/date/course/center/teacher) for any `gradeId` with no enrollment check; only the `scores` array is filtered to the caller. Others' scores are NOT exposed — metadata leak only.
- **Fix:** assert active enrollment in `grade.courseId` before returning, mirroring `listGrades`.

### Informational (by design, worth a product review)
- `center/checkin/lookup` → `lookupStudents` searches `studentProfile` **platform-wide** and returns matched students' `phone` and the names of other centers they attend. Intended cross-center walk-in recognition, but a broad PII/relationship oracle for any front-desk account. Consider narrowing the returned fields.

### Verified OK (authorization) — spot-checked services confirm the guard
Ownership/scope confirmed for: `subscriptions/[id]/cancel` (`studentId===user.id`), `sessions/[id]` GET (role-branched), `payments/[id]` + `/receipt` + `/intents/[id]`, `enrollments` POST/DELETE (`requireCenterScope`), `notifications/[id]/read` (`userId` filter), `reviews/[id]` PATCH (`studentId` + 24h), `materials/[id]` all verbs (enrollment/teacher/center), `grades/[id]/scores` PUT (`teacherId` + enrollment), `sessions/[id]/attendance` GET+PUT, `attendance/[id]` PATCH (center match), `center/checkin` + `door-checkin` (center/teacher-session match), `me/roster/choice` (own rows), `parent-links/*`, `temp-students/claim` (shell + own account), `roster/students/[studentId]` (center row), session lifecycle (`complete`/`cancel`/`postpone`), `courses/[id]` PATCH, `collaboration-requests/[id]/accept` (responder binding), `affiliations/[id]` DELETE, `teacher/assistants/[id]` DELETE, `centers/me/admins/[userId]` DELETE (self + last-admin guards), `rooms`/`expenses` (`requireCenterScope`), `realtime/token` (own claims), `me/points*`. Superadmin routes: `super_admin` gated (auto-pass), finance routes `accountant`+`super_admin`.

---

## 3. Money & Ledger

### C1 — CRITICAL: Mock gateway can settle real money for free
- **Where:** `apps/www/src/lib/services/payments/gateway/types.ts:62-66` (`paymentsMode()` defaults `"mock"`), `mock-driver.ts:12-16` (`PAYMOB_HMAC_SECRET || "edura-mock-hmac"`), `app/api/v1/payments/intents/[id]/mock-complete/route.ts:22-25`, webhook route.
- **What (confirmed first-hand):** `PAYMENTS_MODE` defaults to `mock`; the mock HMAC secret falls back to the hardcoded in-repo `edura-mock-hmac`; `mock-complete` (which forges a valid webhook and settles the intent → Payment paid + ledger Transactions + wallet credit + points) is gated **only** by `paymentsMode() !== "mock"` — there is **no `NODE_ENV === "production"` hard stop**.
- **Exploit:** If the app is ever deployed without `PAYMENTS_MODE` explicitly set to `sandbox`/`live`, a student calls `POST …/mock-complete {outcome:"success"}` on their own intent and receives the enrollment/subscription for free. More broadly, the webhook accepts mock-signed payloads whose signing key is public in the repo — anyone can forge a settlement.
- **Fix (do NOT apply yet):** in production refuse to boot (or refuse `mock`) unless `PAYMENTS_MODE` is *explicitly* `mock`; require `PAYMOB_HMAC_SECRET` with no fallback whenever `NODE_ENV === "production"`; hard-404 `mock-complete` in production; use `crypto.timingSafeEqual` for the HMAC compare (`mock-driver.ts:58`).

### H1 — HIGH: Payout request TOCTOU (wallet over-draw)
- **Where:** `apps/www/src/lib/services/finance/teacher-wallet.ts:41-88`, `center-wallet.ts:51-92`.
- **What:** Reads `walletBalance`, sums open payouts, computes `available`, then `payout.create` — same transaction but Read Committed, **no `SELECT … FOR UPDATE`, no conditional insert, no unique constraint**. Two concurrent full-balance requests both pass and both create payouts summing beyond the wallet. `generatePayouts` (superadmin) races the same way.
- **Exploit:** Fire two simultaneous `POST /teacher/wallet/payout-request` → two pending full-balance payouts → both approved → double payout.
- **Fix:** lock the beneficiary row (`FOR UPDATE`) before the check, or a partial unique "≤1 open payout per beneficiary", or a conditional reservation update.

### H2 — HIGH: Payout settlement has no negative-balance floor
- **Where:** `apps/superadmin/src/lib/services/finance/payouts.ts:127-137` (`settlePayout`).
- **What:** The status claim is atomic, but the wallet write is a bare `decrement: net` with **no `where walletBalance >= net`** and **no `CHECK (wallet_balance >= 0)`** (confirmed absent from migrations). Any over-issuance from H1 flows straight to a negative wallet — the platform pays out money never earned.
- **Fix:** conditional `updateMany({ where:{ userId, walletBalance:{ gte: net }}, data:{ decrement }})`, treat `count===0` as failure; add the CHECK constraint.

### H3 — HIGH: Refund idempotency TOCTOU (double refund)
- **Where:** `apps/superadmin/src/lib/services/finance/refunds.ts:24-28`.
- **What:** "already refunded" guard is `findFirst(reversalOfId=payment.id)` then INSERT, with **no unique index on `transactions.reversal_of_id`**. Two concurrent refunds for one charge both pass, both insert refund + fee-return + both decrement wallets → double refund + double clawback.
- **Fix:** partial unique on `reversal_of_id WHERE type='refund'`, or `FOR UPDATE` the original payment.

### M1 — MEDIUM: Webhook claim & settlement in separate transactions
- **Where:** `apps/www/src/lib/services/payments/payment-intents.ts:228-271`.
- **What:** The pending→paid claim commits, then settlement runs in a *new* transaction. If settlement throws / process dies after the claim, the intent is permanently `paid` with no Payment/Transaction/enrollment, and webhook redelivery is treated as a `replay` no-op — student charged, gets nothing, ledger incomplete.
- **Fix:** one transaction for claim+settlement, or make settlement idempotently re-runnable off `status:"paid" AND paymentId IS NULL` (reconciliation cron).

### L10 — LOW: Walk-in cash subscription no idempotency
- **Where:** `subscriptions.ts:361-448`, `assertNoDuplicateActive:79-99` (SELECT-then-create, no unique). Concurrent counter double-submit → two charges. Staff-initiated, limited exposure. Fix: unique index on active `(studentId,courseId)` monthly / `(studentId,sessionId)` per-session.

### Verified OK (money) — the core engine is sound
- **Amount tampering closed** — every entry point (`payments/initiate`, `subscriptions/checkout`, `center/subscriptions`) omits an amount field, uses `.strict()`, and charges a **server snapshot** (`course.price` / `pricePerMonth` / `pricePerSession`). `PaymentIntent.amount` is `CHECK (amount > 0)`, `idempotencyKey`/`gatewayOrderId` `@unique`. The webhook never reads an amount from the payload.
- **Webhook HMAC verified before any state change** (`paymob/webhook/route.ts:21-24` → 401 before processing).
- **Replay/idempotency atomic** — `updateMany where status:"pending"`, `count===0` → replay no-op; `gatewayOrderId` unique; subscription adds a second `status!=="pending_payment"` guard.
- **Teacher-direct double-pay guard** — settles teacher wallet once at payment; `distributeSessionRevenue` returns early `teacher_direct_settled_at_payment` for null-center courses. Mutually exclusive. (Matches Step 4's own proof.)
- **Double-distribution guard atomic** — `session.updateMany where distributedAt:null`, bail on `count===0`.
- **Refund reverses the ACTUAL charged fee** — reads the real `type:"commission"` ledger rows and reverses those exact amounts; a later rate change can't corrupt an old refund. (Matches Step 4.5 proof.)
- **Append-only ledger** — `immutableExtension` throws on update/delete/upsert for `Transaction`/`PointsLedger` (asserted by smoke-test) + DB-level `REVOKE UPDATE, DELETE` on the `edura_app` role; corrections are reversing inserts (`reversalOfId`). *(See L-note below.)*
- **L-note (LOW/INFO):** the DB `REVOKE` is scoped `IF EXISTS rolname='edura_app'` — if any runtime ever connects as table owner/superuser, only the app-layer extension guards the ledger. Memory confirms `edura_app` (NOBYPASSRLS) is the runtime role; worth an explicit prod-connection check.

---

## 4. Input Validation & Injection

### M6 — MEDIUM: Materials upload trusts client MIME type
- **Where:** `apps/www/src/lib/services/materials/materials.ts:108-111` (create), `:308-311` (update).
- **What:** "PDF only" is enforced via `file.type === "application/pdf"` (attacker-controlled), with no magic-byte (`%PDF-`) check. Blob is relabeled and stored as Cloudinary `raw`, then served to enrolled students via `window.open`.
- **Exploit:** Teacher uploads HTML/SVG/EXE with a spoofed content type; students receive it as trusted "course material" (phishing; HTML could render on the Cloudinary domain).
- **Fix:** verify `%PDF-` magic bytes server-side. (Also: update path message says "20 MB" but enforces 10 MB — cosmetic mismatch.)

### M8 — MEDIUM: `$queryRawUnsafe` + interpolation (fragile, safe today)
- **Where:** `packages/server-core/src/services/finance/ref-numbers.ts:4,16`; `apps/superadmin/src/lib/services/admin/platform-dashboard.ts:48-53`; `apps/superadmin/src/lib/services/finance/finance-reports.ts:22-28`.
- **What:** All interpolate only trusted values today (closed TS unions / whitelisted maps / numbers), so **no injection currently exists** — but the `$queryRawUnsafe` + `${}` pattern becomes SQLi the moment a caller passes user input. `nextval('${seq}')` relies purely on a compile-time union.
- **Fix:** convert to parameterized `$queryRaw` tagged templates (`date_trunc(${trunc}, …)`, `nextval(${seq}::regclass)`) so a repo-wide grep for `Unsafe` is trivially clean.

### L6 — LOW: Login `next=` open-redirect via backslash
- **Where:** `apps/www/src/app/[locale]/login/page.tsx:17-19`. `isSafeNext` allows `/` but not `//`; browsers normalize `\` to `/`, so `?next=/\evil.com` → `//evil.com` external redirect post-login. Fix: also reject `/\`, or resolve+compare origins.

### L7 — LOW: External material links accept any http/https URL (no SSRF; the server never fetches them) — opened for students with no interstitial. Fix: require `https:` + optional domain allowlist / "leaving Edura" confirmation. (`materials.ts:53-65`.)

### L8 — LOW: Unvalidated enum casts + unbounded fields → 500s (not injection)
- `materials.ts:134,291` (`type as MaterialType`), `notifications/route.ts:21` both apps (`type as …` from query), `payments/route.ts:31` (`note` no max), `grades` `maxScore`/`score` unbounded, materials `title` uncapped (echoed into notifications), `center/wallet/transactions/route.ts:13` (`Number("junk")→NaN→take:NaN→500`). Fix: `z.enum([...])`, `.max()` bounds, `parseInt || default`.

### Verified OK (injection/validation)
- **All raw SQL located and confirmed parameterized** — `set_config`/tenant-context binds `${centerId}`, `apply-migrations.mjs` uses `$1/$2/$3`, no filter/sort/pagination param reaches raw SQL (all whitelist enums + clamp `take` 20–200).
- **XSS** — only two `dangerouslySetInnerHTML` sites, both static theme-bootstrap scripts with no user data. All user strings render through React escaping; no user-controlled `href`, no markdown/linkify sink.
- **Zod** — automated scan found **zero** body-parsing routes without a schema; no `z.any()`; sensitive writes use `.strict()` + uuid/enum; money via `moneySchema` (int piasters capped 999,999 EGP); the one `z.record` (onboarding draft) is 10 KB-capped. Zod v4 strips unknown keys, so body-spread-into-Prisma sites have no mass-assignment path.
- **File upload** — 10 MB cap, Cloudinary server-signed upload (secrets from env), Cloudinary-generated `public_id` (no path traversal), signed 1h download URLs, ownership/enrollment checks on upload/update/delete/download.

---

## 5. Secrets & Data Leakage

### M4 — MEDIUM: Raw error messages leak to clients in production
- **Where:** `packages/server-core/src/errors/http.ts:47-49`. For any unhandled (non-`AppError`, non-Prisma-mapped) error, raw `err.message` is returned in the 500 body **in production too** — only the `console.error` is gated to non-prod.
- **Exploit:** A crafted-input DB/driver exception surfaces table/column names, constraint text, file paths, library internals — reconnaissance aid.
- **Fix:** in production return a fixed `"Internal error"` string for the fallback branch; keep logging the real error server-side.

### M2 — MEDIUM: One secret backs three trust boundaries
- **Where:** `apps/realtime/src/env.ts:25,28` (`jwtSecret` and `internalSecret` both `?? required("NEXTAUTH_SECRET")`), plus `realtime/token`, `realtime-bridge`, `internal/chat-notify`.
- **What:** By default the session-signing secret is reused as the realtime handshake JWT secret **and** the server↔server internal-bridge secret. A leak of any one compromises all three (forge www sessions + realtime identity + call `/internal/*`). Superadmin already does this right (requires a distinct secret, fails closed in prod).
- **Fix:** require dedicated `REALTIME_JWT_SECRET` + `INTERNAL_API_SECRET` in production, fail closed if unset; keep the `NEXTAUTH_SECRET` fallback dev-only.

### L2 (dup — see §1). L9 — LOW: internal-bridge secret compared with `!==` not `timingSafeEqual` (`apps/realtime/src/internal.ts:73`, `internal/chat-notify/route.ts:26`).

### Verified OK (secrets)
- **`.env.local` is gitignored + untracked** (`git check-ignore` matches, `git ls-files` empty); no committed secrets.
- **No hardcoded secrets in source** — all reads via `process.env.*`; `.env.example` placeholders only. (Sole literal is the mock HMAC fallback — covered under C1.)
- **WhatsApp token redaction (Step 7) holds** — re-confirmed `redactSecrets` masks `token=` in both `params` and the provider `raw` response before persisting; the real token reaches only the driver, never the log row.
- **`passwordHash` never returned by any API** — `/me` selects it but returns only `hasPassword` boolean.
- **Paymob webhook stub fails closed** (`verifyWebhook → {valid:false}`); seed persists only bcrypt hashes; quick-login dev-gated.

---

## 6. Rate Limiting & Abuse

### M3 — MEDIUM: In-memory, per-process, IP-spoofable limiter
- **Where:** `packages/server-core/src/rate-limit/token-bucket.ts` + `middleware.ts:13-16`.
- **What:** (a) State is an in-process `Map` — on serverless/multi-instance each instance has its own counters and every deploy/cold-start resets them, so effective limits are `N × configured`. (b) Key is `x-forwarded-for.split(",")[0]` — the client-controlled first hop; if the platform doesn't overwrite (vs append) XFF, an attacker rotates spoofed values to bypass entirely; legitimately, one NAT shares a bucket.
- **Fix:** back with a shared store (Redis/Upstash); derive client IP from a trusted proxy hop (fixed depth from the right / platform verified-IP header), not the leftmost XFF entry.

### L (batch) — Sensitive endpoints missing `withRateLimit`
- Only ~16 www handlers are wrapped; **zero** in superadmin. Notably unwrapped: `centers/me/admins/invite`, `roster/students/invite`, `roster/teachers/invite` (email-sending → mail-bomb / enumeration), the two global lookups (L4), and all check-in/lookup routes (`center/checkin/lookup` is a broad roster search). All are role-gated, so LOW, but add limits before launch.
- **The C2 login gap is the critical member of this class** — cross-referenced above.

### Verified OK (rate-limit)
- The manual `/auth/login`, `password/forgot` (5/60), `password/reset` (10/60), `invite/accept`, `register/*`, `center/walk-in` (30/30) + `resend`, `me/credentials` (10/10), `subscriptions/checkout`, `payments/initiate`, `payments/paymob/webhook` (120/120), and `search/*` (60/60) DO wrap `withRateLimit` — effectiveness caveated by M3.
- `walkin-token` provider is per-IP limited inside `authorize` (see §1 Verified OK).
- `forgot-password` returns a generic message (no response-based enumeration); reset token single-use + 1h TTL; `me/credentials` set-once.

---

## 7. Dependencies

`pnpm audit`: **13 advisories — 0 critical, 7 high, 6 moderate.** `--prod`: 5 (1 high, 4 moderate). **Every advisory is in dev/build-time transitive tooling** (eslint plugins, `@ducanh2912/next-pwa` build chain, `next-auth`'s bundled `uuid`, `next`'s bundled `postcss`, `@prisma/dev`). **No direct runtime dependency is vulnerable; the deployed request path is clean.**

| Package | Installed | Sev | Advisory | Patched | Path | Runtime-exploitable |
|---|---|---|---|---|---|---|
| minimatch | 3.1.2 | high ×3 | GHSA-3ppc-4f35-3m26 et al. | ≥3.1.4 | eslint-config-next | No (lint) |
| flatted | 3.3.3 | high ×2 | GHSA-25h7-pfq9-p65f, -rf6f-7fwh-wjgh | ≥3.4.2 | eslint flat-cache | No (lint) |
| picomatch | 2.3.1/4.0.x | high ×2 + mod ×2 | GHSA-c2c7-rcm5-vvqj, -3v7f-55p6-f55p | ≥2.3.2 / ≥4.0.4 | next-pwa/workbox | No (build) |
| brace-expansion | <1.1.13 | mod | GHSA-f886-m6hf-6m8v | ≥1.1.13 | eslint→minimatch | No (lint) |
| @hono/node-server | 1.19.11 | mod | GHSA-92pp-h63x-v22m | ≥1.19.13 | @prisma/dev | No (dev CLI) |
| postcss | 8.4.31 | mod | GHSA-qx2v-qp2m-jg93 | ≥8.5.10 | bundled by next | No (build CSS) |
| uuid | 8.3.2 | mod | GHSA-w5hq-g745-h8pq | ≥11.1.1 | next-auth | No (never passes `buf`) |

Direct security-sensitive deps are all current: `next@16.2.10`, `react@19.2.7`, `next-auth@4.24.14` (latest v4), `prisma`/`@prisma/client@7.8.0`, `bcryptjs@3.0.3`, `ws@^8.18.0`, `zod@4.4.3`, `jose@^6.0.11`, `socket.io@^4.8.3`, `@neondatabase/serverless@^1.1.0`. No `jsonwebtoken`.

**Fix:** pnpm `overrides` forcing the patched versions (or `pnpm update -r --latest` on the eslint/next-pwa toolchains) to clear the audit. Low urgency (no prod-runtime exposure), but should be zero before launch.

---

## 8. Web / Infra

### H4 — HIGH: No security headers on either app
- **Where:** `apps/www/next.config.ts`, `apps/superadmin/next.config.ts` — neither defines `headers()`; repo-wide grep for CSP/HSTS/X-Frame returns zero; no root `middleware.ts`.
- **Impact:** Both portals — including the full-DB-control back-office — are clickjackable (no `X-Frame-Options`/`frame-ancestors`), have no CSP to blunt XSS, no HSTS, no MIME-sniff protection.
- **Fix:** add `headers()` (or middleware) to both: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (superadmin → `frame-ancestors 'none'`) / `SAMEORIGIN` (www), and a CSP (start report-only).

### M7 — MEDIUM: Cron auth opens without a secret; GET-triggerable
- **Where:** `apps/www/src/app/api/v1/cron/[job]/route.ts:11-16,39` (confirmed first-hand).
- **What:** `authorized()` returns `true` whenever `CRON_SECRET` is unset **and** `NODE_ENV !== "production"` — any staging/preview without the env var exposes month-end statements, intent/subscription expiry, etc. unauthenticated. `export const GET = POST` makes side-effectful jobs triggerable by plain GET (prefetchers, link scanners, crawlers).
- **Fix:** require `CRON_SECRET` unconditionally (fail closed if unset, in every env); remove the `GET` alias or make GET read-only.

### Verified OK (web/infra)
- **Socket.IO CORS not wildcarded** — `origin: env.allowedOrigins` from `APP_ORIGIN` CSV, not `*`; 64 KB buffer cap.
- **Socket auth verifies a real JWT before any room join** — `io.use → verifySocketToken` (`jwtVerify`, audience `edura-realtime`, issuer `edura`); identity/role from token only, never client payload; 60s handshake TTL.
- **Internal `/internal/*` bridge requires the shared secret**, POST-only, 256 KB cap, zod-validated. (Secret-reuse + non-constant-time compare noted as M2 / L9.)
- **No SSRF** — every server-side `fetch` uses a hardcoded host (`graph.facebook.com`, `api.cloudinary.com`, `accept.paymob.com`, env-constant internal URLs). User input (phone number) only ever enters the request *body*, never the host.

---

## Prioritized recommendation

**Must fix before launch (blockers):**
1. **C1** — gate the mock gateway + `mock-complete` on `NODE_ENV`, require `PAYMOB_HMAC_SECRET` with no fallback in prod. *(A student paying nothing, or anyone forging settlements with a public key, is the single highest-impact bug.)*
2. **C2 + H5** — add rate-limiting **and** dummy-hash timing defense to both apps' NextAuth `authorize()` (one change closes both). Protects `super_admin`/`accountant` most of all.
3. **H1 + H2 + H3** — make payout request, payout settlement, and refund atomic with DB-level guards (`FOR UPDATE` / conditional `updateMany` / partial unique on `reversal_of_id`) and add `CHECK (wallet_balance >= 0)`. These are the money-integrity blockers.
4. **H4** — add security headers to both apps (cheap, high value for the back-office).

**Strongly recommended, batch with the above (cheap, meaningful):**
- M1 (webhook claim+settle atomicity / reconciliation), M2 (split the shared secret), M3 (shared-store rate limiter + trusted IP), M4 (generic prod errors), M7 (cron secret + drop GET), the dependency `overrides`.

**Recommended post-launch (or with the batch if time allows):**
- M5 (send-invite ownership check), M6 (PDF magic-byte check), M8 (kill `$queryRawUnsafe`), L1/L2 (session revocation + shorter back-office TTL), L3 (device-token reassignment), L4 (lookup rate-limit), L6 (backslash redirect), L9 (constant-time compare), L10 (walk-in idempotency).

**Optional / hygiene:** L5, L7, L8, the L-note on ledger role scoping (verify prod connection role).

**Overall:** the architecture is defensible for a production money platform — isolation, the ledger, amount-tampering, and the Step 4–8 money/delegation guards all held up under scrutiny. The blocker list is short and mechanical. Once C1/C2/H1–H5 are closed and the strongly-recommended batch is applied, this is launch-ready from a security standpoint.

*No code was modified in producing this report.*
