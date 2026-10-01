---
paths:
  - "packages/database/**"
  - "apps/*/tests/db/**"
  - "**/prisma/**"
  - "**/*.sql"
  - "**/.env.test"
  - ".github/workflows/migrate-production.yml"
---

## DB suites

- `EDURA_ENV=test` resolves to a LOCAL Postgres (`localhost:5432/edura_test`).
  Setup, from `packages/database`: `bun run db:local` (`db:local:reset` to
  rebuild); switch with `bun run db:local:env` / `bun run db:neon:env`.
- The `.env.test` files in `apps/erp`, `apps/superadmin` and `packages/database`
  are deliberate and read by every `test:db*` script — do not delete them.
  `EDURA_ENV=test` inside them is load-bearing.
- THE CLUSTER MUST BE UTC (else `invite-claim`, `view-as`,
  `guardian-verification` fail).
- `bun run test:db:local` (either app) excludes seven suites: six need a demo
  seed / Cloudinary (`catalog-onboarding`, `c01-lesson-settlement`,
  `h03-seed-uuid-flows`, `profile-images`, `room-pricing-methods`,
  `room-revenue-split`) and `c02-payout-generation`, which proves a latency fix
  and cannot be reproduced locally. Run it against Neon:
  `(cd packages/database && bun run db:neon:env) && (cd apps/superadmin && bun run test:db --only c02-payout-generation)`
- `tx-retry-boundary` DECLINES whenever `DATABASE_DRIVER=pg` (local and CI): it
  exits `SUITE_SKIP_EXIT` and the runner badges it SKIP (since 2026-09-12), so
  its proof runs nowhere unless run on Neon:
  `(cd packages/database && bun run db:neon:env) && (cd apps/erp && bun run test:db --only tx-retry-boundary)`
- Do NOT edit `.env.test` while a suite run is in flight.
- Full history → [db-suites](../../docs/claude/db-suites.md)

## Migrations and production deploy (detail)

- 82 migrations; `expected-db-shape.json` is at 82 migrations / 84 tables.
  `verify-db` is read-only and beats any sentence here — a shape mismatch is a
  real mismatch to investigate, not to re-baseline away.
- Production deploy, from `packages/database`. `set -a; . ./.env.production`
  does NOT work in zsh (unquoted `&` in the URLs); extract the one variable:

```bash
export DIRECT_URL="$(grep -E '^DIRECT_URL=' .env.production | cut -d= -f2- | tr -d "\"'")"
```

```bash
DIRECT_URL="$DIRECT_URL&connect_timeout=60&pool_timeout=60" \
  EDURA_ENV=production EDURA_ALLOW_ENV_OVERRIDE=1 npx prisma migrate deploy
```

  A P1001 against a cold endpoint is not "production is down" — retry once.
- Bootstrap order for a fresh environment: `label-db` → `bootstrap-app-role` →
  `prisma migrate deploy` → `seed` → `verify-db`.
- `DIRECT_URL` IS THE OWNER STRING, NOT THE APP ROLE; `edura_app` can never
  migrate, by design.
- Prisma cannot model the partial/expression uniques, CHECKs, REVOKEs, or the
  generated `search_text` columns. When `prisma migrate dev` offers to drop or
  convert them — refuse. Changing `edura_search_normalize` requires rebuilding
  the `search_text` columns.
- Full log → [environment-state](../../docs/claude/environment-state.md)
