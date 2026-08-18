# Auth: next-auth → better-auth migration (built 2026-08-01 — awaiting review)

Both apps now run **better-auth 1.6.25** (DB-backed sessions); next-auth is
REMOVED from both package.jsons. Full audit:
[docs/architecture/better-auth-migration-audit.md](docs/architecture/better-auth-migration-audit.md);
data-migration + rollback plan:
[docs/architecture/better-auth-rollback.md](docs/architecture/better-auth-rollback.md).

1. **The stable API surface (other workstreams code against THIS):**
   server = `getSessionUser()` / `requireSession()` from `@/lib/auth/session`
   (signatures and `SessionUser` shape UNCHANGED — the 58 existing call sites
   did not change); client = `authClient` from `@/lib/auth/client`
   (`signIn.email`, `signOut`, `useSession`, `listSessions`, `revokeSession`,
   `twoFactor.*`, `admin.*` on superadmin). The better-auth instance itself is
   `@/lib/auth/auth` (`auth.api.*` for server-side flows). Do NOT hand-fetch
   `/api/auth/*`.
2. **Schema (migration `20260801170000_better_auth`, additive):**
   `auth_sessions` (NOT `sessions` — that is the live-class engine),
   `auth_accounts`, `auth_verifications`, `two_factors` + user columns
   `image`, `two_factor_enabled`, `banned`, `ban_reason`, `ban_expires`.
   User IDs/rows untouched — better-auth maps onto the existing `users` table.
   **[dev + test, applied 2026-08-01] — 42 migrations, verify-db 25/25.
   [production, APPLIED 2026-08-02] — see the note below; production had been
   running better-auth CODE against a database with NO auth tables, so every
   sign-in returned 500. Applying this migration is what fixed it.
   The expected-db-shape file now says 75 tables / 43 migrations (the extra
   table + migration over 74/42 is `contact_submissions`).**
3. **`users.password_hash` stays the SINGLE SOURCE OF TRUTH.** DB triggers
   (`users_credential_sync_*`) mirror it into the better-auth credential row
   both directions with IS-DISTINCT guards, so none of the ~10 existing
   password writers (services, seeds, raw SQL) changed and bcrypt hashes
   verify as-is — NO forced resets. Never write `auth_accounts.password`
   directly.
4. **L1 + C-03 became HARD revocation.** The `users_revoke_sessions` trigger
   DELETES a user's `auth_sessions` rows in the same statement as any
   deactivating write (`status` ≠ active, `deleted_at` set, or `token_version`
   bump) — stronger than the old per-request JWT epoch re-read, and it holds
   even for SQL that never touches Prisma. `token_version` and
   `sessionRevocationExtension` stay (their bump is what fires the trigger).
5. **One sign-in implementation per app** (before-hook in `lib/auth/auth.ts`):
   C-04 `canSignIn` partition, C2 token buckets (same limits), H5 dummy-hash
   timing, and the typed www codes (`USER_NOT_FOUND` / `ACCOUNT_INACTIVE` /
   `RATE_LIMITED`; superadmin stays fully generic). The REST door
   `POST /api/v1/auth/login` now FORWARDS to the same instance — it holds no
   policy, so C-04 drift is structurally impossible. The Step 7 invite claim
   is a better-auth plugin (`invite-token-plugin.ts`, endpoint
   `/api/auth/invite-token/claim`) with the identical five gates; the
   `walkin-token` provider-id alias was retired with NextAuth.
6. **Sessions & devices UI ("الأجهزة والجلسات")** on every www settings screen
   + superadmin/finance `security` pages: list devices, revoke one / all
   others. **2FA (TOTP + backup codes):** REQUIRED for super_admin/accountant
   (dashboard layout redirects to `/two-factor-setup` until enrolled), guided
   optional enrollment for center owners (settings card), `/two-factor`
   verify page in both apps.
7. **Env: ZERO new vars.** `NEXTAUTH_SECRET` / `NEXTAUTH_URL` /
   `SUPERADMIN_NEXTAUTH_SECRET` keep their names as the better-auth
   secret/baseURL. Cookies are now `edura.session_token` /
   `edura-superadmin.session_token` (old JWT cookies simply become inert —
   everyone logs in once again; prod has only the 2 staff accounts).
8. **Proofs (live test DB):** l1 13/13, c03 30/30, c04-parity 76/76,
   invite-claim 107/107, registration-doors 17/17, c01 36/36, h03 48/48;
   superadmin c03 16/16, c04-boundary 29/29, center-oversight 122/122,
   center-platform 45/45, c02 28/28. Full sweeps green except
   `catalog-onboarding` (pre-existing `cacheTag()` env failure, unrelated —
   already excluded from `test:db:ci`). Root check-types 6/6, www unit 132/132
   (+1 skip), `bun run build` both apps, lint error-parity with main.
   Verified live in the browser: all six www roles sign in, teacher + center
   admin portals, sessions card, full 2FA enroll→login cycle (real computed
   TOTP), superadmin forced-2FA gate → dashboard → security page.
   Demo helper: `demo-superadmin@edura.test` / `Passw0rd!` (is_demo, dev only).
