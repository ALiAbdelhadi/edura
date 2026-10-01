# Conventions (full text, incl. dated environment notes)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

## Conventions

> **STATE CLAIMS MUST NAME THEIR ENVIRONMENT (binding, added 2026-07-26).**
> There are three databases — `dev`, `test`, `production` — each carrying its
> environment as a label INSIDE it (`edura-env:<env>`; see
> `packages/database/scripts/db-guard.ts`). Any sentence in this file asserting
> that something is *applied, in force, present, seeded, or wiped* MUST say which
> environment it is true of. An unqualified "applied" reads as "everywhere" and
> has already misled: the guardian migrations were applied to dev only, while
> this file said "applied" flatly, and production was two migrations behind
> without anyone noticing. Behaviour and policy claims ("the gate is
> default-closed") need no qualifier — only claims about the state of a
> database, an environment, or a deployment do.
>
> Environment state changes without a commit, so this file goes stale silently.
> `packages/database/scripts/verify-db.ts` is read-only and safe against any
> target: prefer running it over trusting a sentence written here.

- All demo/seed data is flagged `is_demo = true` so it can be purged later.
  Purgeable `is_demo` demo data is wiped before launch. This NEVER includes the
  permanent reference data — the Egyptian education catalog (systems / stages /
  grades / tracks / subjects / offerings) and my real superadmin/accountant
  accounts — which always stay.
  **[dev, verified 2026-07-26]** the catalog is present (3 systems / 45 subjects
  / 27 grade levels) and the real operator account exists.
  **[dev, WIPED + RE-SEEDED 2026-07-31]** the entire dev database was reset at
  Ali's request with `packages/database/scripts/wipe-data.ts` (`bun run db:wipe
  dev --yes` — label-guarded, dev/test only, REFUSES production by design):
  552 users / 144 centers / 508 transactions truncated across 70 tables,
  sequences restarted. Later the same day Ali
  requested a FULLY EMPTY start: wiped again and seeded with the new
  `bun run seed --no-demo` (production-equivalent path: catalog + the two real
  staff accounts + points rules, ZERO demo entities). Census now: 2 users /
  0 centers / 0 courses / 0 money rows / 45 catalog subjects; verify-db 25/25
  green. NOTE: dev quick-login tiles and the local E2E role-portal tests need
  demo accounts — run the demo seeds (`bun run seed` + preview-seed) if a
  populated preview is ever wanted again; CI is unaffected (test branch seeds
  its own). Every dev-state claim in this
  file dated BEFORE 2026-07-31 (legacy unflagged rows, 41 leaked super_admins,
  student_profiles dob counts) is now historical — that data no longer exists. **[production, BOOTSTRAPPED 2026-07-31]** the production branch
  (ep-solitary-river…, labelled `edura-env:production` internally) is now LIVE-READY:
  all 40 migrations applied, seeded via the production seed path (45 catalog
  subjects / 411 offerings, the two real staff accounts from SEED_*, points
  rules, ZERO demo rows), the H2 `centers_wallet_balance_nonneg` CHECK
  VALIDATED, and verify-db reports 25/25. During bootstrap the role-guard
  caught the old prod `DATABASE_URL` pointing at `neondb_owner` — it now uses
  `edura_app` (password synced to `APP_ROLE_PASSWORD`); the owner string lives
  only in `ADMIN_URL`/`DIRECT_URL`. (The earlier 2026-07-26 note — empty shell,
  68 tables, never seeded — is history.)
  **[production, 2026-08-02] CAUGHT AND FIXED: production had been running
  better-auth CODE against a database with NO auth tables.** `better_auth` was
  merged to main on 2026-08-01 but never applied to production, so
  `auth_sessions` / `auth_accounts` / `auth_verifications` / `two_factors` did
  not exist there and EVERY sign-in returned 500 instead of 401 — proven by
  probing the deployed login door with deliberately invalid credentials before
  and after. Every pending migration was applied — `better_auth`,
  `maturity_enums`, `maturity_layer`, `contact_submissions`: production went
  41 → 45 migrations, 70 → 77 tables, verify-db 25/25, and the login door now
  returns 401. Data was untouched (6 users / 1 center / 0 money rows before and
  after).
  **A second lesson from the same session, kept because it was a real mistake:**
  `contact_submissions` was applied to production BEFORE the workstream that
  owned the table had merged its own (non-idempotent) `maturity_layer`
  migration. That left production unable to run maturity_layer at all — its
  plain `CREATE TYPE contact_submission_status` would have aborted on the type
  this branch had already created, taking `feature_flags` and
  `data_export_requests` down with it. The repair was to drop the (empty,
  0-row) table and type, delete the migration's row from `_prisma_migrations`,
  and re-run the whole set in name order so `maturity_layer` created the table
  as its author intended. Do NOT apply a migration to production ahead of a
  sibling branch that owns the same object; migration order in the repo is the
  contract, and applying out of order breaks it for everyone downstream.
  **The lesson, written down because it cost a live outage:** merging a
  migration to main does NOT apply it anywhere. A branch whose code needs new
  schema must have its migration applied to production BEFORE that code
  deploys, and `verify-db` against production is the check that would have
  caught it on day one — it is read-only and safe against any target.
  Bootstrap order for a fresh environment: `label-db` → `bootstrap-app-role` →
  `prisma migrate deploy` → `seed` → `verify-db`.
- **Realistic demo data during development:** whenever building a new
  feature/screen/system, also seed enough realistic demo data (flagged
  `is_demo = true`) so I can view and test it as if it were real — populated
  screens, not empty states. Keep all demo data in clearly-labeled,
  cleanly-removable seed scripts. NEVER let demo data write to the money
  ledger, wallets, or finance tables unless the feature being built IS a money
  feature and I've approved its plan — and even then, flag it `is_demo` and
  keep it purgeable. This demo data is for my preview only and gets wiped
  before launch (Step 9 style).
- Secrets only via env vars (e.g. PAYMOB_*, WHATSAPP_*). Never hardcode.
- Destructive operations use soft-delete; all superadmin writes go to an audit log.
- Prefer incremental, migration-safe schema changes.
- Git: Claude never runs git add/commit/push and never adds a Co-Authored-By or
  any other trailer to commit messages. Claude only provides the commit message
  text; I run all git commands myself.
