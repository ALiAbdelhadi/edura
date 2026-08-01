# next-auth → better-auth migration — audit (Workstream 1)

Date: 2026-08-01. Branch: `feat/better-auth` (worktree `migrate-next-auth-better-auth-34d9b0`).
This is the pre-code audit required by the workstream brief. Everything below was
verified by reading the code in this worktree, not from memory.

## 1. What next-auth does today (complete inventory)

**Version & mode:** next-auth **4.24.15** in BOTH apps. Pure **stateless JWT**
strategy (30-day maxAge), **CredentialsProvider only** — there are **NO NextAuth
database tables** (no `accounts`, `sessions`, `verification_tokens`). The only
persisted auth state is `users` (with `password_hash`, `token_version`) plus the
custom `password_reset_tokens` and `invite_tokens` tables.

### Login doors (3+1)

| Door | File | Notes |
|---|---|---|
| www credentials | `apps/www/src/lib/auth/options.ts` | C2 rate limit (IP 20/20, email 5/5), H5 dummy-hash timing, C-04 `canSignIn("www", role)`, typed errors `USER_NOT_FOUND` / `ACCOUNT_INACTIVE` / `RATE_LIMITED`, `resolveLoginCenterId` |
| www invite claim | same file, provider ids `invite-token` + alias `walkin-token` | Step 7 tokenized claim: sha256 token hash lookup, purpose→role table (`CLAIMABLE`), single-use atomic flip, shell→active, live-link re-check for assistant/staff, IP rate limit 10/10 |
| www manual REST | `apps/www/src/app/api/v1/auth/login/route.ts` | `encode()` from `next-auth/jwt` — mints the SAME JWT + sets the NextAuth cookie; returns `{token, user}` envelope. E2E=1 → session-scoped cookie |
| superadmin credentials | `apps/superadmin/src/lib/auth/options.ts` | Own cookie names (`edura-superadmin.session-token` etc.), own secret (`SUPERADMIN_NEXTAUTH_SECRET`, dev fallback to `NEXTAUTH_SECRET`), tighter limits (email 5 cap / 1 per min), full-H5 generic null (no typed errors) |

### JWT claims & per-request revalidation (the invariants to preserve)

Token claims: `uid, role, centerId?, locale, ver` (+ name/email). Session shape:
`session.user = { id, role, centerId?, locale, name?, email? }` (superadmin: no centerId).

The `jwt` callback re-reads `users(token_version, status, deleted_at)` on EVERY
request (one indexed PK lookup) and strips all claims when:
- `tokenVersion` trails the column (**L1** — password reset/change revokes all sessions),
- `status !== 'active'` or `deletedAt` set (**C-03** — suspension/soft-delete kills
  the session on the NEXT request; `sessionRevocationExtension` bumps
  `token_version` on status writes in the same statement).

### Server consumers (the stable internal API)

`getSessionUser()` / `requireSession()` in `apps/{www,superadmin}/src/lib/auth/session.ts`
→ **58 files** consume these two helpers (plus `requireRole()` in
`lib/authz/require-role.ts` and `requireCenterActor` on top). **No Next.js
middleware auth** — all guards are per-route. The landing page
(`[locale]/page.tsx`) redirects to `/dashboard` when `getSessionUser()` returns a user.

### Client consumers

- `SessionProvider` (www + superadmin `app-providers.tsx`, refetch 5 min).
- Refine `authProvider` (both apps): `getSession/signIn/signOut` — login,
  logout (www also syncs offline attendance + purges PWA caches), `check`,
  `getPermissions` (role from session).
- `login/page.tsx` (www): `signIn("credentials")` + typed error UI
  (not-registered panel, inactive, rate-limited), quick-login tiles (dev only),
  `next` redirect param, role hint in `localStorage.edura_state`.
- `register/page.tsx`: auto `signIn("credentials")` after register.
- `claim/page.tsx`: `signIn("invite-token", { token })` — passwordless claim.
- superadmin `login/page.tsx`: `signIn("credentials")`.

### What next-auth does NOT do here (no work needed)

- **No OTP flow anywhere** (Ali's decision: OTP out of scope this phase; the
  "otp" grep hits are false positives). → **Skip the OTP plugin.**
- **No OAuth/social providers.** Credentials only.
- **Password reset is fully custom** (`password_reset_tokens` +
  `services/auth/password-reset.ts`, bumps `token_version`) — not NextAuth's.
- **Realtime (Socket.IO)** mints its own JWT with `REALTIME_JWT_SECRET` at
  `/api/v1/realtime/token` — depends only on `requireSession`, not on next-auth.
- Registration is custom REST (`/api/v1/auth/register/*`), not NextAuth.

### Role model & redirects

Role partition is `@repo/server-core/auth/login-policy.ts` (`canSignIn`) —
exhaustive `Record<Role, "www" | "superadmin">`: super_admin/accountant →
superadmin; center_admin/center_staff/teacher/assistant/parent/student → www.
Post-login redirect is always `/dashboard` (portal resolution happens there via
`uiRoleForRole`); no per-role redirect map in next-auth itself.

### Password storage (critical migration constraint)

`users.password_hash` (bcrypt, cost 10) is written by **~10 writers**: register
service, `me/credentials` (set-once), password-reset, invite-accept, superadmin
accountants create, center admins/roster/staff/walk-in/temp-students services,
and every seed script. `NULL` hash is load-bearing ("shell has no credential";
invite provider gate #3).

### Tests that exercise next-auth internals directly

`c03-status-revocation` (both apps), `c04-login-parity` / `c04-login-boundary`,
`l1-session-invalidation`, `invite-claim` (107), `registration-doors`,
`center-staff-delegation`, `team-notes`, `c01`, `h03` — they import
`authOptions` and call `authorize()` / `jwt()` / `session()` directly.
Playwright helpers log in via UI/REST (no cookie forging found).

## 2. Migration design decisions

1. **better-auth maps onto the EXISTING `users` table** (model mapping +
   `additionalFields`: `role`, `locale`, `tokenVersion`, `status`, …). User IDs
   are untouched → every FK keeps working; "data migration" of users is zero-copy.
2. **DB-backed sessions** (better-auth default). This is what gives us the
   sessions/devices UI + revocation APIs for free, and it makes L1/C-03
   *stronger* (revocation = row delete). We KEEP the per-request user
   revalidation (status/deletedAt/tokenVersion) in the session-fetch path so
   the L1/C-03 invariants hold verbatim.
3. **`users.password_hash` STAYS the single source of truth.** better-auth
   requires a `credential` account row per user; we backfill account rows and
   keep them in sync with a Prisma extension (mirror on user password writes)
   + better-auth databaseHooks (mirror back if better-auth ever writes a
   password). None of the ~10 existing writers change.
4. **`emailAndPassword.password.{hash,verify}` = bcryptjs** (cost 10) — no
   forced resets, existing hashes verify as-is.
5. **Invite claim becomes a small better-auth plugin** (`invite-token`) with
   the identical 5 gates + atomic single-use flip, creating a real DB session.
6. **Custom sign-in semantics** (canSignIn partition, H5 dummy-compare, typed
   error codes, resolveLoginCenterId → session.centerId) implemented in
   better-auth hooks so the observable behaviour (incl. the www
   USER_NOT_FOUND/ACCOUNT_INACTIVE UX) is unchanged.
7. **Two isolated better-auth instances** (www, superadmin) — distinct cookie
   prefixes and secrets, same env vars as today (`NEXTAUTH_SECRET` /
   `SUPERADMIN_NEXTAUTH_SECRET` naming kept or aliased — decided in code).
8. **Rate limiting:** better-auth built-in rate limiter, strict custom rules on
   sign-in/reset paths, backed by Redis secondaryStorage when `REDIS_URL` is
   set (M3 parity); the existing token-bucket stays for non-auth routes.
9. **2FA (twoFactor plugin, TOTP + backup codes):** REQUIRED for
   super_admin/accountant (superadmin app), guided enrollment for center
   owners (www). Admin plugin enabled in superadmin (UI in workstream 4).
10. **No `organization` plugin, no OTP plugin** (audit shows no OTP).
11. **Stateless-JWT sessions cannot be migrated** (they live in users'
    cookies). Everyone re-logs-in once. Real impact: production has exactly
    the 2 staff accounts (www prod has no end users yet); dev has 2 users.
12. **`getSessionUser()` / `requireSession()` keep their exact signatures** —
    the 58 consuming files and the other 3 workstreams code against
    `SessionUser` unchanged.

## 3. Rollback plan

- DB: one-off `pg_dump` backup taken + verified before any migration (see
  `docs/architecture/better-auth-rollback.md` for the restore command); all
  schema changes are additive (new tables + nullable columns), so the
  pre-migration app continues to work against the migrated DB.
- Code: single branch `feat/better-auth`; revert = don't merge. next-auth deps
  are removed only after all suites are green.
