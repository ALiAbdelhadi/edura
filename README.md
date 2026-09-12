# Edura

Education platform for the Egyptian market — K-12 private lessons and teaching
centers. Centers, teachers, parents, students and teacher assistants each get a
role-scoped portal, and a separate super-admin back-office app carries the two
staff roles (see [CLAUDE.md](CLAUDE.md)).

Arabic-first (RTL, `ar` default) with full English support. Installable PWA with
offline attendance capture and native web-push notifications.

## Monorepo layout

Bun workspaces + Turborepo. Bun ≥ 1.3 — the only toolchain you install.

| Workspace | Description |
|---|---|
| [`apps/erp`](apps/erp) | The product. Next.js App Router — every role-scoped portal (center / center staff / teacher / assistant / parent / student) and the REST API under `app/api/v1/**`. Dev port 3002. |
| [`apps/superadmin`](apps/superadmin) | The back office — `super_admin` and `accountant` only, own host and own cookies, 2FA mandatory. Dev port 3004. |
| [`apps/www`](apps/www) | The public marketing site. Dev port 3010. |
| [`apps/realtime`](apps/realtime) | Socket.IO chat server — a long-running Bun process, because serverless functions cannot hold WebSockets. |
| [`packages/database`](packages/database) | `@repo/database` — Prisma schema, migrations, Neon client with RLS wrappers, seeds, shared domain queries. The **only** package that imports Prisma. |
| [`packages/server-core`](packages/server-core) | `@repo/server-core` — the shared server kernel both apps run on: money, auth, validation, errors. |
| [`packages/ui`](packages/ui) | `@repo/ui` — shadcn/ui design system (Tailwind v4, Radix, RTL-aware). |
| `packages/client-core`, `packages/notifications`, `packages/observability` | Shared client hooks, mail/WhatsApp/push egress, Sentry + PostHog wiring. |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling config. |

`apps/www` was the portals app until 2026-08-20; that app is now `apps/erp` and
the name was reused for the marketing site. Paths in documents older than that
date mean `apps/erp`.

## Getting started

```sh
bun install

# Point git at the repo's tracked hooks — once per clone. The pre-commit hook
# runs `gitleaks protect --staged`, so a clone that skips this commits unscanned.
bun run setup:git-hooks

# Environment: copy and fill (Neon URLs, NEXTAUTH_SECRET, VAPID keys, …)
# fill the single root .env — every app and package reads it via symlinks

# Apply migrations to the database (custom runner — see packages/database/README.md)
# Run via tsx, not plain node: the script imports the shared environment guard
# (scripts/db-guard.ts) and refuses an unlabelled database.
bunx tsx packages/database/scripts/apply-migrations.mjs

# Seed demo data + the Egyptian education catalog
bun run --filter @repo/database run seed

# Run everything (www + realtime)
bun run dev

# Or a single app
bun run dev --filter=edura
```

## Common commands

```sh
bun run build                        # turbo build (www uses `next build --webpack` for Serwist)
bun run lint                         # eslint across workspaces
bun run check-types                  # tsc --noEmit across workspaces
bun run --filter edura test          # vitest unit tests
bun run --filter @repo/database run generate   # prisma generate
```

## Architecture notes

- **Auth**: NextAuth (JWT, credentials) in `apps/www`; role + centerId are session
  claims. Authorization is enforced per-API-route (`requireRole`), portal layouts
  are client-side UX guards only.
- **Multi-tenancy**: Postgres row-level security on Neon. The runtime role
  `edura_app` is `NOBYPASSRLS`; center-scoped traffic runs under
  `withTenant(centerId)`, platform traffic under `withPlatformContext`.
- **Money**: integer piasters everywhere; append-only `transactions` /
  `points_ledger` (DB-level `REVOKE UPDATE/DELETE`), sequenced receipt numbers.
- **Chat**: REST + Socket.IO share one domain module
  (`@repo/database/chat`); who-may-message-whom lives in the conversation policy
  matrix (`@repo/database/chat-policy`).

All project documentation lives under [docs/](docs/README.md) — start with that
index. The essentials:
[docs/architecture/architecture-review.md](docs/architecture/architecture-review.md)
(full review: stack, schema, auth, roadmap gap analysis),
[docs/product/prd-compliance-audit.md](docs/product/prd-compliance-audit.md) (PRD
compliance audit), [docs/reports/scale-proof.md](docs/reports/scale-proof.md)
(load-test proof),
[docs/architecture/education-catalog.md](docs/architecture/education-catalog.md)
(catalog + onboarding guide),
[docs/product/edura-fullstack-prd.md](docs/product/edura-fullstack-prd.md)
(original PRD).
