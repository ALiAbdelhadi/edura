# apps/superadmin — Edura platform back-office

Internal staff app hosting the **super_admin** portal (platform control:
registrations queue, education-catalog manager, KPIs, points, blacklist,
center/teacher/student administration via `/api/v1/admin/**`) and the
**accountant** portal (`/dashboard/finance` + `/api/v1/finance/**`: invoices,
payouts, refunds, transactions, financial reports).

> **Terminology:** `dashboard/admin` inside `apps/www` is the **CENTER** portal
> (role `center_admin`) and has nothing to do with this app.

## Separation from www

- Own NextAuth instance: `authorize()` accepts **only** `super_admin` and
  `accountant` (checked at credential time, not just route guards). www's
  authorize() conversely rejects both staff roles.
- Own cookie names (`edura-superadmin.*`) **and** own signing secret
  (`SUPERADMIN_NEXTAUTH_SECRET`), so www and back-office sessions are mutually
  invalid even on a single domain. Deploy on its own subdomain in production.
- Accountant restriction is enforced at the **API layer**: `/api/v1/admin/**`
  routes call `requireRole("super_admin")`; `/api/v1/finance/**` allow
  `accountant` + `super_admin`.
- No chat surface (superadmin live chat is dropped — broadcast notifications
  only), no PWA/service worker, no realtime socket.

Shared drift-critical server code (money engine, blacklist, notifications
dispatch, envelope/errors/scopedDb) lives in **`@repo/server-core`**, used by
both this app and www. UI components are copied, not shared, to keep
`@repo/ui` free of app-level coupling.

## Run

```bash
pnpm install
cp apps/superadmin/.env.example apps/superadmin/.env.local   # then fill values
pnpm --filter superadmin dev        # http://localhost:3004 (prod: next start -p 3006)
```

Required env (see `.env.example`): `DATABASE_URL` (edura_app NOBYPASSRLS role,
pooled host), `SUPERADMIN_NEXTAUTH_SECRET` (must differ from www's
`NEXTAUTH_SECRET`; dev-only fallback to it exists), `NEXTAUTH_URL`.

## Seeded staff credentials

`pnpm --filter @repo/database seed` creates exactly one super_admin and one
accountant:

| Env vars (packages/database env)                       | Behavior |
|---|---|
| `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`   | Real account, **not** flagged `is_demo` (survives the pre-launch purge) |
| unset                                                  | Dev fallback `superadmin@edura.eg` / `SEED_PASSWORD` (default `Passw0rd!`), flagged `is_demo` |

Same pattern for `SEED_ACCOUNTANT_EMAIL` / `SEED_ACCOUNTANT_PASSWORD`
(fallback `accountant@edura.eg`).

The fallbacks are **dev-only and hard-gated**: with `NODE_ENV=production` the
seed refuses to run (fails fast, before any DB write) unless all four staff
credential vars are set — a known-credential staff account can never be seeded
into production.

## Tests

```bash
pnpm --filter superadmin test:db   # refund/reversal money-safety DB test (needs ADMIN_URL in .env.local)
pnpm --filter superadmin check-types
```
