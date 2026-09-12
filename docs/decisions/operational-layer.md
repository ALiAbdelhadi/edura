# Operational layer (built 2026-08-02 — awaiting review)

Notifications, error tracking, product analytics, backups, health checks. Four
new surfaces, two new packages, and NO schema migration.

1. **`packages/notifications` is the single owner of transactional email.**
   `send(template, to, data)`; NEVER THROWS (every call site is downstream of a
   committed write). Templates are react-email, ar/en, RTL, each with a
   hand-written `text/plain` part: `welcome`, `password_reset`,
   `email_verification`, `payment_receipt`.
   **The SMTP transport MOVED here** (`transport/smtp.ts`) so the package is a
   LEAF — `@repo/server-core/mail/send` is now a re-export shim, and server-core
   depends on notifications rather than the reverse. Without the move,
   password-reset.ts calling a renderer that calls sendMail would be a cycle.
   This also killed real drift: `welcome-email.ts` had a THIRD hand-rolled email
   design (indigo, no shared layout) and now renders in the one shell.
   > **Resend is an ENV change, not a code change** (`MAIL_PROVIDER=smtp`,
   > `SMTP_HOST=smtp.resend.com`, API key as the password). No vendor SDK was
   > added — the 2026-07-23 decision stands.
   The three INVITE templates (student claim / assistant / staff) deliberately
   stayed hand-written in `server-core/mail/templates.ts`: each is threaded
   through a claim flow with heavy proofs, and the new shell is a VISUAL MATCH,
   so porting them is a copy of their COPY constants with no design decision
   left. **WhatsApp costs one file + one array entry + one env value** — proven
   by a test that registers a synthetic channel and asserts the fan-out reaches
   it, with zero dispatcher change.

2. **better-auth: `sendResetPassword` is DELIBERATELY NOT SET, in both apps.**
   better-auth ships a complete reset flow backed by its own
   `auth_verifications` tokens, and its writer does NOT bump
   `users.token_version` — the write that fires `users_revoke_sessions`. Wiring
   it would give the app a second way to set a password that leaves every
   pre-existing session alive, silently undoing L1. Reset stays on
   `requestPasswordReset`. Only `emailVerification.sendVerificationEmail` is
   wired (no competing implementation; does NOT set `requireEmailVerification`,
   so no sign-in behaviour changed). Same reasoning as ONE SUSPENSION MECHANISM.

3. **`packages/observability` is the ONE place that decides what Sentry and
   PostHog may see.** Dependency-free (browser + node + edge import it).
   **IDs only** — never a name, email, phone, or anything a human typed.
   **`isMinorRole()` treats EVERY `student` as a minor**, deliberately stricter
   than `chat-minors.ts` (which does read the verified DOB columns): analytics
   does not get a birth-date read on the page-view path, and stricter is the
   right direction for a third party. Session replay/recording and autocapture
   are OFF (autocapture records clicked element TEXT — on a roster screen that
   is a list of children's names). `beforeSend` deletes cookies/headers/bodies
   and redacts the single-use TOKENS that ride in claim/reset/onboarding query
   strings; if scrubbing itself throws it returns null and DROPS the event.
   Proof: `apps/www/tests/unit/observability.test.ts` 26/26.

4. **The PostHog funnel is the CENTER/TEACHER activation journey**, so the
   minor rule costs it nothing — a student appears only as the OBJECT of "first
   student added". `first_*` is COMPUTED (row count === 1), never assumed.
   The funnel helpers live in `@repo/server-core/services/analytics` so the
   WALLET and CASH rails (kernel code) report the same events; a helper in
   apps/www could only ever have seen the gateway rail. PostHog is
   reverse-proxied through `/ingest` because `*.i.posthog.com` is on every
   ad-blocker list; Sentry is NOT proxied, because an error tracker must work
   when this server is unhealthy.

5. **`/api/health` in both apps** (not `/api/v1/` — infrastructure, not product
   API). Status CODE is the signal: 200 / 503 + `Retry-After`. Only the DATABASE
   affects status. **Bounded at 8s, and the number was measured:** 3s produced a
   FALSE 503 on a Neon cold start (scale-to-zero; warm requests are 96–550ms).
   Do not lower it without re-measuring a cold start. The pre-existing
   `/api/v1/_ping` returns 200 even when the DB is unreachable — never point a
   monitor at it.

6. **Backups: `db:backup` + `db:restore-test`.** Encrypted (`age`, public-key)
   `pg_dump -Fc` to any S3-compatible bucket, 7 daily + 4 weekly, label-guarded
   by the same `edura-env:` marker, and it REFUSES to upload an unencrypted
   dump. `.github/workflows/backup.yml` runs it nightly + a **weekly restore
   test that pulls from the BUCKET** (so download and decrypt are exercised too).
   > **[2026-08-02] THE SCHEDULE IS DISABLED — nothing is being backed up
   > automatically.** No bucket and no `BACKUP_*` secrets exist yet, and the
   > job fails LOUDLY rather than skipping quietly, so it was paused rather
   > than training anyone to ignore a nightly red run. **Neon PITR is the only
   > protection currently in force.** Re-enable with
   > `packages/database/scripts/setup-backup-secrets.sh`, confirm a manual run
   > passes, then restore the `schedule:` block (exact YAML is in the
   > workflow's header comment — the key was REMOVED, not emptied, because
   > GitHub rejects an empty schedule array).
   > **PostgreSQL client major must be >= the server's.** Neon runs **18.4**;
   > `pg_dump` 17 aborts outright. The scripts pre-flight this with an
   > actionable error.
   **[dev, VERIFIED 2026-08-02]** a real 0.32 MiB dump restored into a scratch
   PostgreSQL 18.4 server: 8/8 checks — 78 tables, 44 applied migrations, 45
   subjects / 27 grade levels, 38 users, 0 orphaned refunds/enrollments, 296
   indexes / 45 FKs. Caveat recorded honestly in the runbook: dev held 0
   transactions and 0 payments, so the money-ledger check passed VACUOUSLY.
   **[production] never exercised.** A restored dump has NO `edura_app` role and
   NO grants (`--no-owner --no-privileges`), so `db:bootstrap-role` + `db:verify`
   after a restore is MANDATORY — otherwise the money ledger comes back
   writable. Runbook: [docs/runbooks/backup-restore.md](../runbooks/backup-restore.md).

Docs: [backup-restore.md](../runbooks/backup-restore.md),
[uptime-and-status.md](../runbooks/uptime-and-status.md),
[observability.md](../runbooks/observability.md).
Proofs: unit 181 pass/1 skip (up from 132), check-types 8/8, `bun run build`
both apps, mail-password-reset **15/15** and invite-claim **107/107** on the
live test DB after the template re-point, lint error-parity with main.

### Optional env vars added
All are OPT-IN: with none of them set, Sentry and PostHog are inert and mail
behaves exactly as before.
- `NOTIFICATION_CHANNELS` (default `email`), `NOTIFICATIONS_PREVIEW`,
  `NOTIFICATIONS_PREVIEW_DIR`.
- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`,
  `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`; CI only:
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_PROJECT_SUPERADMIN`,
  `SENTRY_AUTH_TOKEN`.
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (use the EU region).
- Backups (CI secrets): `BACKUP_DIRECT_URL`, `BACKUP_AGE_RECIPIENT`,
  `BACKUP_AGE_IDENTITY`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`,
  `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_REGION`,
  `BACKUP_ALERT_EMAIL`, `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`.
