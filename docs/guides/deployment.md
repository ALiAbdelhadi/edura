# Deployment — Vercel + Neon

> ## ⚠️ PARTIALLY STALE — VERIFY BEFORE ACTING (flagged 2026-07-26)
>
> Marked, deliberately not rewritten. The Vercel/Neon material is broadly
> current; the **Seeding** section below is not, and it contradicts guards that
> now exist in code (see the warning on that section). Also missing entirely:
> the production bootstrap order, the cron scheduler (nothing schedules the six
> jobs — see [../reports/cron-jobs-unscheduled.md](../reports/cron-jobs-unscheduled.md)),
> and the fact that `.env.production` files are gitignored and never read by
> Vercel, so every variable must be set in the Vercel dashboard by hand.
>
> Ground truth for environment state is the database itself:
> `packages/database/scripts/verify-db.ts` is read-only and safe against any
> target.

The app deploys to **Vercel** from this monorepo; the database is **Neon
Postgres** (serverless), accessed via `@repo/database` (Prisma + Neon driver
adapter over WebSockets — no raw TCP needed at runtime).

## Vercel project settings

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root Directory | `apps/www` |
| Install Command | (default — Vercel detects pnpm workspaces and installs from the repo root) |
| Build Command | (default `next build`) |
| Node version | 20.x |

`packages/database` has `"postinstall": "prisma generate"`, so the Prisma
client is generated automatically during install — no extra build step needed.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://edura_app:…@ep-…-pooler.…neon.tech/neondb?sslmode=require` | **Runtime role `edura_app` (NOBYPASSRLS) over the POOLED host.** RLS tenant isolation depends on this — never deploy with `neondb_owner`. |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Session JWT signing |
| `NEXTAUTH_URL` | `https://<your-domain>` | Production URL |
| `APP_BASE_URL` | `https://<your-domain>` | Links in emails |
| `MAIL_PROVIDER` | `console` / `smtp` | **Set `smtp` in production.** These are the only two accepted values ([`packages/server-core/src/mail/send.ts`](../../packages/server-core/src/mail/send.ts)) — anything else (`mailgun`, `sendgrid`, `resend`, a typo) silently falls back to `console` and **delivers no mail**, logging only a warning. Invites and password resets fail silently. |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | provider SMTP credentials | Required when `MAIL_PROVIDER=smtp`. Provider-agnostic nodemailer over SMTP — Brevo, Zoho, Gmail, Resend's SMTP bridge, or a self-hosted relay all work as an env change. Verify with `pnpm --filter www mail:check`. |
| `MAIL_FROM` | `no-reply@<your-domain>` | |

## Database migrations

Migrations are applied from a developer machine / CI, not from Vercel builds:

```bash
# preferred (needs raw TCP:5432 to the DIRECT host):
pnpm --filter @repo/database migrate:deploy

# fallback (works anywhere — applies over the Neon WebSocket driver):
cd packages/database && node scripts/apply-migrations.mjs
```

Both record state in `_prisma_migrations`, so they are interchangeable.

## Seeding

> **⚠️ STALE — both sentences below are wrong as of 2026-07-26. Do not act on
> them.** Kept verbatim for history; superseded, not rewritten.
>
> - *"Production data was ported from MongoDB via a one-time ETL"* — no. The
>   production database is an EMPTY SCHEMA SHELL: 68 tables, zero rows, no
>   catalog, no staff accounts. It has never been seeded.
> - *"safe to run anywhere"* — no, and this is the dangerous one. `prisma/seed.ts`
>   now reads the `edura-env:` label from **inside** the target database and
>   **refuses an unlabelled one outright**; against a `production`-labelled
>   database it additionally refuses unless `SEED_SUPERADMIN_EMAIL`,
>   `SEED_SUPERADMIN_PASSWORD`, `SEED_ACCOUNTANT_EMAIL` and
>   `SEED_ACCOUNTANT_PASSWORD` are all set (they are absent from
>   `.env.production` today, which is why production is empty). Against a
>   `dev`-labelled database it writes the full NILE demo world, which is the
>   opposite of "only baseline accounts".
> - Correct order for a fresh environment: `label-db` → `bootstrap-app-role` →
>   `prisma migrate deploy` → `seed` → `verify-db`. Re-running the seed rewrites
>   the super_admin password — see
>   [../reports/seed-and-fixture-findings.md](../reports/seed-and-fixture-findings.md).

Production data was ported from MongoDB via a one-time ETL (July 2026).
`pnpm db:seed` only upserts the demo/baseline accounts — safe to run anywhere,
but only needed for fresh/preview databases.

## Post-deploy checklist

1. `GET /api/v1/_ping` → `{ ok: true, db: "ok" }`
2. Log in as each role (see `test-credentials.md`)
3. `pnpm smoke:api` against the deployed URL: `SMOKE_BASE=https://<domain> pnpm smoke:api`
