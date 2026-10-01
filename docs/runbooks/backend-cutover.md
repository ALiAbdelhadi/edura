# Backend cutover — `apps/api` and `apps/admin-api` to production

Written 2026-10-01, after phase 5 of
[backend-separation](../decisions/backend-separation.md). **Nothing in this
document has been executed.** No Railway service exists for either backend, no
Vercel variable has been changed, and production (`ep-mute-rice-b2s8gg42`) has
not been touched. Ali runs every step.

No migration is part of this cutover. The services read the same production
database the Next apps read today.

## What changes at cutover

| Before | After |
|---|---|
| `edura-erp.vercel.app/api/**` runs inside the Next app on Vercel | Vercel rewrites it to `apps/api` on Railway |
| `edura-superadmin.vercel.app/api/**` runs inside the Next app | Vercel rewrites it to `apps/admin-api` on Railway |
| Each Next app holds `DATABASE_URL`, auth secrets, Paymob, SMTP… | The services hold them; the frontends hold a service URL and one shared proxy secret |

The browser still talks only to the two Vercel hosts. Cookies stay first-party
on those hosts (prefixes `edura` and `edura-superadmin`, no cookie domain), so
nobody is signed out by the cutover as long as the auth secrets and
`NEXTAUTH_URL` values are carried over unchanged.

**The code on `main` after phase 4/5 cannot be deployed to Vercel before the
services are live**: a production build without `API_SERVICE_URL` /
`ADMIN_API_SERVICE_URL` is refused, and with them set every `/api` call depends
on the service answering. Order below is not optional.

## 0. Before anything

1. `deploy.yml` deploys erp, www and superadmin to Vercel automatically after CI
   passes on `main`. **Disable that workflow (or hold the push) until step 4**,
   otherwise pushing the phase 4/5 commits fails the Vercel build or ships
   frontends pointing at nothing.
2. Decide the Railway region: the same one `apps/realtime` runs in, as close to
   Neon and Vercel `fra1` as Railway offers. Every `/api` request now crosses
   Vercel → Railway → Neon; a far region is paid on every call.
3. Generate one new secret, `EDURA_PROXY_SECRET` (32+ random bytes). It is the
   only new secret. Everything else is copied from the Vercel projects.

## 1. Create the two Railway services

Each backend has its own config file: `apps/api/railway.json` and
`apps/admin-api/railway.json` (root `railway.json` stays the realtime
service's). In each Railway service's settings, set the config-as-code path to
that file and leave the root directory at the repo root — the install is a
workspace install. If the plan in use has no such setting, copy the build
command, start command and healthcheck from the file into the dashboard.

| | `apps/api` | `apps/admin-api` |
|---|---|---|
| Root directory | repo root (workspace install) | repo root |
| Build | `bun install --frozen-lockfile` (no build script; Bun runs the TypeScript) | same |
| Start | `bun src/server.ts` in `apps/api` | `bun src/server.ts` in `apps/admin-api` |
| Port | `PORT` (Railway injects it; default 3006) | `PORT` (default 3007) |
| Health | `GET /api/health` → 200, or 503 when the database does not answer | same |
| Bun | ≥ 1.4.0, the version CI pins | same |
| Replicas | 2 — one instance is one JS thread (load test, 2026-09-20) | 1 is enough to start |

`/api/health` runs `SELECT 1` with an 8-second bound, so a Neon cold start can
take a few seconds on the first probe; keep the healthcheck timeout at 120.

The Prisma client must exist in the image. `packages/database` generates it in
its `postinstall`, which is how the realtime service gets it today. If the first
boot fails with a missing-client error, add
`bun run --filter @repo/database generate` to the build command (the first line
of `scripts/vercel-build.sh`). Not proven on Railway for these two services.

## 2. Service variables

Copy values from the matching Vercel project unless the row says otherwise.
Boot refuses to start when a "boot" row is missing.

### `apps/api` (from the `edura-erp` Vercel project)

| Variable | Value | Enforced |
|---|---|---|
| `NODE_ENV` | `production` | — |
| `EDURA_ENV` | `production` | namespaces Redis keys |
| `DATABASE_URL` | production pooled URL, unchanged | first query |
| `REDIS_URL` | `rediss://…`, unchanged | boot |
| `EDURA_PROXY_SECRET` | the new secret | boot |
| `NEXTAUTH_URL` | `https://edura-erp.vercel.app` — the **frontend** origin, not the Railway URL | boot (must be https) |
| `NEXTAUTH_SECRET` | unchanged — a new value signs everyone out | boot |
| `APP_BASE_URL` | `https://edura-erp.vercel.app` | — |
| `PAYMENTS_MODE` | as today | first payment call (throws if unset; `mock` refused) |
| `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS` | unchanged | webhook |
| `CRON_SECRET`, `INTERNAL_API_SECRET` | unchanged | per request |
| `REALTIME_JWT_SECRET`, `REALTIME_INTERNAL_URL`, `NEXT_PUBLIC_REALTIME_URL` | unchanged | — |
| `VIEW_AS_SECRET`, `SUPERADMIN_BASE_URL`, `STUDENT_QR_SECRET` | unchanged | — |
| `MAIL_PROVIDER`, `SMTP_*`, `MAIL_FROM`, `MAIL_REPLY_TO` | unchanged | — |
| Cloudinary, VAPID / Firebase, WhatsApp, Sentry | unchanged | — |


### `apps/admin-api` (from the `edura-superadmin` Vercel project)

| Variable | Value | Enforced |
|---|---|---|
| `NODE_ENV`, `EDURA_ENV` | `production` | — |
| `DATABASE_URL`, `REDIS_URL` | unchanged | first query / boot |
| `EDURA_PROXY_SECRET` | the same new secret | boot |
| `NEXTAUTH_URL` | `https://edura-superadmin.vercel.app` | boot |
| `SUPERADMIN_NEXTAUTH_SECRET` | unchanged | boot |
| `ERP_BASE_URL` | `https://edura-erp.vercel.app` | first use (throws if unset) |
| `INTERNAL_API_SECRET`, `VIEW_AS_SECRET` | same values as `apps/api` | — |
| `STUDENT_QR_SECRET` | copy it if the superadmin Vercel project holds it (same value as `apps/api`) | — |
| SMTP set, WhatsApp, Sentry | unchanged | — |

`ERP_BASE_URL` stays the ERP **public** origin. The same variable builds the
view-as claim URL and ERP reset links that a browser opens, so it cannot become
the `apps/api` Railway URL without a new variable.

`TRUSTED_CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` are optional on Railway. The
client IP the services use for per-IP limits is the one the frontend proxy
stamps and vouches for with `EDURA_PROXY_SECRET`; these two only decide what a
request that did **not** come through the proxy is keyed on.

## 3. Prove the services before any frontend points at them

Run against the Railway URLs. Each check has a pass condition; a fail stops the
cutover with nothing changed for users.

| # | Check | Pass |
|---|---|---|
| 1 | `GET <api>/api/health` and `<admin-api>/api/health` | 200, body reports `rateLimiter: "shared"` |
| 2 | `GET <api>/api/v1/me` with no cookie | 401 envelope with `messageAr` |
| 3 | Boot logs | no boot assertion, no Prisma client error, `EDURA_ENV` production |
| 4 | `GET <api>/api/v1/me` with a forged `x-edura-client-ip: 1.2.3.4` and no proxy auth, repeated past a per-IP limit | the limit keys on the real caller, not `1.2.3.4` |
| 5 | Stop one of the two `apps/api` replicas mid-burst (or hit both) against a per-IP limited route | the count is shared across replicas — one limit, not two |

Do not sign in against the Railway URL directly: `NEXTAUTH_URL` is the Vercel
origin, so a direct sign-in is expected to be refused or to mint a cookie for
the wrong host.

## 4. Point the frontends at the services

Vercel project `edura-erp` (production environment):

| Set | Remove later (step 7), not now |
|---|---|
| `API_SERVICE_URL` = the `apps/api` Railway https URL | `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `REALTIME_JWT_SECRET`, `VIEW_AS_SECRET`, `STUDENT_QR_SECRET`, `PAYMOB_*`, `SMTP_*` |
| `EDURA_PROXY_SECRET` = the new secret | |

Keep `APP_BASE_URL`, every `NEXT_PUBLIC_*`, the Sentry build variables and
`TRUSTED_CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` — the proxy reads the last two
to decide which address it stamps.

Vercel project `edura-superadmin`: set `ADMIN_API_SERVICE_URL` and the same
`EDURA_PROXY_SECRET`; keep `ERP_BASE_URL`, `APP_BASE_URL`, `CSP_MODE`, Sentry.

Then deploy **superadmin first** (two users, smallest blast radius), check it
(step 5), then erp. Re-enable `deploy.yml` only after step 6.

`deploy.yml:126-137` probes `<deployment>/api/health` after each Vercel deploy.
That path is now rewritten to the service, so the gate passes only when the
service is up and reachable from Vercel — which is the thing worth gating on,
but a service outage will now fail a frontend deploy.

## 5. Prove the real hop

These could not be proven locally. They are the open items from the decision
document and they are the reason this is a staged cutover.

| # | Check | Pass | If it fails |
|---|---|---|---|
| 1 | Sign in on `edura-superadmin.vercel.app` (password + TOTP), open the overview and one finance screen | pages render, no 4xx/5xx in the network tab | roll back (step 8) |
| 2 | Sign in on `edura-erp.vercel.app` as a demo account of each role | dashboards render | roll back |
| 3 | better-auth Origin check: sign-in and sign-out through the Vercel host | 200, session cookie `Secure`, set on the Vercel host | `NEXTAUTH_URL` on the service is wrong |
| 4 | **Client-IP stamp across the external rewrite.** From two different networks, trip a per-IP limit (e.g. repeated bad sign-ins) on one | only that network is limited | Vercel is not forwarding the proxy-set headers; every user shares one bucket. Roll back — this is the documented abort condition |
| 5 | A forged `x-edura-client-ip` sent by the browser to the Vercel host | ignored (the proxy deletes it before stamping) | roll back |
| 6 | A path with a dot under `/api` | still answered by the service. Known: the proxy matcher skips dotted paths, so such a request arrives unstamped and is keyed by the fallback | note it; not a blocker |
| 7 | Response headers on `/api/v1/me`, a wallet read, an attendance read | `Cache-Control: no-store`, no `x-vercel-cache: HIT` | roll back — money and per-user data must never be cached |
| 8 | Latency through the hop, p50 and p95, on a list screen and on the counter board | record the numbers **before** cutover on the same screens and agree the acceptable increase first — the decision document asked for an abort criterion and no number was ever written down | roll back, move the region |
| 9 | One sandbox/real Paymob callback and one counter cash payment | ledger rows identical in shape to before; webhook answers 200 | roll back |
| 10 | View-as from the back office into an ERP role and back | lands in the ERP, "end view-as" returns | check `ERP_BASE_URL`, `SUPERADMIN_BASE_URL`, `VIEW_AS_SECRET` on both services |
| 11 | Sentry: trigger one handled 500 on each service | event arrives tagged with the service | fix DSN; not a blocker |

## 6. Callers that reach the backend directly

All three keep working with no change, because `/api/v1/cron`, `/internal` and
`/payments` are in the ERP rewrite list. Change them only after step 5 is green.

| Caller | Today | Recommendation |
|---|---|---|
| GitHub cron (`cron.yml:70-71`, secret `CRON_BASE_URL`) | `https://edura-erp.vercel.app` | Move to the `apps/api` Railway URL. A job may run up to 300 s (`curl -m 300`); whether Vercel holds an external rewrite open that long is unproven, and a direct call does not depend on it |
| Paymob transaction callback (Paymob dashboard) | `https://edura-erp.vercel.app/api/v1/payments/paymob/webhook` | Leave it. It is HMAC-verified either way, and moving it is one more thing to get wrong on the money path |
| `apps/realtime` → app (`APP_INTERNAL_URL`, `x-internal-secret`) | the ERP URL | Leave it; `apps/realtime/src/env.ts:47` checks the value in production — read it before changing |
| `apps/api` → realtime (`REALTIME_INTERNAL_URL`) | unchanged | Both now live on Railway; Railway private networking would be a later optimisation, not part of cutover |

## 7. After a quiet week

1. Remove the variables listed in step 4 from the two Vercel projects. Until
   then they are unread but harmless; removing them early buys nothing and
   removes the rollback path.
2. Uptime monitors ([uptime-and-status](uptime-and-status.md)): add one monitor
   per Railway service on `/api/health` in addition to the Vercel-host ones —
   the pair tells "service down" from "hop down".
3. CI (`ci.yml`) now runs the superadmin, api and admin-api unit suites, the
   route-table check and both parity suites, and boots `apps/api` beside
   `apps/erp` for the E2E jobs; the build step passes no secret. Every step
   was rehearsed on a clean copy of the repo (no env files, fresh install,
   throwaway local database), but the workflow itself has not run on GitHub:
   watch the first one. Lint runs in no job.
4. Regenerate the paste sheets (`python3 scripts/gen-vercel-env.py`). It now
   writes `.env-api` and `.env-admin-api` for Railway and leaves the two
   frontend sheets with no database or auth secret; sheets generated before
   the separation still carry them.

## 8. Rollback

Before step 7 the rollback is a deploy, not a data operation:

1. Vercel → `edura-erp` (or `edura-superadmin`) → promote the last deployment
   from before phase 4/5. That build still contains the routes and still reads
   the old variables, which are still set.
2. Hold `main`: revert the phase 4 (erp) or phase 5 (superadmin) commit before
   `deploy.yml` runs again, or it redeploys the frontend-only build.
3. Leave the Railway services running; nothing calls them.

Both sides read the same database with the same code in `packages/server-core`,
so there is no data to reconcile. Sessions survive in both directions as long
as the auth secrets were not changed.

After step 7 a rollback also needs the removed variables put back first.

## Not proven anywhere yet

- Vercel forwarding proxy-set request headers across an external rewrite (step 5 #4).
- Which header Railway's edge sets for the caller address (only matters for
  requests that skip the proxy).
- Real-hop latency and the service sizing / replica count under load.
- The shared Redis limiter across two service processes (step 3 #5).
- Railway building this workspace with RAILPACK for a second and third service,
  including the Prisma client.
- A live TOTP step, the invoice PDF with a real invoice, and Sentry delivery
  from the services.
