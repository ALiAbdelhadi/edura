# Deployment — Vercel + Neon

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
| `MAIL_PROVIDER` | `console` / `mailgun` / `sendgrid` | + provider keys if not console |
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

Production data was ported from MongoDB via a one-time ETL (July 2026).
`pnpm db:seed` only upserts the demo/baseline accounts — safe to run anywhere,
but only needed for fresh/preview databases.

## Post-deploy checklist

1. `GET /api/v1/_ping` → `{ ok: true, db: "ok" }`
2. Log in as each role (see `docs/test-credentials.md`)
3. `pnpm smoke:api` against the deployed URL: `SMOKE_BASE=https://<domain> pnpm smoke:api`
