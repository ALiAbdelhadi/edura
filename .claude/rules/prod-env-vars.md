---
paths:
  - "**/.env*"
  - "**/instrumentation.ts"
  - "**/lib/auth/**"
  - "**/lib/security/**"
  - "packages/server-core/**"
  - "**/vercel.json"
  - "scripts/**"
  - ".github/workflows/deploy*.yml"
---

## Required production env vars

Missing any of these fails closed — by design.
- `PAYMENTS_MODE` — must be explicit: `mock` | `sandbox` | `live`.
- `PAYMOB_HMAC_SECRET` — webhook HMAC, no fallback.
- `PAYMOB_INTEGRATION_IDS` — integrations this deployment settles for; unset
  outside mock parks every capture as `needs_review`.
- `REALTIME_JWT_SECRET` — dedicated realtime handshake secret.
- `INTERNAL_API_SECRET` — dedicated server-to-server bridge secret.
- `CRON_SECRET` — guards `/api/v1/cron/[job]` in every environment.
- `STUDENT_QR_SECRET` — signs student card QRs; SAME value in both apps.
- `VIEW_AS_SECRET` — signs the view-as handoff; SAME value in both apps.
- `ERP_BASE_URL` — apps/superadmin only: where a view-as handoff is posted.
- `SUPERADMIN_BASE_URL` — apps/erp only: where "end view-as" returns.
- `NEXTAUTH_URL` — must be `https://` on Vercel production, or the app refuses to boot.
- `TRUSTED_CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` — how the client IP is read;
  one is required on Vercel production.
- `REDIS_URL` — shared rate-limit store (`rediss://`), required at boot.
- `EDURA_PROXY_SECRET` — vouches for the client IP the ERP proxy stamps for
  `apps/api`; required at boot in `apps/api`, SAME value on `apps/erp`, rotated together.
- `API_SERVICE_URL` — apps/erp only, REQUIRED (phase 4): the `apps/api` origin.
  The ERP has no routes; every prefix in `apps/erp/src/lib/http/service-routes.ts`
  is rewritten there and SSR reads go through `src/lib/server/service-fetch.ts`.
  Unset: dev uses `http://localhost:3006`, a production server throws, a Vercel
  production build is refused. Must be `http(s)://`. Rollback = revert the commit.
- `ADMIN_API_SERVICE_URL` — apps/superadmin only, REQUIRED (phase 5): the
  `apps/admin-api` origin. Same rules as `API_SERVICE_URL` (dev default
  `http://localhost:3007`). `apps/admin-api` itself needs `SUPERADMIN_NEXTAUTH_SECRET`,
  an `https://` `NEXTAUTH_URL` (the superadmin public origin), `DATABASE_URL`,
  `REDIS_URL` and `EDURA_PROXY_SECRET` (SAME value on `apps/superadmin`).
- `apps/api` in production also refuses to boot without an `https://` `NEXTAUTH_URL`
  and a `NEXTAUTH_SECRET` (Railway sets no `VERCEL_ENV`).
- Full remediation log → [security-remediation](../../docs/claude/security-remediation.md)
