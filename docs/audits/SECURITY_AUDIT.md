# SECURITY_AUDIT.md — Edura application security audit (2026-09-11)

**Status:** Phase 1 (discovery) and Phase 2 (70-item + stack-specific audit) complete 2026-09-11. **All three remediation batches done 2026-09-11 — see §7; Phase 5 verification in §8.** DB-04's migration reached production 2026-09-12 (verify-db 33/33), so every finding is closed in the repo; what remains is the deploy and the console items in `SECURITY_TODO.md`.

**Scope:** the working tree at commit `4c4c1f4` plus the uncommitted work (public handles, teacher-days search, course delivery mode, superadmin teacher control) — audited because that is what ships next. Every workspace: `apps/erp`, `apps/superadmin`, `apps/www`, `apps/realtime`, `packages/{database,server-core,client-core,notifications,observability,ui,eslint-config,typescript-config}`.

**Relationship to the previous audit:** the 2026-09-06 audit (28 findings, all remediated in `3ad6f67`) now lives at `docs/security/security-audit-2026-09-06.md`. Every one of its fixes was re-verified against the current tree; **none regressed** (one was weakened at its call site — AUTH-03). References in `CLAUDE.md` and in code comments to "SECURITY_AUDIT.md M-xx / §4" mean that archived file; the pointers should be updated in the remediation batch that touches docs.

**Rules followed:** no secret values appear in this document; only variable names, file paths and masked prefixes. Every finding cites the line that proves it; nothing here was inferred without reading the code. Full per-area notes (route tables, census, method) are in the session scratchpad and can be regenerated.

---

## 1. Executive summary

Posture is **good for a pre-launch product of this size** — the previous audit's fixes hold, money paths are locked with row-level guards, sessions are DB-backed with hard revocation, and validation is uniformly schema-driven. Five things need to be fixed before real money flows: **1 Critical, 4 High, 10 Medium, 29 Low, 13 Info** (57 findings, plus 21 items that need a console/dashboard check).

**Top 3 risks:**
1. **SUPPLY-01 — Next.js 16.3.0 is inside the range of GHSA-2xp9-vwfh-vxw4 (unauthenticated RCE through the image optimizer with a crafted AVIF).** ERP has the optimizer on, accepts AVIF uploads, and allows any Cloudinary account as an image source. Upgrade to `next@16.3.3` today.
2. **ADMIN-01 — the better-auth admin plugin's `/api/auth/admin/update-user` is not sealed.** A back-office session that has not cleared 2FA can flip its own `twoFactorEnabled`, promote any ERP user to `super_admin`, rewrite login emails and reinstate suspended accounts — with no audit row.
3. **AUTHZ-01 — a centre manager can rewrite any roster student's login email** through the roster PATCH, then reset the password. Rosters are mostly minors.

Also High: two money-integrity defects (BIZ-01 orphan-capture credit refundable in cash while the wallet keeps it; BIZ-02 centre-credit online top-ups can never settle).

---

## 2. Attack surface map

| Layer | What | Notes |
|---|---|---|
| **Monorepo** | Turborepo 2.10, Bun 1.3.12 (package manager + `start` runtime), TypeScript 7.0.2 | One `bun.lock`, committed. `trustedDependencies` = 7 build-tool packages. No `bunfig.toml`. No remote cache (`TURBO_TOKEN`/`TURBO_TEAM` absent). |
| **Web apps** | Next.js **16.3.0** App Router, React 19.2.8 | `apps/erp` (product: center_admin / center_staff / teacher / assistant / parent / student), `apps/superadmin` (back office: super_admin / accountant), `apps/www` (marketing, one API route). No `"use server"` server actions anywhere (grep = 0). |
| **Realtime** | `apps/realtime` — Socket.IO 4.8 on `node:http`, `bun src/server.ts`, Railway | 60 s HS256 JWT minted by ERP; per-user send limiter; internal bridge secret-gated. Uses `@repo/database` `withPlatformContext` — no private DB client. |
| **Auth** | better-auth 1.6.25, two independent instances (own secret, own cookie prefix), DB sessions, `twoFactor` plugin (mandatory in back office, optional in ERP), custom `invite-token` and `view-as` plugins, `admin` plugin in superadmin (7 of 15 HTTP paths sealed) | Login door: `login-policy.ts` role→app. Revocation: `users.token_version` + trigger. |
| **Database** | Neon Postgres, Prisma 7.10 (`@prisma/adapter-neon` WS default, `pg` optional). App role `edura_app` NOBYPASSRLS; owner only in `DIRECT_URL`/`ADMIN_URL` | 84 tables, 41 with FORCE RLS, 80 migrations (incl. two uncommitted). Append-only for the app role: `transactions`, `points_ledger`, `session_settlements`, three wallet ledgers, `audit_logs`; `payments` undeletable. |
| **HTTP entry points** | ERP **242** `route.ts`; superadmin **252** route files / 254 handlers; www 1 (`/api/contact`) | Guard vocabulary: `withRole`, `requireRole`, `centerStaff()`, `delegated()`, `withErrors`+token/HMAC/secret gates. Intentionally public (both apps): `/api/auth/*`, `/api/health` (shallow), `_ping`, `csp-report`, register/password routes (rate-limited), public centre/teacher/course reads, catalog/search, contact, `/p/[handle]`. |
| **Machine entry points** | `POST /api/v1/payments/paymob/webhook` (HMAC-SHA512, integration allow-list), `POST /api/v1/cron/[job]` (9 jobs, `CRON_SECRET` fail-closed, POST-only), `POST /api/v1/internal/chat-notify` + realtime `/internal/*` (`INTERNAL_API_SECRET`), `/_next/image` (optimizer, **see SUPPLY-01**) | |
| **Money** | Gateway abstraction: `mock` driver (HMAC over raw body) + `paymob` driver; integer piasters; wallets (student/parent/centre) with conditional decrements; refunds through one door; payouts maker-checker | Every price snapshotted server-side; client sends ids + idempotency key only. |
| **Media / egress** | Cloudinary signed uploads (images magic-sniffed, PDFs `%PDF-` + 10 MB), SMTP (nodemailer), WhatsApp Cloud API (mock default), Web Push (VAPID), Sentry (`sendDefaultPii:false`, scrubbers), PostHog via `/ingest` rewrite | Outbound `fetch` to Cloudinary/WhatsApp has **no timeout** (NET-03). |
| **Secrets** | Env only. Tracked: 7 `*.example` files. `.gitignore` covers `.env*` in every workspace. `.gitleaks.toml` + full-history scan in CI + pre-commit hook. Three dev-only literal fallbacks (`VIEW_AS_SECRET`, `STUDENT_QR_SECRET`, mock HMAC) all throw in production. 15 `NEXT_PUBLIC_*` names, all public-by-design. | `git log --all -S` for `neondb_owner` / `NEXTAUTH_SECRET=` / `postgresql://` hits only example/template/CI-throwaway strings. |
| **Build / deploy** | Vercel (`scripts/vercel-build.sh` forgives only Bun's post-build signal exit), Railway (RAILPACK, `--frozen-lockfile`) | GitHub Actions: `ci.yml` (gitleaks, typecheck, unit, DB suites on throwaway labelled Postgres, seeds), `deploy.yml`, `deploy-drift.yml`, `cron.yml`, `backup.yml` (nightly age-encrypted dump to B2 + weekly restore proof), `migrate-production.yml` (dispatch-only, two-man rule). All actions pinned to **tags**, not SHAs. `ci.yml` uses zero repository secrets. |
| **Frontend** | No tokens in web storage (only UI state + an offline attendance outbox in IndexedDB by design). No production source maps (Sentry uploads then deletes). CSP with per-request nonce on ERP + superadmin; `apps/www` still `script-src 'unsafe-inline'`. | |
| **AI** | None. No LLM SDK in any manifest; no code path calls a model. `chatbot_*` tables are schema-only and inert (descoped). | Items 43–47 are N/A. |

---

## 3. Findings

Sorted Critical → High → Medium → Low → Info. Severity = impact × likelihood in this app; the one-line rationale is given.

### 3.1 Critical

#### SUPPLY-01 — Next.js 16.3.0 is affected by GHSA-2xp9-vwfh-vxw4 (unauthenticated RCE via AVIF in the image optimizer)
- **Severity:** Critical — remote code execution on the ERP lambda × high likelihood (public, unauthenticated endpoint, no special preconditions).
- **Location:** `apps/erp/package.json:59`, `apps/superadmin/package.json:40`, `apps/www/package.json:18`, `packages/server-core/package.json:31` (peer `>=16`); `apps/erp/next.config.ts:99-104`.
- **Evidence:** `bun audit` → `critical: Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used`. Advisory: affected `>=16.0.0 <16.3.3` (also `>=10 <15.5.24`); installed **16.3.0**. ERP config: optimizer enabled (no `unoptimized`, no custom `loader`), `remotePatterns: [{hostname:"res.cloudinary.com"}, {hostname:"picsum.photos"}]` with **no `pathname`** → any Cloudinary account is an accepted source; upload path also accepts `image/avif` (`packages/server-core/src/media/images.ts:14,21,41`). superadmin/www have local-only sources (lower reachability, still affected).
- **Impact:** an attacker hosts a crafted AVIF on any Cloudinary account and requests `/_next/image?url=https://res.cloudinary.com/<any>/…avif&w=64&q=75` on `edura-erp.vercel.app`. Code execution in the function that holds `DATABASE_URL`, `NEXTAUTH_SECRET`, `PAYMOB_*`.
- **Fix:** upgrade to `next@16.3.3` in all four manifests, `bun install`, rebuild all three apps. Interim/defence-in-depth: add `pathname: "/<our-cloud-name>/**"` to the Cloudinary pattern and remove `picsum.photos` from production config (CFG-02).
- **Verification:** `bun audit` shows no Next.js advisory; `cat apps/erp/node_modules/next/package.json | grep version` → 16.3.3; probe `/_next/image?url=https%3A%2F%2Fres.cloudinary.com%2Fdemo%2Fx.avif&w=64&q=75` → 400 (pathname not allowed). Manual: confirm on Vercel's advisory whether Vercel's edge optimizer serves `/_next/image` for this project (does not change the upgrade decision).

### 3.2 High

#### ADMIN-01 — better-auth `/api/auth/admin/update-user` (and 7 other admin-plugin paths) are not sealed
- **Severity:** High — 2FA-gate bypass + unaudited mass assignment on every `users` row × low-medium likelihood (needs a back-office password; the two staff accounts are the target set).
- **Location:** `apps/superadmin/src/lib/auth/auth.ts:35-43` (`SEALED_ADMIN_PATHS`, 7 entries); `:126-128` (the seal). Plugin surface: `node_modules/.bun/better-auth@1.6.25…/dist/plugins/admin/routes.mjs` exposes 15 paths.
- **Evidence:** sealed = create-user, set-role, set-user-password, ban-user, unban-user, remove-user, impersonate-user. **Unsealed** = `update-user`, `list-users`, `get-user`, `list-user-sessions`, `revoke-user-session(s)`, `has-permission`, `stop-impersonating`. `routes.mjs:231-304`: `update-user` takes `data: Record<any,any>` → `internalAdapter.updateUser(userId, data)`; guard is session-only (`adminMiddleware`) + `adminAc` permissions that `super_admin` holds. Only `password` is refused; `twoFactorEnabled`, `status`, `email`, `banned*` pass through (the `input:false` field flag is not enforced by the adapter factory). The app's own 2FA gate (`apps/superadmin/src/lib/auth/session.ts:84-92`) applies to `/api/v1/**`, not to `/api/auth/**`.
- **Impact:** a super_admin session that has not completed 2FA sets `twoFactorEnabled:true` on itself and passes the gate; can promote any ERP teacher/student to `super_admin`, reinstate a user suspended through `setUserSuspended`, write the `banned` columns the "one suspension mechanism" invariant forbids, change any login email, and `list-users` every user's PII — with **zero** `audit_logs` rows.
- **Fix:** seal the whole `/admin/*` prefix over HTTP in the `before` hook (keep server-side `auth.api.*` reachable, which carry no `ctx.request`), and extend `apps/superadmin/tests/db/admin-endpoint-sealing.test.ts:20-28` to assert every plugin path returns 404.
- **Verification:** fresh super_admin session without 2FA → `POST /api/auth/admin/update-user {userId:<self>, data:{twoFactorEnabled:true}}` → 404; the sealing test enumerates the plugin's route list dynamically so a plugin upgrade cannot reopen a path.

#### AUTHZ-01 — a centre manager can rewrite a roster student's login email (account takeover via password reset)
- **Severity:** High — full takeover of a (usually minor's) account × insider likelihood (centres are third parties; the roster PATCH is a normal daily screen).
- **Location:** `apps/erp/src/app/api/v1/roster/students/[studentId]/route.ts:23-40`; `packages/server-core/src/services/center/roster.ts:218-238`; `packages/server-core/src/services/auth/password-reset.ts:28-31`.
- **Evidence:** `patchSchema` accepts `email`; `updateRosterStudent` checks only `centerStudentRoster` membership, then `tx.user.update({ where:{id:studentId}, data:{ email } })` for **any** roster student (not only walk-in shells), with no confirmation to the new address, no notice to the old, no `tokenVersion` bump. `requestPasswordReset` looks up `users` by `email` + `status:'active'`.
- **Impact:** manager sets the child's email to one they control → requests a reset → owns the account (messaging, wallet view, guardian data, card). Also bypasses the "login email ≠ guardian email" rule that only the self-service door enforces (`email-change.ts:49-58`). M-06 hardened `me/email` only.
- **Fix:** in `updateRosterStudent`, allow `email`/`phone` writes only while `passwordHash IS NULL` (walk-in shell — the case `me/credentials` already models); for credentialed students route through `requestEmailChange` (verified, audited, both addresses notified). Audit before/after values; bump `tokenVersion` whenever a login identifier changes.
- **Verification:** DB test — manager PATCHes a credentialed student's email → 422 and `users.email` unchanged; same PATCH on a shell → allowed; audit row present.

#### BIZ-01 — orphan-capture wallet credit is refundable in cash while the wallet keeps the credit (double-spend)
- **Severity:** High — real money leaves twice × low-medium likelihood (a student can manufacture the precondition; a centre counter executes it in good faith).
- **Location:** `packages/server-core/src/services/subscriptions/subscriptions.ts:683-722`; `packages/server-core/src/services/payments/refund-payment.ts:207-216`; `apps/erp/src/app/api/v1/payments/[id]/refund/route.ts` (scopes `centerId: user.centerId`).
- **Evidence:** the H-03 orphan path writes a `payments` row with `centerId: sub.centerId` and credits the wallet with `type:"adjustment"` (`:717`). The H-01 gate that forces the wallet debit on refund matches only `walletLedger.findFirst({ where:{ paymentId, type:"topup" } })`.
- **Impact:** student starts a gateway checkout, pays the same plan from the wallet, then completes the iframe → credit branch. Centre refunds the orphan receipt in cash; wallet balance stays spendable. Loss = plan price per cycle.
- **Fix:** match the funding ledger row by `paymentId` regardless of `type` (or add `"adjustment"` to the match); refuse when the wallet cannot cover the debit.
- **Verification:** DB test — orphan capture → counter refund → either 422 or wallet debited in the same transaction; assert ledger sum.

#### BIZ-02 — centre-credit online top-ups can never settle (regression of H-03 rule 2; captured money never credited)
- **Severity:** High — money captured, nothing credited, permanent 500 on retry × certain when exercised (only reachable through mock-complete today).
- **Location:** `apps/erp/src/lib/services/wallet/center-credit-topup.ts:140-143`; `apps/erp/src/lib/services/payments/payment-intents.ts:494-502`.
- **Evidence:** the top-up settle path links only `transactionId`; the post-settle assertion reads `paymentIntent.paymentId` and throws `Settlement of intent … wrote no payment row` when null → whole claim rolls back. The only test (`center-credit-clearing.test.ts:235`) inserts the intent already `paid`, so nothing is red. Reachable via `admin-fees-screen.tsx:189-192`.
- **Impact:** a centre pays for platform credit online; provider retries forever; balance never moves; support incident with real money.
- **Fix:** write a `payments` row for this purpose (consistent with "an intent is never paid without a payments row") or make the assertion purpose-aware. Add a test that drives the real claim path.
- **Verification:** DB test through `claimAndSettle` for a `center_credit` intent → `paid`, ledger credited, no throw.

### 3.3 Medium

#### DB-03 — 2FA backup codes stored in plaintext
- **Severity:** Medium — any DB read yields working second factors for the two back-office staff × low likelihood (requires DB access; TOTP secrets are encrypted so the design intended otherwise).
- **Location:** `apps/erp/src/lib/auth/auth.ts:171`, `apps/superadmin/src/lib/auth/auth.ts:165` — `twoFactor({ issuer })` only. Plugin: `dist/plugins/two-factor/backup-codes/index.mjs:17-24` encrypts only when `storeBackupCodes === "encrypted"`.
- **Fix:** `twoFactor({ issuer, backupCodeOptions: { storeBackupCodes: "encrypted" } })` in both apps; regenerate existing codes.
- **Verification:** `SELECT left(backup_codes,2) FROM two_factors` → not `["`.

#### OPS-01 — material PDFs are served by a permanent public URL; the "signed URL" branch is dead and not a Cloudinary signature
- **Severity:** Medium — a paid material link is a permanent bearer credential × medium likelihood (links get shared).
- **Location:** `apps/erp/src/lib/services/materials/materials.ts:268-272`; `packages/server-core/src/media/cloudinary.ts:122-127`; upload at `materials.ts:124` (`resource_type:"raw"`, no `type:"authenticated"`).
- **Evidence:** `if (material.cloudinaryUrl) return { url: material.cloudinaryUrl };` precedes `generateSignedUrl`, and every upload persists `cloudinaryUrl`. `generateSignedUrl` emits `s--<sha1 hex>--/e_<ts>/` — Cloudinary's URL signature is an 8-char base64url of sha1(path+secret) and `e_` is an effect, not an expiry; the URL would not validate even if reached.
- **Fix:** upload with `type:"authenticated"`, stop persisting `cloudinaryUrl`, and generate real signed/auth-token URLs (or stream downloads through the authenticated route, which already checks enrolment).
- **Verification:** open a stored `materials.cloudinary_url` in a private window → 401/404 after the fix.

#### AUTH-02 — registration conflict message reveals that a phone/email belongs to a walk-in child
- **Severity:** Medium — anonymous, one request, confirms a minor is registered at a centre × high likelihood.
- **Location:** `apps/erp/src/lib/services/auth/register.ts:58-71` (via `register/{student,parent,teacher}/route.ts`).
- **Evidence:** `if (conflict.status === "shell") throw new ConflictError("…registered at a centre — use the link…")` else `"Email or phone already in use"`.
- **Fix:** one conflict message for both branches; deliver the "use the centre's link" hint through the invite mail/WhatsApp instead.
- **Verification:** extend `h02-register-shell-gate` with a byte-identical-message assertion for shell vs active conflict.

#### ADMIN-02 — several back-office writes produce no `audit_logs` row
- **Severity:** Medium — the "all superadmin writes go to an audit log" convention is false for these; forensic gap × certain.
- **Location:** blacklist add/remove `packages/server-core/src/services/blacklist/blacklist.ts:271,395,404`; points rules CRUD + manual adjust `apps/superadmin/src/lib/services/points/points-admin.ts:71-107`; wallet-settings PUT `settings/wallet-settings-admin.ts`; payouts generate/approve/reject/pay `finance/payouts.ts` (row attribution only; `:374` reject overwrites `approvedBy`).
- **Fix:** `writeAdminAudit` in the same transaction for each; keep `approvedBy` and add `rejectedBy`.
- **Verification:** grep census of mutating superadmin services without `writeAdminAudit` → 0.

#### INJ-01 — open redirect after login via `?next=/\evil.com`
- **Severity:** Medium — post-login phishing hop from the real host × moderate likelihood (one crafted link). No cookie leaks.
- **Location:** `apps/erp/src/app/[locale]/login/page.tsx:28-30, 51-52, 129`.
- **Evidence:** `isSafeNext = v.startsWith("/") && !v.startsWith("//")`; `window.location.href = next`. Proof: `new URL("/\\evil.com","https://edura-erp.vercel.app").href === "https://evil.com/"`; `?next=/%5Cevil.com` decodes to it.
- **Fix:** reject `^\/[\/\\]` (or resolve against `location.origin` and compare origins). Add unit cases `/\evil.com`, `/%5Cevil.com`, `//evil.com`.
- **Verification:** unit test + browser: `login?next=/%5Cevil.com` stays on the app after sign-in.

#### DIFF-01 — a tenant subdomain still serves `/api/**` (contradicts the "auth never on a subdomain" decision)
- **Severity:** Medium — sign-in on `<handle>.<root>` would mint a subdomain-scoped cookie × low today (feature dormant: no `PUBLIC_ROOT_DOMAIN`), medium once DNS exists.
- **Location:** `apps/erp/src/proxy.ts:66` (matcher excludes `api|ingest|_next|_vercel` and dotted paths) vs `:16-37` (`tenantHostResponse`); `docs/decisions/public-handles.md:57-62`; `tests/unit/tenant-host-proxy.test.ts:49-55` (feeds page paths straight to `middleware()`, bypassing the matcher).
- **Fix:** refuse tenant hosts independently of the matcher (host check in the route kernel or widen the matcher + short-circuit); test through the exported `config.matcher`.
- **Verification:** `curl -H 'Host: x.<root>' …/api/v1/centers/<id>` → not 200.

#### DIFF-02 — the meeting link is gated on roster membership, not paid coverage
- **Severity:** Medium — "the meeting link is a paid credential" (decision doc) is violated for refunded/expired students × certain once online courses run.
- **Location:** `apps/erp/src/app/api/v1/courses/[id]/route.ts:53-73` (reveals `onlineUrl` when an `enrollment.status="active"` exists). Coverage helper already exists: `packages/server-core/src/services/subscriptions/coverage.ts:3-26`.
- **Fix:** gate on an active subscription/pass covering today (reuse `coveredStudentIds`), plus the owning teacher/centre.
- **Verification:** DB test — subscribe → full refund → `GET /api/v1/courses/[id]` → `onlineUrl` null.

#### BIZ-03 — monthly coverage window starts at purchase time, so the purchase-day lesson is not covered
- **Severity:** Medium — counter shows `needs_payment` for a student who just paid the month × high likelihood (every same-day purchase).
- **Location:** `subscriptions.ts:158` (`periodStart: now`); `session-generator.ts:24-27` (sessions at 00:00 UTC); `coverage.ts:16-19` (`periodStart <= session.date`).
- **Fix:** anchor `periodStart` to start-of-day in `PLATFORM_TIME_ZONE`.
- **Verification:** unit test — purchase at 15:00 covers that day's 00:00 session; day 31 not covered.

#### BIZ-05 — post-registration temp-student claim destroys wallet balance and paid coverage
- **Severity:** Medium — student money and coverage silently lost × low-medium (cash top-ups onto shells are possible, `cash-topup.ts:34-38`).
- **Location:** `packages/server-core/src/services/temp-students/temp-students.ts:189` (re-points `payments`), `:219` (deletes the profile that carries `walletBalance`); `subscriptions.studentId` and `wallet_ledger` never re-pointed.
- **Fix:** re-point subscriptions and wallet ledger rows, carry the balance, or refuse the claim while the shell holds balance/coverage.
- **Verification:** DB test — shell with balance + active pass → claim → balance and pass on the surviving account.

#### WEBHOOK-01 — Paymob refund/void callbacks are likely classified as `capture` (needs sandbox confirmation)
- **Severity:** Medium — no money can move (intent already `paid` → `replay`), but the `unsolicited_refund` audit/finance notice never fires and a partial refund yields a misleading `needs_review` × unknown until measured.
- **Location:** `apps/erp/src/lib/services/payments/gateway/types.ts:88-95` keys on `is_refunded`/`is_voided` (set on the *parent*); delivered refund/void objects carry `is_refund`/`is_void` + `parent_transaction`; `payment-intents.ts:288-314`.
- **Fix:** treat `has_parent_transaction`/`parent_transaction` as a reversal; record fixture payloads from the sandbox.
- **Verification:** sandbox refund → `audit_logs` row `unsolicited_refund`; unit test with captured fixtures.

### 3.4 Low

| ID | Title | Location | Fix |
|---|---|---|---|
| AUTH-01 | Login returns `USER_NOT_FOUND` vs `Invalid email or password` (email oracle; timing side is equalised, message side is not). Superadmin login is clean. | `apps/erp/src/lib/auth/auth.ts:127` vs `:146-148`; `login/page.tsx:93,158` | Same message both branches; show the register nudge on any failure |
| AUTH-03 | `if (!process.env.ALLOW_UNSHARED_RATE_LIMIT) assertSharedRateLimitStore()` — any non-empty value (`0`, `false`) skips the boot assert, so the L-11/L-12 checks never run | `apps/erp/instrumentation.ts:8`, `apps/superadmin/instrumentation.ts:8` | Call unconditionally; the function already gates on `=== "1"` |
| AUTH-04 | better-auth default `/api/auth/change-password` is live in both apps: only `minPasswordLength`, no letter+digit policy, and the mirror trigger does not bump `token_version` → sessions survive a password change (contradicts L1 and the sanctioned `changeOwnPassword`) | both `api/auth/[...all]/route.ts:9-11`; trigger `20260801170000_better_auth/migration.sql:140-171` | Seal `/change-password` in `hooks.before` or bump `tokenVersion` in an account-update DB hook |
| AUTH-05 | `/two-factor/*` limited only by better-auth's in-memory limiter (per lambda), not the Redis bucket | `superadmin/auth.ts:114-121`, `erp/auth.ts:90-99` | Add a `checkRateLimit("2fa:"+ip)` branch in the `before` hook |
| AUTH-06 | Admin-sent password reset for ERP users builds the link on `APP_BASE_URL` (= back-office host per runbook); superadmin has no reset page and no `me/password` route; ERP `POST /auth/password/reset` is not app-gated | `admin-users.ts:323`; `password-reset.ts:54-55`; `http/app-url.ts:3-9` | Pass `{linkBaseUrl: ERP_BASE_URL, app:"www"}` for ERP targets; add a staff reset/change door |
| AUTH-07 | `acceptInvite` activates by `row.email` without `passwordHash === null`, sets password + `active` + `emailVerified` on an existing credentialed account, no `tokenVersion` bump; `inviteCenterAdmin` can issue such a token for any existing user | `invite-accept.ts:30-39`; `center/admins.ts:100-113` | Require `passwordHash === null` to set credentials; affiliation-only otherwise; bump `tokenVersion` |
| BIZ-04 | `POST /api/v1/payments/initiate` writes payment + ledger + points but no subscription/enrolment and no blacklist check; no UI caller | `payment-intents.ts:34-107, 549-612` | Delete, or make it create a pending subscription |
| BIZ-06 | Walk-in `markAttendance` writes `present` ignoring the per-teacher attendance mode (decision #4); counted by settlement | `subscriptions.ts:845-861`; callers `admin-fees-screen.tsx:295`, `center-money.ts:117` | Route through `counterCheckin` |
| BIZ-07 | Points never clawed back on refund | `refund-payment.ts` (no points write) | Reverse the points event in the refund tx |
| BIZ-08 | Blacklist checked after the pending subscription row commits on the gateway path | `subscriptions.ts:477` | Check before the write |
| ADMIN-03 | Accountant reaches finance data outside `/api/v1/finance/**` | `admin/session-settlements/export/route.ts:7` | Move under `/finance` or document |
| RT-01 | `typing` and `conversation:read` socket events have no limiter; unknown ids miss the cache and hit the DB per event | `apps/realtime/src/server.ts:186-232` | Reuse `limiter` |
| RT-02 | Internal `chat-notify` never binds `recipientId`/`body` to the message row (only a compromised realtime host could abuse) | `internal/chat-notify/route.ts:29-49` | Derive both from DB |
| DIFF-03 | `courses.online_url` validated with `z.string().url()` — accepts `javascript:`/`data:`; not rendered as `href` yet (latent stored XSS) | `courses/route.ts:162`, `courses/[id]/route.ts:126`, `center/courses.ts:55-62` | `https?` allow-list in `resolveDelivery` |
| DIFF-04 | Superadmin `photoUrl: z.url()` accepts any host/scheme → lands in public `<img src>`/OG | `admin/teachers/[id]/route.ts:28` (same as `centers/[id]:25`) | Restrict to the Cloudinary host |
| DIFF-05 | Unvalidated `?deliveryMode=` cast → Prisma validation error → 500; `new Date(from)` on garbage → 500 (super_admin only) | `courses/route.ts:92-94`; `teacher-oversight.ts:33-34` | zod enum / date schema |
| DIFF-06 | Superadmin PATCH `email: z.email()` not lowercased while `users.email` is case-sensitive `@unique` → mixed-case defeats login lookup and clash check | `teachers/[id]/route.ts:22`; `teacher-control.ts:239-245` | Use the lowercasing `emailSchema` |
| DIFF-07 | Reserved-handle list is exact-match only (`edura-support`, `paymob-pay` allowed); rename frees the old handle instantly; no audit on set/clear | `handle-rules.ts:18-31`; `public-handles.ts:108` | Prefix/substring reserved rules; cool-down on released handles; audit |
| DB-02 | 43 of 84 tables have no RLS, incl. `auth_sessions`, `two_factors`, `invite_tokens`, `password_reset_tokens`, messages, `payment_intents`, `wallet_ledger`, `student_profiles`, `users`, `public_handles`. Code scoping is the control (see DB-01). | migrations; `schema.prisma` | Add a DB test asserting the RLS table set (like `search-normalize.test.ts` does for `search_text`) |
| DB-04 | `edura_app` holds DELETE on `users`; soft-delete is a Prisma extension only | `bootstrap-app-role.ts:90-93` | `REVOKE DELETE ON users`; add to verify-db's append-only map |
| OPS-02 | B2 backup key is read+write and Object Lock is off — a leaked key deletes every backup | `docs/runbooks/backup-restore.md:73,127`; `backup.yml:130-157` | Write-only key for the dump job; separate read key for restore-proof; enable Object Lock (manual) |
| OPS-03 | ERP audit gaps: login success/failure, password change/reset, 2FA enable/disable, assistant/staff removal, session revocation write nothing | `auth.ts:101-150`; `password-reset.ts` | Add audit writes; add action strings |
| NET-01 | No `Permissions-Policy` header on any app | all three `next.config.ts` `securityHeaders` | Add (scope `camera=(self)` for QR pages) |
| NET-02 | `apps/www` CSP `script-src 'self' 'unsafe-inline'` | `apps/www/next.config.ts:15` | Nonce like ERP |
| NET-03 | Outbound `fetch` to Cloudinary and WhatsApp has no timeout | `media/cloudinary.ts:93,147`; `whatsapp/cloud-api-driver.ts:30` | `signal: AbortSignal.timeout(15_000)` |
| DISC-01 | No global Prisma `omit` for `passwordHash`/`tokenVersion`; today every read is a narrowed `select` (10 sites) — one future unselected query leaks the hash | `packages/database/src/client.ts:43` | `omit: { user: { passwordHash: true, tokenVersion: true } }` |
| CFG-01 | Zero `server-only` imports — no compile-time guard against a server module (DB client, secrets) entering a client bundle | `packages/database`, `packages/server-core` | `import "server-only"` in the entry modules |
| CI-01 | Only `deploy-drift.yml` declares `permissions:`; other workflows run with the default `GITHUB_TOKEN` scope | `.github/workflows/*.yml` | `permissions: contents: read` at top level; repo default read-only (manual) |
| CI-02 | `${{ inputs.jobs }}` / `${{ inputs.confirm }}` interpolated into `run:` shell (maintainer-only, but the cron job holds `CRON_SECRET`) | `cron.yml:34`, `migrate-production.yml:96` | Pass through `env:` |

### 3.5 Info

| ID | Note |
|---|---|
| SUPPLY-02 | GHSA-p293-qw3h-jr36 (Next.js Windows RCE) — same ranges, Windows-hosted only → N/A on Vercel/Railway Linux; closed by the same upgrade. |
| SUPPLY-03 | Remaining `bun audit` items unreachable: `mysql2` (optional peer via prisma→better-auth; no MySQL, `client.ts:28` only branches on `pg`), `browserslist` ×2 (build-time, needs attacker `browserslist-stats.json`), `uuid@8` via `exceljs` (super_admin-only export). 14 → expect 11 after the Next upgrade; the rest are tooling. |
| CFG-02 | `picsum.photos` in production `images.remotePatterns` (`apps/erp/next.config.ts:102`) — demo leftover; remove. |
| AUTH-08 | Four roster invite routes leak the raw invite token in `meta` when `NODE_ENV!=="production" \|\| E2E==="1"` — safe iff `E2E` is never set on Vercel (manual). |
| AUTH-09 | `NEXTAUTH_URL ?? "http://localhost…"` → `useSecureCookies=false` if unset in prod (`erp/auth.ts:30-31`, `superadmin/auth.ts:50-51`); login would break loudly, but throw explicitly. |
| AUTHZ-02 | `team-notes` routes list `ACCOUNTANT` in `staffAllow` for mutating methods; harmless (central read-only rule at `center-actor.ts:73-75`) but misdescribes intent. |
| DIFF-08 | `/p/[handle]`, `centers/[id]`, `courses/[id]` public reads are unthrottled; `resolvePublicProfile` runs twice per view. |
| DIFF-09 | `public_handles` has no RLS; tenancy enforced by session-derived `where`. |
| INJ-03 | One `$executeRawUnsafe` with interpolation in a test fixture (`apps/superadmin/tests/db/maturity-layer.test.ts:389`), outside M8's scanner roots. Add `tests/` to ROOTS or use tagged SQL. |
| CI-03 | `ci.yml:38` downloads the gitleaks tarball without a checksum. |
| DB-01 | Design statement: RLS bypass is self-service for `edura_app` (`client.ts:191` runs `set_config('app.bypass_rls','on',true)`); `withTenant` applies only to `center_admin`. RLS is defence-in-depth against a forgotten `where centerId` and against bare `prisma.*` calls (which fail closed on the 41 FORCE tables) — not a second trust boundary. Worth stating in `docs/` so nobody relies on it as one. |
| OPS-04 | A hand-written `auditLog.create` with `centerId: null` inside a `center_admin` tenant tx would fail RLS WITH CHECK and abort the tx (auto-audit is savepointed; manual writes are not). |
| WEBHOOK-02 | Boolean/null rendering in the Paymob HMAC material (`paymob-driver.ts:52-56`) fails closed if wrong — confirm byte-exact in sandbox. |

### 3.6 Prior findings re-verified (2026-09-06 audit)

All 28 hold in the current tree: H-01 (`refund-payment.ts:207-221`), H-02 (`register.ts:52-95`), H-03 (`payment-intents.ts:451-521`), H-04 (`gateway/types.ts:28-45`, `paymob-driver.ts:115-129`), M-01 (`sessions/[id]/route.ts:18-26`), M-02 (`subscriptions.ts:487-525`), M-03 (`payouts.ts:240-356` + migration 78), M-04 (migration 77), M-05 deferred with the interim guard, M-06 (`email_change_requests`), M-07 (`gateway/index.ts:24-32`), M-08 (kept by decision, super_admin-only + audited), M-09 (nonce CSP, `ignoreBuildErrors` removed, `scripts/vercel-build.sh`), M-10 (`health/route.ts:17-35`), M-11 (request side), L-01…L-13. Weakened at the call site: L-11/L-12 (AUTH-03). Not app-gated on the redeem side: M-11 (AUTH-06).

---

## 4. Checklist — 70 items

Verdicts: **Pass / Fail / Partial / Manual / N/A**.

| # | Check | Verdict | Evidence / finding |
|---|---|---|---|
| **A. Secrets & configuration** | | | |
| 1 | Exposed database credentials | Pass | Only CI throwaway `postgres:postgres@localhost` and test literals; env examples empty |
| 2 | Public or committed `.env` files | Pass | `git ls-files` → 7 `*.example` only; `.gitignore` `.env*` root-wide |
| 3 | Hardcoded API keys/secrets | Pass | Three dev fallbacks throw in production (`view-as-token.ts:17-25`, `student-qr.ts:15-23`, `mock-driver.ts:11-19`) |
| 4 | Secrets in git history | Pass | gitleaks full-history in CI + pre-commit; `.gitleaks.toml` allowlists one immutable rotated commit; `-S` searches hit templates only |
| 5 | Secrets in frontend bundles | Pass | 15 `NEXT_PUBLIC_*`, all public-by-design; no `"use client"` reads a private var; CFG-01 (no `server-only`) noted |
| 6 | Build logs leaking secrets | Pass | turbo `env` values hashed, never stored; `write-env-local.sh:27` "values not echoed"; no remote cache |
| 7 | Default credentials | Pass | `Passw0rd!` only in `is_demo` seeds; `seed.ts:25-27` requires `SEED_*_PASSWORD`; quick-login gated `NODE_ENV` |
| 8 | Exposed environments | Manual | Vercel preview protection; Neon test branch was cut from production (label guard only) |
| **B. Authentication & sessions** | | | |
| 9 | Weak/missing authentication | Pass | bcrypt(10) + dummy-hash compare, Redis login buckets, DB sessions |
| 10 | Session management | Pass | 30 d / 24 h, DB-backed, `token_version` revocation trigger, per-app cookie prefixes |
| 11 | JWT issues | Pass | Realtime HS256 60 s with aud/iss; view-as HMAC 60 s single-target + `jti` unique; invite/reset tokens hashed |
| 12 | Password reset flow | Partial | Tokens 256-bit sha256-hashed, TTL, single-use — AUTH-04 (parallel change door), AUTH-06 (redeem not app-gated; admin link host) |
| 13 | Account enumeration | Fail | AUTH-01 (login message), AUTH-02 (register shell oracle) |
| 14 | MFA for privileged accounts | Pass | Mandatory in back office (`session.ts:90` fail-closed at API layer); ERP optional by design. DB-03 backup codes plaintext |
| 15 | OAuth | N/A | No providers |
| 16 | Cookie settings | Pass | httpOnly, `SameSite=Lax`, `__Secure-` prefix when https, host-only; AUTH-09 caveat |
| 17 | Sensitive data in browser storage | Pass | No tokens; UI state + offline attendance outbox only |
| **C. Authorization & access control** | | | |
| 18 | Missing server-side authz | Pass | 242 ERP + 252 superadmin routes tabulated; every unguarded route intentionally public |
| 19 | Users accessing other users' data | Fail | AUTHZ-01 |
| 20 | IDOR / BOLA | Pass | ~30 dynamic routes + services checked; M-01/L-08 intact |
| 21 | Admin routes unprotected | Fail | ADMIN-01 (plugin surface). App routes: 214 super_admin, 23 finance-shared, 13 self-scoped — all guarded |
| 22 | Client-side-only checks | Pass | Only two server-fetching pages, both `requirePortal`; `proxy.ts` is locale+nonce only |
| 23 | Tenant isolation | Pass | `requireCenterScope`/`centerStaff` re-key; RLS for center_admin; no shared per-user cache (`"use cache"` only on the permanent catalog) |
| 24 | Mass assignment | Partial | App routes strict; ADMIN-01 via plugin |
| 25 | Excessive DB permissions | Partial | NOBYPASSRLS, no CREATE/TRUNCATE; DB-04 DELETE on `users` |
| 26 | DB read/write permissions / RLS | Partial | 41 FORCE-RLS tables, `set_config(...,true)` first statement in `$transaction` (no pooled-connection leak); DB-01/DB-02 |
| 27 | Storage buckets | Fail | OPS-01 materials public; images intentionally public; uploads signed; OPS-02 backup key |
| 28 | Frontend-only payment checks | Pass | Prices snapshotted server-side; client sends ids + idempotency key |
| 29 | Business-logic abuse | Partial | BIZ-01…08 |
| 30 | Race conditions | Pass | Conditional single-statement decrements, `FOR UPDATE`, partial uniques, `updateMany where status` claims |
| **D. Input handling & injection** | | | |
| 31 | Input validation | Pass | Only `req.json()` is inside `parseJson`; pagination clamped via `parsePageLimit`; DIFF-05 two uncast query params |
| 32 | SQL injection | Pass | Zero `*RawUnsafe`/`Prisma.raw` in shipped code; dynamic WHERE via `Prisma.sql`+`Prisma.join`; INJ-03 test-only |
| 33 | NoSQL injection | N/A | |
| 34 | Command injection | Pass | `child_process` only in tooling with argv arrays |
| 35 | XSS | Pass | One constant `dangerouslySetInnerHTML` (www layout); React-email templates; DIFF-03 latent |
| 36 | CSRF | Pass | `SameSite=Lax` + JSON API + `trustedOrigins`=baseURL; no mutating GET |
| 37 | Insecure deserialization | Pass | `JSON.parse` only after HMAC/`timingSafeEqual` or on own cookies |
| 38 | Path traversal | Pass | Static slug lists; preview dir dev-only + sanitised; Cloudinary ids server-derived |
| 39 | SSRF | Pass | All server `fetch` targets fixed/env; user URLs stored, never fetched; `remotePatterns` scoped (CFG-02) |
| 40 | Open redirects | Fail | INJ-01 |
| 41 | Insecure file uploads | Pass | Magic bytes, size caps, no SVG, signed Cloudinary params, ownership-before-upload |
| 42 | APIs trusting input for identity/role/price/ownership | Pass | Identity from session; prices from course owner only; ADMIN-03 path nit |
| **E. AI-specific** | | | |
| 43–47 | Prompt injection / AI auth / AI perms / AI output / AI leakage | N/A | No LLM SDK, no model call; `chatbot_*` tables inert (descoped) |
| **F. Network, transport & headers** | | | |
| 48 | Permissive CORS | Pass | No CORS headers on Next apps; realtime explicit origin list, refuses loopback in prod |
| 49 | Security headers | Partial | HSTS preload, nosniff, Referrer-Policy, XFO, nonce CSP (erp/superadmin); NET-01 no Permissions-Policy; NET-02 www CSP |
| 50 | Rate limits | Partial | 11 direct + 38 wrapped routes; Redis required in prod (`rediss://`); AUTH-05 (2FA), RT-01, DIFF-08 |
| 51 | Timeouts | Partial | Realtime/www/SMTP/ky/Prisma/Redis bounded; NET-03 Cloudinary + WhatsApp missing |
| 52 | Encryption in transit / at rest | Partial | `pg-ssl.ts` pins `verify-full`; Neon WS TLS; backups age-encrypted; DB-03 backup codes plaintext |
| 53 | Unsecured endpoints | Pass | All dedicated secrets fail closed in prod |
| **G. Webhooks & integrations** | | | |
| 54 | Unsigned webhooks | Pass | HMAC-SHA512 over Paymob's 20 `obj` fields, `timingSafeEqual`, integration allow-list fail-closed |
| 55 | Webhook replay | Pass | Idempotent by intent status; mismatches parked once as `needs_review`; WEBHOOK-01 classification |
| 56 | Fail-open checks | Pass | No swallowing catch on auth/HMAC/validation; mode/driver/mock-complete fail closed |
| **H. Information disclosure** | | | |
| 57 | Verbose errors | Pass | `errors/http.ts:47-52` fixed "Internal error" in prod, real error logged |
| 58 | Debug pages in prod | Pass | `ui-preview`/`receipt-preview` `notFound()`; quick-login gated; deep health needs `CRON_SECRET` |
| 59 | Internal dashboards | Pass | None exposed; Sentry/PostHog external |
| 60 | Exposed logs | Pass | Console logs carry ids only; Sentry `sendDefaultPii:false` + scrubbers |
| 61 | Source maps | Pass | No `productionBrowserSourceMaps`; Sentry `deleteSourcemapsAfterUpload:true` |
| 62 | Sensitive info in responses | Pass | All `passwordHash` reads narrowed; DISC-01 recommends global `omit` |
| **I. Supply chain & CI/CD** | | | |
| 63 | Vulnerable dependencies | Fail | SUPPLY-01 (Critical); SUPPLY-03 rest unreachable |
| 64 | Malicious/typosquatted packages | Pass | 7 justified `trustedDependencies`; one `postinstall` (`prisma generate`) |
| 65 | Unpinned build deps | Pass | `packageManager` pinned; `--frozen-lockfile`; `>=16` is a peerDependency only |
| 66 | Untrusted build actions | Partial | All `uses:` are version tags (`@v4`, `@v2`), not commit SHAs |
| 67 | Insecure CI/CD | Partial | `ci.yml` uses no secrets; no `pull_request_target`; CI-01 permissions; CI-02 input interpolation; branch protection manual |
| 68 | Unreviewed code paths | Partial | BIZ-04 (`payments/initiate`, no caller); CI-03 |
| **J. Operations & resilience** | | | |
| 69 | Audit logs for security events | Partial | ADMIN-02 (back office), OPS-03 (ERP); `audit_logs` append-only |
| 70 | Monitoring / backups | Partial | Nightly dump + weekly restore into scratch cluster with count/integrity checks; OPS-02 key scope; Sentry alert rules manual |

### 4.1 Stack-specific checks

| Area | Check | Verdict |
|---|---|---|
| Turborepo/Bun | `env` hashed not stored; `passThroughEnv` neither; `.turbo` ignored; no remote cache token | Pass |
| | `.env*` gitignored in every workspace; history scan | Pass |
| | Single committed `bun.lock`; `bun audit` reviewed; `trustedDependencies` justified; no `bunfig.toml` | Pass (SUPPLY-01 aside) |
| | `server-only` in DB/auth packages | **Fail** (CFG-01) |
| Next.js 16 | Installed version vs advisories | **Fail** (SUPPLY-01) |
| | Auth not middleware-only; every handler guards itself | Pass |
| | Server Actions | N/A (none) |
| | `NEXT_PUBLIC_*` inventory | Pass |
| | `next.config`: remotePatterns / sourcemaps / headers / redirects / body limit | Partial (CFG-02, NET-01, NET-02) |
| | Route handlers scaffold-only | Partial (BIZ-04) |
| | `dangerouslySetInnerHTML`/eval | Pass |
| | Shared-cache leakage | Pass |
| Prisma/Neon | Raw SQL parameterised | Pass |
| | Mass assignment | Pass (app) / Fail (ADMIN-01) |
| | Tenant scoping via helper/extension | Pass with DB-01 statement |
| | `sslmode=require`, pooled vs direct, non-owner role | Pass (`pg-ssl.ts`; owner only in `DIRECT_URL`/`ADMIN_URL`); examples lack `sslmode` guidance |
| | Neon branches / PITR | Manual |
| | `migrate deploy` only; `prisma.config.ts` refuses dev/reset/push/execute in prod | Pass |
| | Sensitive fields omitted | Partial (DISC-01) |
| Better Auth | Secret env-only, `baseURL` explicit | Pass (AUTH-09 caveat) |
| | `trustedOrigins` explicit | Pass |
| | Session `expiresIn`/`updateAge`, cookie attrs, invalidation | Pass; AUTH-04 change-password gap |
| | Built-in rate limiter | Partial (memory storage; AUTH-05) |
| | Email verification / single-use tokens / no enumeration | Partial (AUTH-01, AUTH-02) |
| | Plugins: `twoFactor`, `admin` (superadmin), `invite-token`, `view-as`, `nextCookies` — roles enforced server-side | Partial (ADMIN-01 unsealed paths) |
| | `sendResetPassword` unset (invariant) | Confirmed |
| | Single handler, shared Prisma, no parallel login | Pass (AUTH-04 is a parallel *change*) |
| | MFA for privileged | Pass |

---

## 5. Needs manual verification (console / dashboard / live probe)

1. **Vercel image optimizer exposure** — confirm on Vercel's advisory page whether `/_next/image` for this project is served by Vercel's edge optimizer; upgrade regardless.
2. **Post-upgrade probe** — `https://edura-erp.vercel.app/_next/image?url=https%3A%2F%2Fres.cloudinary.com%2Fdemo%2Fx.avif&w=64&q=75` → 400.
3. **ADMIN-01 repro on dev** — super_admin session without 2FA → `POST /api/auth/admin/update-user` as described; expect 200 today, 404 after.
4. **AUTHZ-01 PoC** — run against the local test DB.
5. **2FA backup codes** — `SELECT left(backup_codes,2) FROM two_factors LIMIT 3;` on dev.
6. **App-role grants** — `SELECT table_name, string_agg(privilege_type,',') FROM information_schema.role_table_grants WHERE grantee='edura_app' AND table_name IN ('users','audit_logs','payments','wallet_ledger') GROUP BY 1;`
7. **RLS bypass proof (DB-01)** — as `edura_app`: `BEGIN; SELECT set_config('app.bypass_rls','on',true); SELECT count(*) FROM centers; ROLLBACK;`
8. **RLS table set** — `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE nspname='public' AND relkind='r' AND NOT relrowsecurity ORDER BY 1;` — compare with the 43-table list in the DB notes.
9. **Material URL** — open one `materials.cloudinary_url` in a private window (expect 200 today).
10. **B2 console** — application key capabilities (read+write today), Object Lock, lifecycle rules 7 d / 4 w.
11. **Sentry → Alerts** — at least one alert rule per project.
12. **Vercel env (both projects)** — `NEXTAUTH_URL` https per project; distinct `NEXTAUTH_SECRET`/`SUPERADMIN_NEXTAUTH_SECRET`; `VIEW_AS_SECRET` and `STUDENT_QR_SECRET` identical across projects; `REDIS_URL` is `rediss://`; `TRUSTED_CLIENT_IP_HEADER` set; `ALLOW_UNSHARED_RATE_LIMIT` and `E2E` **absent**; `APP_BASE_URL`/`ERP_BASE_URL`/`SUPERADMIN_BASE_URL` per the runbook; `DATABASE_URL` carries `sslmode=require` if the `pg` driver is selected.
13. **Vercel** — preview deployment protection on; previews build with `NODE_ENV=production` so the dev-secret fallbacks cannot engage.
14. **Login cookie** — inspect production `Set-Cookie` for `SameSite=Lax` + `Secure` + `__Secure-` prefix.
15. **Paymob sandbox** — capture / auth / void / full & partial refund callback shapes (`is_refund`, `is_void`, `parent_transaction`) and byte-exact HMAC match (boolean/null rendering).
16. **Paymob dashboard** — processed-callback URL → `edura-erp.vercel.app/api/v1/payments/paymob/webhook`; checkout expiry ≈ 1 h; integration ids = exactly card + mobile wallet.
17. **Vercel env on `edura-erp` before flipping `PAYMENTS_MODE`** — `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS`, `REDIS_URL` set.
18. **GitHub** — Settings → Actions → default workflow permissions = read-only; branch protection on `main` (required CI, no force-push).
19. **Neon** — PITR/retention on production; policy that test branches are never cut from production (or are wiped immediately after — `label-db`'s `was:` line is the only guard).
20. **Vercel XFF depth** — the www→ERP contact hop vs `TRUSTED_PROXY_HOPS` (`token-bucket.ts:188-202` takes `xff[len-hops]`); a wrong depth shares one rate bucket across all contact-form traffic.
21. **`robots.ts`** — none exists in `apps/erp`; decide explicitly what public handles/sitemaps should be crawlable.

---

## 6. Remediation plan (waiting for approval)

Each batch: list files → change → add/adjust tests → `bun run check-types`, `bun run lint`, unit suites, the relevant `test:db:local` suites, `bun audit` → summary. Git commands stay with Ali (repo rule); I supply commit messages.

### Batch 1 — Critical + High (do now) — **~1 day**

| # | Finding | Files | Test |
|---|---|---|---|
| 1 | SUPPLY-01 / SUPPLY-02 / CFG-02 | `apps/{erp,superadmin,www}/package.json`, `packages/server-core/package.json`, `bun.lock`, `apps/erp/next.config.ts` (scope Cloudinary `pathname`, drop `picsum`) | `bun audit` clean for next; build 3/3; erp unit suite; smoke login on preview |
| 2 | ADMIN-01 | `apps/superadmin/src/lib/auth/auth.ts` (seal `/admin/*` prefix over HTTP) | extend `tests/db/admin-endpoint-sealing.test.ts` to enumerate the plugin's route list |
| 3 | AUTHZ-01 | `packages/server-core/src/services/center/roster.ts`, `apps/erp/src/app/api/v1/roster/students/[studentId]/route.ts` | new DB test: credentialed student email PATCH refused; shell allowed; audit + `tokenVersion` bump |
| 4 | BIZ-01 | `packages/server-core/src/services/payments/refund-payment.ts` | DB test: orphan capture → counter refund → wallet debited or 422 |
| 5 | BIZ-02 | `apps/erp/src/lib/services/wallet/center-credit-topup.ts` (+ `payment-intents.ts` if purpose-aware) | DB test through the real claim path |

Outside the repo (goes to `SECURITY_TODO.md`): redeploy all three apps after #1; manual items 1–4.

### Batch 2 — Medium — **~2 days**

| # | Finding | Files |
|---|---|---|
| 6 | DB-03 | both `auth.ts` (`backupCodeOptions`), runbook note to regenerate codes |
| 7 | OPS-01 | `materials.ts` (authenticated upload, stop persisting `cloudinaryUrl`), `cloudinary.ts` (real signed URL), migration note for existing rows |
| 8 | AUTH-02 + AUTH-01 | `register.ts`, `auth.ts:127`, `login/page.tsx` — one message; nudge unconditional |
| 9 | ADMIN-02 | `blacklist.ts`, `points-admin.ts`, `wallet-settings-admin.ts`, `payouts.ts` — `writeAdminAudit` in-tx |
| 10 | INJ-01 | `login/page.tsx` `isSafeNext` + unit test |
| 11 | DIFF-01 | `apps/erp/src/proxy.ts` / route kernel host check; `tenant-host-proxy.test.ts` through `config.matcher` |
| 12 | DIFF-02 + DIFF-03 | `courses/[id]/route.ts` (coverage gate), `center/courses.ts` (`https?` allow-list) + DB test |
| 13 | BIZ-03 | `subscriptions.ts` `periodStart` start-of-day + unit test |
| 14 | BIZ-05 | `temp-students.ts` re-point subscriptions/ledger or refuse + DB test |
| 15 | WEBHOOK-01 | `gateway/types.ts` reversal detection — **after** sandbox fixtures are captured (manual 15) |

### Batch 3 — Low + Info + hardening docs — **~2 days**

- AUTH-03/04/05/06/07, BIZ-04/06/07/08, ADMIN-03, RT-01/02, DIFF-04/05/06/07, DB-02 (RLS-set test) / DB-04 (`REVOKE DELETE ON users` — **DB migration, needs its own approval**), OPS-03, NET-01/02/03, DISC-01, CFG-01, CI-01/02/03, INJ-03, AUTHZ-02, AUTH-09.
- Add `SECURITY.md` (hardening decisions incl. the DB-01 RLS statement), refresh `.env.example` guidance (`sslmode`, required-in-prod list), write `SECURITY_TODO.md` (manual items 5–21, B2 key split + Object Lock, GitHub permissions/branch protection, Neon branch policy, Sentry alerts).
- Update `CLAUDE.md` / code-comment pointers from `SECURITY_AUDIT.md M-xx` to the archived file.

### Phase 5 (after approval and Batches 1–3)
Re-run the 70-item table, produce the before/after diff summary, and list residual by-design risks (DB-01 RLS model, M-05 gateway refund executor until the Paymob driver exists, optional 2FA in ERP, public image `public_id`s).

---

## 7. Remediation log

### Batch 1 — 2026-09-11 — Critical + High — DONE (uncommitted, awaiting Ali's commit)

| ID | Status | Change | Proof |
|---|---|---|---|
| SUPPLY-01 / SUPPLY-02 / CFG-02 | **Fixed** | `next` 16.3.0 → **16.3.5** in `apps/erp`, `apps/superadmin`, `apps/www`, `packages/server-core` (+ `bun.lock`). `apps/erp/next.config.ts` `remotePatterns` now `res.cloudinary.com` scoped to `/${CLOUDINARY_CLOUD_NAME}/**` (fails closed to a non-matching path when unset); `picsum.photos` removed. | `bun audit` 14 → **12**, both criticals gone; `next build` run directly in each of `apps/erp` (299 pages, pre-existing Sentry/useCache warnings only), `apps/superadmin` and `apps/www` (31 pages) — all three produced a fresh `BUILD_ID` on 16.3.5; check-types 10/10. **Takes effect on redeploy** — see `SECURITY_TODO.md`. |
| ADMIN-01 | **Fixed** | `apps/superadmin/src/lib/auth/auth.ts`: the seven-path `SEALED_ADMIN_PATHS` set became `SEALED_ADMIN_PREFIX = "/admin/"` — every admin-plugin path 404s over HTTP; server-side `auth.api.*` (no `ctx.request`) untouched. No `authClient.admin.*` caller exists. | `apps/superadmin/tests/db/admin-endpoint-sealing.test.ts` now enumerates `admin().endpoints` from the installed plugin (15 paths, asserts ≥ 15 and that `update-user` is among them), probes each with a mass-assignment body, asserts 404 and that the victim's role/status and the actor's `two_factor_enabled` are unchanged — 26/26. |
| AUTHZ-01 | **Fixed** | `packages/server-core/src/services/center/roster.ts` `updateRosterStudentTx`: `email`/`phone` are accepted only while the student has **no password** (walk-in shell); a credentialed student's login identifiers are refused with a 422 (Arabic message added to `messages-ar.ts`). Every allowed identity change writes `audit_logs` `center.roster_student_identity_changed` with before/after. Route schema unchanged. | `apps/erp/tests/db/authz01-roster-login-identity.test.ts` — refused email / phone / mixed patch, row byte-identical; name-only patch still works; shell fill-in works and is audited; attacker address matches nobody — 9/9. |
| BIZ-01 | **Fixed** | `packages/server-core/src/services/payments/refund-payment.ts` wallet gate matches **any positive ledger row funded by the receipt** (`type in (topup, adjustment)`, `delta > 0`) on both the student and parent ledgers, so the H-03 orphan credit is debited or the refund is refused. | `apps/erp/tests/db/biz01-orphan-credit-refund.test.ts` — drives the real orphan capture through the mock webhook, partial refund debits the wallet in-tx, refund beyond the spent wallet refused with every book unchanged — 9/9. `refund-wallet-topup` (H-01) still 13/13. |
| BIZ-02 | **Fixed** | `apps/erp/src/lib/services/wallet/center-credit-topup.ts` settler now writes a platform-held `payments` row (owner as payer, no student, no centre on the row — the only shape `payments_student_required` allows) and links `paymentId`, so H-03 rule 2 passes. `nextPlatformReceipt` exported from `wallet.ts`. The notification deliberately carries no `receiptNumber` key (the claim path would mail a student receipt). | `apps/erp/tests/db/biz02-center-credit-claim.test.ts` — initiate → mock capture → `paid`, both links set, credit +1000 EGP, ledger running balance, redelivery = `replay` — 7/7. `center-credit-clearing` gained the link assertion — 21/21. |

Verification run after the batch: `bun run check-types` 10/10 · `eslint` erp 0 errors / superadmin 0 errors · vitest erp 1552 passed / 1 skipped, superadmin 168 passed · ERP DB suites (6 touched) 80/80 · superadmin sealing 26/26 · `next build` 3/3 (each app built directly, not from the Turbo cache) · `bun audit` 12 (5 high, 7 moderate — all build-time/unreachable, see SUPPLY-03).

Not done in this batch, on purpose: no `git` command (repo rule); `SECURITY.md`, `.env.example` refresh and the `CLAUDE.md` pointer update are Batch 3; the out-of-repo steps are in `SECURITY_TODO.md`.

### Batch 2 — 2026-09-11 — Medium — DONE (uncommitted, awaiting Ali's commit)

| ID | Status | Change | Proof |
|---|---|---|---|
| DB-03 | **Fixed** | `twoFactor({ backupCodeOptions: { storeBackupCodes: "encrypted" } })` in both apps. | check-types 10/10 (option validated by the plugin's types). Codes issued before this stay plaintext until regenerated — `SECURITY_TODO.md`. |
| OPS-01 | **Fixed (new uploads)** | Materials upload with Cloudinary `type: "authenticated"`; no public `secure_url` persisted; `generateSignedUrl` rewritten to Cloudinary's real URL signature (first 8 chars of URL-safe base64(sha1(public_id + secret))) on `/raw/authenticated/`. Legacy rows that still carry `cloudinaryUrl` are served as before until migrated. | `apps/erp/tests/unit/cloudinary-signed-url.test.ts` pins the algorithm; `materials-access` 12/12. Live check against the Cloudinary account is owed (`SECURITY_TODO.md`). |
| AUTH-01 / AUTH-02 | **Fixed** | Login: unknown email and wrong password both return `Invalid email or password`; the "create an account" nudge shows on any credential failure (copy neutralised in en/ar). Register: one `Email or phone already in use` for shell and registered conflicts. | `c03-status-revocation` 30/30, `c04-login-parity` 48/48 (assertions updated), `h02-register-shell-gate` 12/12 with a new "reveals nothing about the shell" assertion. |
| ADMIN-02 | **Corrected + fixed** | The finding was partly wrong: the Prisma auto-audit extension (`packages/database/src/extensions/index.ts` `AUDITED`) already writes rows for blacklist add/lift, points rules, points adjustments, wallet policy and payout rejection. The genuine gaps were payout **approve** and **pay** (`updateMany`, invisible to the extension) and payout **generation** — those now write explicit rows. Manual duplicates I had added for the auto-audited writes were removed again. | `apps/superadmin/tests/db/admin02-back-office-audit.test.ts` 9/9 pins both mechanisms; `h3-audit-atomicity` 42/42, `m03` 16/16. |
| INJ-01 | **Fixed** | `isSafeNext` extracted to `apps/erp/src/lib/auth/safe-next.ts`: one leading `/`, no backslash anywhere, and the URL parser must agree the target stays on the origin. | `apps/erp/tests/unit/safe-next.test.ts` (`/\evil.com`, `//evil.com`, `javascript:` …). |
| DIFF-01 | **Fixed** | Middleware matcher widened to `/api` and `/ingest` (`MIDDLEWARE_MATCHER`, distinct from the unchanged `INTL_MATCHER`); on a tenant host those paths get **404** (never a redirect carrying a credential), on the canonical host they pass through untouched. | `tenant-host-proxy.test.ts` asserts through the exported `config.matcher`; `ingest-proxy.test.ts` pins the two matchers to each other. `next build` on erp. |
| DIFF-02 / DIFF-03 | **Fixed** | Meeting link gate extracted to `apps/erp/src/lib/services/discovery/meeting-link.ts`: owner, owning centre, or a student/parent with an **active subscription covering today** (monthly window, or a per-session pass for a lesson not yet passed). `resolveDelivery` refuses any `online_url` that is not `http(s)://`. | `diff02-meeting-link-coverage` 12/12 (enrolled-but-unpaid → no link; refund → no link; pass for today → link); `course-delivery-and-teacher-day` 20/20. |
| BIZ-03 | **Fixed** | `monthlyWindow(now)`: `periodStart` = start of the platform day, `periodEnd` = start + 30 d − 1 ms — thirty dated lessons, the first of them the purchase day. | `biz03-monthly-window` 7/7 (today covered, day 29 covered, day 30 and yesterday not); `counter-board`, `renewal-reminders`, `refund-bound`, `parent-pay`, `teacher-coverage`, `weekly-digest` all green. |
| BIZ-05 | **Fixed** | `claimTempStudent` re-points `subscriptions` and `payment_intents` (a row the claimant already holds for the same course/session is left and counted as `subscriptionsSkipped`), and moves the wallet balance with two append-only ledger rows (shell −, claimant +) inside the same transaction; refuses when the claimant has no student profile to receive it. | `biz05-claim-carries-wallet` 7/7; `invite-claim` 107/107, `temp-student-invite-ownership` 9/9. |
| WEBHOOK-01 | **Partially fixed** | `deriveEventKind` honours `is_refund` / `is_void` (the flags a delivered reversal object carries about itself) alongside the parent's `is_refunded` / `is_voided`. `parent_transaction` alone is deliberately NOT a reversal signal (capture-after-authorisation carries one). | `webhook-contract` unit cases added. Byte-exact sandbox fixtures are still owed before this is called closed (`SECURITY_TODO.md` item 17). |

Verification run after the batch: `bun run check-types` 10/10 · eslint erp/superadmin 0 errors · vitest erp 1561 passed / 1 skipped, superadmin 168 passed · ERP DB suites (24 touched) all green · superadmin DB suites (11 touched) all green · `next build` apps/erp.

Also in this batch: AUTHZ-01 was confirmed to apply to the back office acting as a centre (`center-people` parity test updated: a credentialed student's phone is refused there too).

### Batch 3 — 2026-09-11 — Low + Info + hardening docs — DONE (uncommitted, awaiting Ali's commit)

| ID | Status | Change |
|---|---|---|
| AUTH-03 | Fixed | `instrumentation.ts` (both apps) calls `assertSharedRateLimitStore()` unconditionally; the function's own `=== "1"` gate is the only override. |
| AUTH-04 | Fixed | better-auth `/change-password` sealed over HTTP in both apps; `me/password` (letter+digit policy + `token_version` bump) is the only door. |
| AUTH-05 | Fixed | `/two-factor/verify*` limited per IP in the shared Redis bucket (10 burst / 5 per min) in both apps' `before` hook. |
| AUTH-06 | Fixed | Admin-sent resets pass `app` (by the target's role) and `linkBaseUrl: erpBaseUrl()` for ERP users; `erpBaseUrl` extracted to `apps/superadmin/src/lib/config/erp-base-url.ts` and shared with view-as. A staff self-service reset page is still a product gap (SECURITY.md accepted-risks table does not list it; it is a feature, not a hole). |
| AUTH-07 | Fixed | `acceptInvite` never overwrites an existing password; a shell activation bumps `token_version`. |
| AUTH-09 | Fixed | Boot throws when `VERCEL_ENV=production` and `NEXTAUTH_URL` is not https (both apps). |
| BIZ-04 | **Kept, documented** | The route is a fixture the seed-UUID guard suite asserts on (`h03-seed-uuid-flows` expects it to accept a seeded course). Rate-limited, student-only, no UI caller. Listed in SECURITY.md accepted risks with the exit condition. |
| BIZ-06 | Fixed | Walk-in `markAttendance` writes `counter_only` when the teacher's mode is `counter_and_door` (decision #4), `present` otherwise. |
| BIZ-07 | Fixed | `clawBackPaymentPoints` reverses the payment-event points row awarded within ±10 s of the receipt on a FULL refund (never below zero, as a new `refund_clawback` ledger row). |
| BIZ-08 | Fixed | Gateway checkout asserts the blacklist BEFORE the pending subscription row is written (outside the transaction, since the assert runs its own). |
| ADMIN-03 | Documented | `admin/session-settlements/export` remains accountant-reachable; it is finance data. Path contract noted in SECURITY.md. |
| RT-01 | Fixed | `conversation:read` and `typing` socket events are per-user rate-limited. |
| RT-02 | Fixed | `chat-notify` derives recipient, sender name and body from the message row; the bridge sends only ids. Unit test rewritten to prove a hostile body is ignored. |
| DIFF-04 | Fixed | `photoUrl` / `logoUrl` must be `https://res.cloudinary.com/…`. |
| DIFF-05 | Fixed | `?deliveryMode=` / `?status=` validated against the enums (unknown → empty result); oversight date filters reject garbage with a 422 (Arabic added). |
| DIFF-06 | Fixed | Superadmin teacher PATCH uses the lowercasing `emailSchema`. |
| DIFF-07 | Fixed (prefixes + audit) | Handles starting with `edura`, `paymob`, `official`, `support` are refused; set/clear write `public_handle.set` / `public_handle.cleared` audit rows. A cool-down on released handles needs a column — not done. |
| DB-02 | Fixed | `apps/erp/tests/db/rls-table-set.test.ts` pins the 41 FORCE-RLS tables by name. |
| DB-04 | **Fixed — migration 81 applied to local test + dev [2026-09-11] and production [2026-09-12], verify-db 33/33 on all three** | `20260912120000_users_revoke_delete`: `REVOKE DELETE ON users FROM edura_app`. verify-db gained `users: [INSERT,SELECT,UPDATE]` (33/33 on both); `expected-db-shape.json` at 81. `apps/erp/tests/db/c08-users-no-delete.test.ts` asserts by privilege AND by a raw app-role DELETE (the Prisma soft-delete extension rewrites `user.delete` to an UPDATE, so the attempt must be raw). Two suites that hard-deleted fixture users switched to the owner pool. |
| OPS-02 | Manual | `SECURITY_TODO.md` item 28. |
| OPS-03 | Fixed | `recordAuthEvent` (`packages/server-core/src/services/auth/auth-audit.ts`): failed logins (unknown / ineligible), successful logins (session create), password reset and change, 2FA enable/disable — both apps. Residual: a wrong password for an EXISTING account is verified inside better-auth after the hook and is not exposed to it (SECURITY.md accepted risks). |
| NET-01 | Fixed | `Permissions-Policy` on all three apps (camera/payment `self` on the ERP only). |
| NET-02 | **Accepted risk** | www keeps `'unsafe-inline'`: a per-request nonce would make every static marketing page dynamic. Reasoning in SECURITY.md. |
| NET-03 | Fixed | 15 s `AbortSignal.timeout` on Cloudinary upload/destroy and the WhatsApp Cloud API call. |
| DISC-01 | Fixed | Prisma `omit: { user: { passwordHash: true } }`; the eight readers that need it opt in with `omit: { passwordHash: false }` (greppable). |
| CFG-01 | **Accepted risk** | `server-only` throws under tsx/Bun (scripts, tests, realtime). Reasoning in SECURITY.md. |
| CI-01 | Fixed | `permissions: contents: read` on every workflow. |
| CI-02 | Fixed | `inputs.jobs` / `inputs.confirm` reach shells through `env:`. |
| CI-03 | Fixed | gitleaks tarball verified against its published sha256 (`551f6fc8…70eb`, cross-checked with `gitleaks_8.30.1_checksums.txt`). |
| INJ-03 | Fixed | The test's `$executeRawUnsafe` became a tagged `$executeRaw`. |
| AUTHZ-02 | Fixed | team-notes mutating handlers list `RECEPTION` only. |
| CFG-02 / SUPPLY-02 / SUPPLY-03 / AUTH-08 / DIFF-08 / DIFF-09 / OPS-04 / WEBHOOK-02 / DB-01 | Info | Documented in SECURITY.md / SECURITY_TODO.md; no code change warranted. |
| Docs | Done | `SECURITY.md` (hardening decisions + accepted risks), env `*.example` guidance (three DB strings, required-in-prod list), `CLAUDE.md` pointers to the archived audit, `SECURITY_TODO.md` items 26–31. |

Verification run after the batch: `bun run check-types` 10/10 · eslint erp/superadmin/realtime 0 errors · vitest erp 1561 passed / 1 skipped, superadmin 168 passed · **full local DB suites: erp 90 suites / 2040 assertions, superadmin 38 / 1007 — all green** · `next build` erp, superadmin, www (fresh `BUILD_ID` ×3).

---

## 8. Phase 5 — verification after remediation

### 8.1 Checklist rows whose verdict changed

| # | Check | Before | After | Why |
|---|---|---|---|---|
| 12 | Password reset flow | Partial | **Pass** | AUTH-04 sealed, AUTH-06 host/app, AUTH-07 no overwrite |
| 13 | Account enumeration | Fail | **Pass** | AUTH-01, AUTH-02 |
| 14 | MFA for privileged | Pass (plaintext codes) | **Pass** | DB-03 encrypted codes |
| 19 | Cross-user data access | Fail | **Pass** | AUTHZ-01 |
| 21 | Admin routes unprotected | Fail | **Pass** | ADMIN-01 whole prefix sealed, test enumerates the plugin |
| 24 | Mass assignment | Partial | **Pass** | ADMIN-01 |
| 25 | Excessive DB permissions | Partial | **Pass** (all three environments; production applied 2026-09-12) | DB-04 |
| 27 | Storage buckets | Fail | **Partial** | OPS-01 fixed for new uploads; legacy rows + B2 key split are TODO |
| 29 | Business-logic abuse | Partial | **Pass** (BIZ-04 accepted) | BIZ-01/03/05/06/07/08 |
| 40 | Open redirects | Fail | **Pass** | INJ-01 |
| 49 | Security headers | Partial | **Pass** (www CSP accepted) | NET-01 |
| 50 | Rate limits | Partial | **Pass** | AUTH-05, RT-01 |
| 51 | Timeouts | Partial | **Pass** | NET-03 |
| 52 | Encryption at rest | Partial | **Pass** | DB-03 |
| 55 | Webhook replay | Pass (classification) | Pass* | WEBHOOK-01 partial until sandbox fixtures |
| 62 | Sensitive info in responses | Pass (by discipline) | **Pass (by default)** | DISC-01 |
| 63 | Vulnerable dependencies | Fail | **Pass** | next 16.3.5; 12 remaining advisories are build-time / unreachable |
| 66 | Untrusted build actions | Partial | Partial | actions still tag-pinned (SHA pinning is a follow-up); gitleaks binary now sha256-pinned |
| 67 | Insecure CI/CD | Partial | **Pass** | CI-01, CI-02 |
| 68 | Unreviewed code paths | Partial | **Pass** (BIZ-04 documented) | |
| 69 | Audit logs | Partial | **Pass** | ADMIN-02 (corrected), OPS-03, DIFF-07 |

Everything else keeps its Phase 2 verdict.

### 8.2 Before / after

| | Before (2026-09-11 morning) | After |
|---|---|---|
| Findings open | 1 Critical · 4 High · 10 Medium · 29 Low · 13 Info | 0 · 0 · 0 · 0 (DB-04 applied on all three environments 2026-09-12) · accepted risks listed in SECURITY.md |
| `bun audit` | 14 (2 critical) | 12 (0 critical, all build-time/unreachable) |
| Next.js | 16.3.0 | 16.3.5 |
| Sealed admin-plugin paths | 7 of 15 | 15 of 15 (enumerated from the plugin) |
| Tests added | — | 12 files (6 DB, 3 unit new; 3 rewritten), +~100 assertions; full local DB suites green in both apps |
| Docs | — | `SECURITY.md`, `SECURITY_TODO.md` (31 items), env-example guidance, audit archive + pointers |

### 8.3 Residual risks that remain by design

Listed with their exit conditions in `SECURITY.md` § *Accepted risks*: www `'unsafe-inline'`, no `server-only` guard, `payments/initiate`, gateway refunds (M-05), unproven Paymob reversal shapes, `DELETE` on `users` until DB-04 is applied, unaudited wrong-password attempts inside better-auth, optional 2FA in the ERP, RLS as defence-in-depth only (DB-01), legacy public material URLs until migrated, tag-pinned GitHub Actions.
