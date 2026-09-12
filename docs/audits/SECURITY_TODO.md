# SECURITY_TODO.md — actions outside the repo

Companion to `SECURITY_AUDIT.md` (2026-09-11). Everything here needs a console,
a dashboard, a deploy, or a decision — nothing in the repo can do it. Tick items
off in place; add the date.

## After Batch 1 (do these now)

1. [ ] **Commit and deploy Batch 1.** The Next.js upgrade (SUPPLY-01, Critical)
   only protects production once `edura-erp`, `edura-superadmin` and `edura-www`
   are rebuilt on 16.3.5. Suggested commit message is in the session summary.
2. [ ] **Post-deploy probe** — expect 400 (path not allowed), not 200/500:
   ```bash
   curl -sI 'https://edura-erp.vercel.app/_next/image?url=https%3A%2F%2Fres.cloudinary.com%2Fdemo%2Fsample.avif&w=64&q=75' | head -1
   ```
3. [ ] **Confirm `CLOUDINARY_CLOUD_NAME` is set on the `edura-erp` Vercel project**
   (Production AND Preview). `next.config.ts` now scopes the image optimizer to
   `/<that value>/**`; if it is unset every Cloudinary image is refused (fail
   closed) rather than the optimizer being open to any account.
4. [ ] **ADMIN-01 live check** on the deployed back office, signed in as a
   super_admin that has NOT completed 2FA:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST 'https://edura-superadmin.vercel.app/api/auth/admin/update-user' \
     -H 'content-type: application/json' -H "cookie: $COOKIE" -H 'origin: https://edura-superadmin.vercel.app' \
     -d '{"userId":"<self>","data":{"twoFactorEnabled":true}}'
   ```
   Expect `404`.
5. [ ] **Tell centre staff** that a student who already has a password can no
   longer have their login email/phone edited from the roster (AUTHZ-01); the
   student changes it from Settings, and a walk-in without a password still can
   be edited at the counter.

## After Batch 2

22. [ ] **Regenerate 2FA backup codes** for both back-office staff accounts (and
    any ERP user who enabled 2FA) after deploy — codes issued before DB-03
    are still stored as plain JSON. Verify: `SELECT left(backup_codes,2) FROM
    two_factors;` no longer shows `["`.
23. [ ] **Cloudinary: confirm the new signed URL resolves.** Upload one material
    after deploy, open its download link (must 200), then open the same URL
    with one signature character changed (must fail). If the account uses
    SHA-256 URL signatures (Settings → Security → "Signature algorithm"), tell
    me — `generateSignedUrl` assumes SHA-1, the Cloudinary default.
24. [ ] **Migrate legacy materials** (rows with `cloudinary_url` set) from
    delivery type `upload` to `authenticated` — Cloudinary Admin API
    `rename` with `to_type: "authenticated"` per `cloudinary_public_id`, then
    NULL `cloudinary_url` on the row. Until then those files stay public.
25. [ ] **Paymob sandbox fixtures** (also item 17) — WEBHOOK-01 is only
    partially closed until a real refund/void callback body is on file.

## After Batch 3

26. [x] **Apply migration 81 (DB-04) to PRODUCTION** — DONE 2026-09-12.
    `migrate deploy` applied BOTH pending migrations (`20260911120000_public_handles`
    and `20260912120000_users_revoke_delete`) against `ep-mute-rice-b2s8gg42`;
    `verify-db` reported ALL 33 CHECKS PASSED, migrations 81. Two traps worth
    keeping: sourcing `.env.production` fails in zsh (`parse error near '&'` —
    unquoted `&` in the connection strings; extract `DIRECT_URL` with `grep`
    instead), and the first `migrate status` returned P1001 against a cold Neon
    endpoint while the immediate retry connected.
27. [ ] **GitHub → Settings → Actions**: default workflow permissions =
    read-only (the workflows now declare `contents: read`, this makes it the
    org default too); branch protection on `main`.
28. [ ] **B2**: split the backup key into a write-only key for the nightly dump
    and a read key for the restore-proof; enable Object Lock on the bucket.
29. [ ] **Neon**: write down the branch policy (never cut a test branch from
    production without wiping it in the same session) and confirm PITR
    retention on production.
30. [ ] **Sentry**: at least one alert rule per project (erp, superadmin,
    realtime).
31. [ ] **After deploy**: `ALLOW_UNSHARED_RATE_LIMIT` is now honoured only as
    the literal `"1"` — if any Vercel env carries `0`/`false`, remove it.

## After the .github pass (2026-09-12)

32. [ ] **The nightly backup cannot tell anyone it failed.** `backup.yml:82-87`
    hardcodes `MAIL_PROVIDER: smtp` and passes `SMTP_HOST/PORT/USER/PASS` and
    `MAIL_FROM` from repository secrets — **none of those five is set**
    (`gh secret list`). `BACKUP_ALERT_EMAIL` IS set, so the alert path looks
    configured. What actually happens on a failed backup:
    `backup-db.ts:170 alert()` imports the SMTP transport, the transport
    refuses because `SMTP_REQUIRED = [SMTP_HOST, SMTP_USER, SMTP_PASS]` are
    empty, and line 183 catches it and prints
    `(alert email also failed: …)`. The job does not fail on that, so the only
    signal is a red run somebody has to notice. CLAUDE.md already records that
    the weekly restore-proof fails on the B2 key gap, so this is live.
    The values exist and work: production's Gmail SMTP was proven with a real
    handshake on 2026-09-06. Copy the same five into repository secrets:
    ```bash
    gh secret set SMTP_HOST; gh secret set SMTP_PORT; gh secret set SMTP_USER
    gh secret set SMTP_PASS; gh secret set MAIL_FROM
    ```
    Then dispatch `backup.yml` and confirm an alert arrives on a forced failure.
33. [ ] **The Actions deploy path has never been able to run.** `deploy.yml`
    requires six secrets and exits 1 naming the missing ones;
    **`VERCEL_TOKEN` and `PRODUCTION_DIRECT_URL` are still unset**, so every
    dispatch stops at the guard. The org and the three project ids are set, so
    this is the last mile. Harmless today because deploys go through Vercel's
    own git integration, but the workflow is dead weight until both are added
    or the workflow is deleted. Decide which.
34. [ ] **Actions are pinned to commit SHAs as of 2026-09-12** (27 references,
    `actions/checkout`, `oven-sh/setup-bun`, `actions/setup-node`,
    `actions/upload-artifact`). They no longer float with the major tag, so
    security fixes in those actions now need a deliberate bump. All four are
    several majors behind their latest release (checkout v4 vs v7); review and
    upgrade as its own task, testing CI on a branch.

## Manual verification items from the audit (§5) — not yet done

6. [ ] Vercel: preview deployment protection on; previews build with
   `NODE_ENV=production`.
7. [ ] Vercel env (both projects): `NEXTAUTH_URL` https per project; distinct
   auth secrets; `VIEW_AS_SECRET` + `STUDENT_QR_SECRET` identical across
   projects; `REDIS_URL` is `rediss://`; `TRUSTED_CLIENT_IP_HEADER` set;
   `ALLOW_UNSHARED_RATE_LIMIT` and `E2E` absent; `APP_BASE_URL` /
   `ERP_BASE_URL` / `SUPERADMIN_BASE_URL` per the runbook.
8. [ ] Production `Set-Cookie` on login shows `SameSite=Lax`, `Secure`,
   `__Secure-` prefix.
9. [ ] Dev DB: `SELECT left(backup_codes,2) FROM two_factors LIMIT 3;` — `["`
   means plaintext (DB-03, Batch 2 fixes the config; existing codes must be
   regenerated afterwards).
10. [ ] Dev DB: app-role grants —
    `SELECT table_name, string_agg(privilege_type,',') FROM information_schema.role_table_grants WHERE grantee='edura_app' AND table_name IN ('users','audit_logs','payments','wallet_ledger') GROUP BY 1;`
11. [ ] Dev DB: RLS bypass proof (DB-01) and the no-RLS table list (DB-02) —
    queries in `SECURITY_AUDIT.md` §5 items 7–8.
12. [ ] Open one `materials.cloudinary_url` in a private window (OPS-01 —
    expect 200 today; Batch 2 changes this).
13. [ ] B2 console: application key capabilities, Object Lock, lifecycle rules.
14. [ ] Sentry → Alerts: at least one rule per project.
15. [ ] GitHub: Settings → Actions → default workflow permissions = read-only;
    branch protection on `main`.
16. [ ] Neon: PITR/retention on production; policy that test branches are never
    cut from production (or are wiped immediately).
17. [ ] Paymob sandbox: capture / auth / void / full & partial refund callback
    shapes and byte-exact HMAC (WEBHOOK-01/02) — needed BEFORE the Batch 2
    reversal-detection change.
18. [ ] Paymob dashboard: callback URL, checkout expiry, integration ids.
19. [ ] Vercel env on `edura-erp` before flipping `PAYMENTS_MODE`:
    `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS`, `REDIS_URL`.
20. [ ] Vercel XFF depth vs `TRUSTED_PROXY_HOPS` on the www→ERP contact hop.
21. [ ] Decide on an explicit `robots.ts` for `apps/erp`.
