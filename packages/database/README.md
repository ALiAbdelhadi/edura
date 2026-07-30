# @repo/database

The **only** package that imports Prisma directly. Owns the Prisma schema,
migrations, generated client, Neon adapter, structural extensions, seed/ETL,
and domain query functions. Everything outside this package imports the typed
client, tenant helpers, and derived types from `@repo/database`.

## Layout

```
prisma/
  schema.prisma          # reconciled Edura + EduConnect (PRD) data model
  migrations/            # SQL migrations (init + RLS/constraints)
src/
  client.ts              # Neon-adapter singleton + withTenant/withPlatformContext
  context.ts             # AsyncLocalStorage request context (actor/center/ip)
  extensions/            # soft-delete, append-only ledgers, auto audit-log
  queries/               # domain-grouped query functions (auth, …)
  types.ts               # re-exported model + enum types
  index.ts               # package barrel
scripts/
  apply-migrations.mjs   # applies migrations over the Neon WS driver
  smoke-test.ts          # proves RLS / immutability / soft-delete end-to-end
```

## Tenant isolation (RLS)

Isolation is enforced at the DB layer via Postgres Row-Level Security, with
app-layer `requireRole`/`requireCenterScope` kept on top as defense-in-depth.

- Runtime connects as a **NOBYPASSRLS** role (`edura_app`). Neon's default
  `neondb_owner` has `BYPASSRLS` and must NOT be used at runtime, or RLS is
  silently ignored.
- Wrap tenant work in `withTenant(centerId, tx => …)` — sets
  `app.current_center_id` for the transaction; policies filter on it.
- Wrap cross-tenant / platform work (super_admin, accountant, money-distribution
  job, seed, ETL) in `withPlatformContext(tx => …)` — sets `app.bypass_rls`,
  which the policies honor at the SQL level (works even for a NOBYPASSRLS role).

## Structural guarantees (not "remember to call it")

- **Soft delete** — models with `deletedAt` (currently `User`): `delete()`
  becomes an `updatedAt` write and reads auto-filter deleted rows.
- **Append-only ledgers** — `Transaction`, `Invoice`, `Payout`, `PointsLedger`
  reject `update`/`delete`/`upsert`; corrections are reversal inserts.
- **Audit log** — sensitive mutations auto-write `audit_logs`, attributed via
  the ambient request context.

## Commands

```
bun run --filter @repo/database generate     # prisma generate
node scripts/apply-migrations.mjs         # apply migrations over WS (Neon)
bun run --filter @repo/database exec tsx scripts/smoke-test.ts
```
