# SECURITY.md — hardening decisions

What protects this platform, where each control lives, and which risks are
accepted on purpose. Every claim here points at code; if the code moves, move
the pointer. Findings are tracked in `docs/audits/SECURITY_AUDIT.md` (2026-09-11, current)
and `docs/security/security-audit-2026-09-06.md` (previous, archived — the
`M-xx` / `H-xx` / `L-xx` IDs quoted in older code comments and in `CLAUDE.md`
refer to that file). Out-of-repo actions live in `docs/audits/SECURITY_TODO.md`.

## Reporting a vulnerability

Email the platform owner directly (see the repository owner's GitHub profile).
Do not open a public issue for anything exploitable. Expect an acknowledgement
within two working days.

## Trust model in one paragraph

Two Next.js apps with **independent better-auth instances** (own secret, own
cookie prefix): `apps/erp` for centres, teachers, assistants, parents and
students; `apps/superadmin` for two staff roles, 2FA mandatory. A staff member
reaches the ERP only through a signed 60-second "view as" handoff that the ERP
re-verifies and turns into its own session — no cookie ever crosses apps
(`docs/decisions/superadmin-view-as.md`). The database is reached through one
non-owner role, `edura_app`, `NOBYPASSRLS`; the owner string exists only in
`DIRECT_URL` / `ADMIN_URL`, used by migrations and tooling, never by a
serving process.

## Authentication

- Passwords: bcrypt cost 10; sign-in compares against a dummy hash for unknown
  or ineligible accounts so timing does not reveal existence; unknown email
  and wrong password return the **same** message (`apps/*/src/lib/auth/auth.ts`).
- Sessions are database rows. Hard revocation: any password change bumps
  `users.token_version`, and a trigger deletes every session for that user.
  better-auth's own `/change-password` is sealed over HTTP because it would
  skip that bump; the app's `me/password` door is the only one.
- Login rate limits live in Redis (`REDIS_URL`, `rediss://`, required in
  production and asserted at boot). Per IP and per email on sign-in; per IP on
  second-factor verification. Never per-lambda memory in production.
- 2FA: TOTP secret and backup codes are stored encrypted. Back-office roles
  cannot reach any `/api/v1/**` route until the second factor is cleared.
- The better-auth `admin` plugin's entire HTTP surface is sealed in the back
  office; the app's own audited routes call `auth.api.*` server-side instead.
- Reset, invite, walk-in, guardian and email-change tokens are 256-bit random,
  stored as SHA-256, time-limited and single-use. An invite never overwrites an
  existing password. `sendResetPassword` is deliberately not wired (it would
  bypass the token-version bump).
- Login identifiers (email, phone) of an account that holds a password change
  only through the account's own verified door — not from a centre's roster
  screen, and not from the back office acting as a centre.

## Authorization

- Every route handler guards itself: `withRole`, `requireRole`,
  `centerStaff()`, `delegated()`, or a token/HMAC/secret gate. Middleware
  (`src/proxy.ts`) does locale routing and CSP only; nothing relies on it for
  auth. There are no Server Actions.
- Tenancy: centre-scoped reads and writes go through `scopedDb`, which sets the
  RLS tenant for `center_admin` sessions; staff sub-roles are re-keyed to their
  centre with default-closed allow-lists and a read-only accountant.
- **Row-level security is defence in depth, not a second trust boundary.**
  `edura_app` sets the bypass GUC itself inside each transaction; only
  `center_admin` runs under the tenant policy. RLS catches a forgotten
  `where centerId` and refuses bare client calls on the 41 `FORCE` tables
  (`apps/erp/tests/db/rls-table-set.test.ts` pins that set). Code-level
  scoping is the control for the other 43 tables.
- Delegation: an assistant acts for exactly one teacher with everything
  except money and managing assistants; every action is audited "on behalf
  of". Centre staff likewise (`apps/erp/src/lib/authz/*-actor.ts`).

## Money

The invariants in `CLAUDE.md` § *Binding invariants — Money* are the contract.
Operationally: prices are snapshotted server-side; wallets move by conditional
single-statement decrements with a database CHECK floor; settlement, refunds
and payouts take row locks; `transactions`, `points_ledger`,
`session_settlements`, the three wallet ledgers and `audit_logs` are
append-only for the app role and `payments` cannot be deleted (migrations
`00000000000003`, `20260909120100`). Refunds go through one door and debit the
wallet in the same transaction when the receipt funded one — whatever the
ledger row was called. Payout approval and payment are separate people
(maker-checker) and both write explicit audit rows.

Webhook: HMAC-SHA512 over the provider's field list, constant-time compare,
integration allow-list that fails closed, idempotent by intent status, and a
`payments` row for every `paid` intent (the claim rolls back otherwise).

## Data

- `passwordHash` is omitted from every `users` read by default (Prisma
  `omit`, `packages/database/src/client.ts`); a caller that needs it opts in
  with `omit: { passwordHash: false }` and that opt-in is greppable.
- Paid course material is uploaded to Cloudinary as `authenticated` and served
  through a per-download signed URL; no public URL is persisted. Rows created
  before 2026-09-11 still carry a public URL until migrated (`docs/audits/SECURITY_TODO.md`).
- The image optimizer accepts only our own Cloudinary path
  (`apps/erp/next.config.ts` `remotePatterns`).
- Backups: nightly `pg_dump`, age-encrypted, to B2; weekly restore into a
  scratch cluster with count and integrity checks (`.github/workflows/backup.yml`).

## Audit trail

Two mechanisms, both writing `audit_logs` (append-only):

1. **Auto-audit** — the Prisma extension `packages/database/src/extensions/index.ts`
   (`AUDITED` map) writes a row for listed model operations with the request's
   actor and the full after-state. Note: `updateMany` / `createMany` are not
   seen by it.
2. **Explicit rows** — `writeAdminAudit` / `recordAdminAudit` for back-office
   decisions, `recordAuthEvent` for the door (failed and successful logins,
   password reset/change, 2FA on/off), and hand-written rows in services for
   identity changes, refunds, exports, view-as, deletions.

Check the `AUDITED` map before adding an explicit row for a plain `create` /
`update` / `delete` — it may already be there, and two rows per write is noise.

## Transport and browser

- HSTS (preload), `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy` on all three apps.
- CSP with a per-request nonce and `'strict-dynamic'` on the ERP and the back
  office (`src/proxy.ts` + `src/lib/security/csp.ts`); API routes get a
  `default-src 'none'` policy. Violations report to
  `/api/v1/security/csp-report`.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` + `__Secure-` prefix whenever
  the base URL is https; boot refuses a non-https `NEXTAUTH_URL` in production.
- A tenant subdomain (`<handle>.<root>`, dormant until `PUBLIC_ROOT_DOMAIN`)
  serves exactly one public page; every other path, `/api` and `/ingest`
  included, is refused or sent back to the canonical host. Auth never lives on
  a subdomain.
- No CORS headers on the Next apps; the realtime server allows an explicit
  origin list in production.

## Secrets and configuration

Environment only; `.env*` is gitignored in every workspace and only
`*.example` files are tracked. CI runs a full-history gitleaks scan (binary
pinned by sha256) and a pre-commit hook. Variables required in production, all
fail-closed, are listed in `CLAUDE.md` § *Env vars now REQUIRED in production*.
Development fallbacks for signing secrets are fixed literals that **throw**
when `NODE_ENV=production`.

`turbo.json` `env` values are hashed into the task key, never stored; there is
no remote cache. GitHub Actions run with a read-only `GITHUB_TOKEN`, dispatch
inputs reach shells only through `env:`, and no workflow uses
`pull_request_target`.

## Accepted risks (by design, revisit deliberately)

| Risk | Why it stands | What would close it |
|---|---|---|
| `apps/www` CSP keeps `script-src 'unsafe-inline'` | A per-request nonce would force every static marketing page dynamic; www renders no user content, has `frame-ancestors 'none'`, and its one API route proxies to the rate-limited ERP | Hash-based CSP once Next's own inline bootstrap can be hashed, or accepting dynamic rendering |
| No `server-only` import guard on the DB/auth packages | `server-only` throws in any non-React-server runtime, and `packages/database` runs under `tsx`/Bun for scripts, tests and `apps/realtime` | A lint rule forbidding those packages in `"use client"` files |
| `POST /api/v1/payments/initiate` takes money without creating coverage | No UI caller; rate-limited, student-only; the seed-UUID guard suite asserts on it | Remove it together with a rewrite of `h03-seed-uuid-flows` |
| Gateway refunds cannot be executed or confirmed (`M-05`) | No provider refund API is integrated yet | The Paymob refund executor + refund webhook |
| Paymob refund/void classification unproven against real callbacks | Sandbox fixtures not yet captured | `docs/audits/SECURITY_TODO.md` item 17 |
| Wrong-password attempts for an existing account are not audited | better-auth verifies the password after the app's hook; no failure hook is exposed | An `onAPIError` handler or a better-auth release exposing sign-in failure |
| Optional 2FA in the ERP | Product decision for families and counter staff | Enforce for `center_admin` at least |
