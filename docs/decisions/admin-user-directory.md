# Platform user directory + admin actions (built 2026-08-01 — awaiting review)

The cross-role user surface roadmap decision #10 called for and that was never
built. `apps/superadmin` ONLY (`/dashboard/superadmin/users`), super_admin only.
Service: `apps/superadmin/src/lib/services/admin/admin-users.ts`.

1. **ONE SUSPENSION MECHANISM (binding).** better-auth's admin plugin ships
   `banned` / `ban_reason` / `ban_expires` columns and its own ban endpoints.
   This app does NOT use them and `auth.api.banUser` is deliberately never
   called. The platform already disables an account through `users.status`
   (+ the 3-level blacklist), and C-03 wires that column to hard session
   revocation. A second parallel way to disable an account is exactly the C-04
   failure mode. The proof asserts the ban columns are STILL untouched after a
   suspension, so the two can never drift.
2. **Actions, each audited with actor + target + REQUIRED reason:** suspend /
   reinstate (`user.suspended` / `user.reinstated`), revoke all sessions
   (`user.sessions_revoked` — records `statusChanged:false, canSignInAgain:true`,
   because it is the compromised-credential response, NOT a punishment), revoke
   one device (`user.session_revoked`), reset 2FA (`user.two_factor_reset` —
   also ends sessions, so it cannot keep a live session alive without a second
   factor, and flags `mustReEnroll` for back-office accounts), send a password
   reset (`user.password_reset_sent` — the admin NEVER sees or sets a password;
   proven by asserting `password_hash` is unchanged). Self-targeting is refused;
   suspending a blacklisted user is refused (the blacklist has its own H-04
   reversal journal).
3. **IMPERSONATION IS BOUNDED TO THE BACK OFFICE, on purpose.** www and
   superadmin carry distinct cookie names AND distinct signing secrets, so a
   session minted in the back office is unreadable by www BY CONSTRUCTION.
   "Impersonate a teacher to see their portal" is therefore not a feature this
   app can ship without breaking that separation, and it does not. What it does
   allow: a super_admin viewing the finance portal as the `accountant` sees it —
   same app, same cookie, audited on start AND stop, persistent banner, 1-hour
   session. Refused: every www role, another super_admin (lateral privilege),
   yourself, and any non-active account. The admin plugin's `impersonate-admins`
   statement is deliberately NOT granted, so better-auth refuses admin targets
   independently of our own check.
4. **Money stays read-only** — the module imports no money service, and the
   proof asserts that by reading its import list (same posture as
   center-oversight).
5. **Shared-kernel move (pure, with a shim):** password reset moved to
   `@repo/server-core/services/auth/password-reset` so the back office triggers
   the SAME implementation; `apps/www/src/lib/services/auth/password-reset.ts`
   re-exports it, so every www import path and behaviour is unchanged (proven by
   mail-password-reset 15/15). The one addition is an optional `linkBaseUrl`.
   **Known limitation, stated honestly:** the reset PAGE lives in apps/www and is
   role-agnostic, so a back-office account resets on the public domain and then
   signs in to the back office. A superadmin-hosted reset page is the obvious
   follow-on and was deliberately NOT built.
6. Proof: `apps/superadmin/tests/db/admin-users.test.ts` **52/52** (live DB,
   real services). NOTE for future suites: www roles cannot pass the superadmin
   sign-in door at all (C-04), so a www user's live session is represented by a
   planted `auth_sessions` row; back-office fixtures use the real door. No
   database migration was required.
