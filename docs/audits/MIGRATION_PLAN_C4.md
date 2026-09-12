# Migration plan — C-4: duplicate-row races on tables with no unique constraint

Status: **APPROVED, WRITTEN AND APPLIED** — corrected 2026-09-05; this header
said "PLAN ONLY, nothing applied" for three days after it stopped being true.
The migration is `packages/database/prisma/migrations/20260902120000_dedupe_guards/migration.sql`
(named `20260902…`, not the `20260901…` proposed in §3, because it was written the
next day). It creates exactly the three indexes in §3 and is applied to:

| env | endpoint | `migrate status` | `verify-db` |
|---|---|---|---|
| dev | `ep-withered-field-b23csnyq` | 71 / 71 | 28 / 28 |
| test | `ep-morning-snow-b269im2n` | 71 / 71 | 28 / 28 |
| production | `ep-mute-rice-b2s8gg42` | 71 / 71 | 28 / 28 |

(measured read-only 2026-09-05; `expected-db-shape.json` is committed at 71.)
The code half of §4 shipped with it — `isUniqueViolation` → domain `ConflictError`
in `linkTeacherCenter`, a P2002 catch in `linkParent`, a one-shot retry in
`updateWalletPolicy` — with index names in
`packages/server-core/src/db/unique-indexes.ts` and the proof suite
`apps/superadmin/tests/db/c04-dedupe-guards.test.ts` (19/19 on the test branch).
None of it is committed yet. Everything below this line is the plan as approved,
kept for the reasoning; §6 and §8 describe steps that have already been carried out.

Audit reference: `AUDIT_REPORT.md` → **C-4**.

---

## 1. What is actually broken

Three writers use the `findFirst` → `create` shape with nothing in the database
to stop a second, concurrent transaction from doing the same:

| # | Writer | Table | Consequence of a double-submit |
|---|---|---|---|
| A | `linkTeacherCenter` — `apps/superadmin/src/lib/services/admin/platform.ts:309-331` | `center_teacher_affiliations` | Two live affiliations for one (center, teacher). `centerShare` is later read back with `findFirst`, so **which row prices the revenue split is arbitrary** — money-relevant. |
| B | `linkParent` — `apps/superadmin/src/lib/services/admin/platform.ts:392-416` | `parent_student_links` | Two approved guardian links for one (parent, student). Duplicated parent-oversight reach and duplicated notification fan-out. |
| C | `updateWalletPolicy` — `apps/superadmin/src/lib/services/settings/wallet-settings-admin.ts` | `wallet_settings` | Two singleton policy rows; `getWalletPolicy` reads one with `findFirst`, so the top-up min/max in force becomes arbitrary. |

All three are read-check-write inside one interactive transaction, but at
READ COMMITTED two concurrent transactions both see "no row" and both insert.
The application check cannot close this; only the database can.

The precedent is already in the repo — `commission_settings` solved exactly this
shape in migration `20260719160000_commission_settings`:

```sql
CREATE UNIQUE INDEX commission_one_global ON commission_settings ((true)) WHERE scope = 'global';
CREATE UNIQUE INDEX commission_one_per_center ON commission_settings (center_id) WHERE scope = 'center';
```

## 2. Current data (measured 2026-09-01, read-only, all three environments)

| | dev | test | production |
|---|---|---|---|
| `center_teacher_affiliations` rows | 1 | 0 | 2 |
| …duplicate `(center_id, teacher_id)` in `('pending','active')` | **0** | **0** | **0** |
| `parent_student_links` rows | 1 | 0 | 3 |
| …duplicate `(parent_id, student_id)` in `('pending','approved')` | **0** | **0** | **0** |
| …duplicate `(parent_id, student_id)` any status | **0** | **0** | **0** |
| `wallet_settings` rows | 1 | 0 | **1** |

**No environment needs a dedup backfill today.** The pre-flight in §6 re-runs
these exact counts immediately before applying, because that can change between
approval and execution.

## 3. Proposed constraints

Migration name: `20260901120000_dedupe_guards` (single migration, three indexes,
all additive; no column added, no row rewritten, no table created — table count
stays 82).

```sql
-- A. At most ONE live affiliation per (center, teacher).
--    Partial, because the terminal states are history and must stay repeatable:
--    a teacher may be removed from a centre and re-invited any number of times.
CREATE UNIQUE INDEX "center_teacher_affiliation_one_live"
  ON "center_teacher_affiliations" ("center_id", "teacher_id")
  WHERE "status" IN ('pending', 'active');

-- B. At most ONE live guardian link per (parent, student).
--    Same reasoning: 'rejected' and 'revoked' are history and re-requestable.
CREATE UNIQUE INDEX "parent_student_link_one_live"
  ON "parent_student_links" ("parent_id", "student_id")
  WHERE "status" IN ('pending', 'approved');

-- C. wallet_settings is a singleton. Same ((true)) idiom as commission_one_global.
CREATE UNIQUE INDEX "wallet_settings_one_row"
  ON "wallet_settings" ((true));
```

### Why partial rather than plain composite

A plain `UNIQUE (center_id, teacher_id)` would make the terminal states
unrepeatable: a teacher removed from a centre could never be re-invited, because
the `removed` row would block the new `pending` one. That breaks
`inviteTeacher` (`packages/server-core/src/services/center/roster.ts:484`) and
`acceptCollaborationRequest`
(`packages/server-core/src/services/collaboration/collaboration.ts:298`), both
of which legitimately create a fresh row after an earlier one ended. The same
argument applies to `parent_student_links` (`rejected` / `revoked`).

### Why `NOT CONCURRENTLY` is acceptable here

`CREATE INDEX` without `CONCURRENTLY` takes a `SHARE` lock that blocks writes to
the table for the duration. On the measured row counts (0–3 rows per table in
every environment) that is sub-millisecond. `CONCURRENTLY` cannot run inside a
transaction block, which is what `prisma migrate deploy` wraps each migration
in, so avoiding it also keeps the migration ordinary. **If any of these tables
has grown materially by the time this is applied, re-decide this point** — the
same caveat migration 55 carried.

## 4. Code that changes with it

The indexes alone close the race — the losing transaction gets P2002, which
`toErrorResponse` already maps to **409 Conflict**. That is the correct outcome
for all three writers (each already throws `ConflictError` on the read-check
path). So the minimum viable change is the migration plus `schema.prisma`.

**`schema.prisma`** — Prisma does not model partial unique indexes, so the two
partial ones are **deliberately not declared** there (same treatment the
`search_text` generated columns already get). Only the singleton can be
expressed, and even that changes nothing at the type level. Recommendation:
declare none of the three in `schema.prisma`, and add a comment on each model
naming the index and this plan, so `prisma migrate dev` is never tempted to
"correct" the drift.

**Optional follow-ups, NOT part of this migration** (listed so the decision is
explicit, not so they get bundled in):

| Writer | Today | With the index | Worth changing? |
|---|---|---|---|
| `linkTeacherCenter` `platform.ts:325` | `findFirst` + `create` | Loser gets a bare 409 | Optional: catch P2002 and re-throw the existing `"Teacher is already linked to this center"` message so the loser reads the same as the sequential case. |
| `linkParent` `platform.ts:410` | `findFirst` + update-or-create | Loser gets a bare 409 | Same, with `"Parent is already linked to this student"`. |
| `updateWalletPolicy` | `findFirst` + create/update | Loser gets a bare 409 on the very first concurrent PUT only | Better: switch to a keyed `upsert` on the new index so a first-write race converges instead of erroring. |

Other creators of these tables — `inviteTeacher` (roster.ts:484),
`acceptCollaborationRequest` (collaboration.ts:298), external teachers
(external-teachers.ts:259), `parent-links.ts:88` in the ERP — were each read and
already guard against a live duplicate in application code; the index makes that
guard real rather than advisory. **No behaviour of theirs changes on the happy
path.**

**Seeds and fixtures:** 12 seed scripts and ~20 DB test fixtures create rows in
these two tables. Every one inspected creates a single row per pair, or already
uses `upsert`. The ones to watch on the first run after applying are
`packages/database/prisma/preview-seed.ts` and
`packages/database/prisma/uat-seed.ts`, which create affiliations in a loop —
a re-run over a non-wiped database is the realistic way to hit the new index.

## 5. Risks

1. **A repeat seed run now fails instead of silently duplicating.** That is the
   point of the constraint, but it converts a quiet mess into a loud failure and
   someone will meet it first in a seed, not in the app.
2. **A hidden legitimate duplicate.** The §2 counts say there is none in any
   environment, but the counts are a snapshot — hence the pre-flight in §6.
3. **`wallet_settings` singleton is retroactive.** If a second row is ever
   created between now and applying, the migration fails loudly. Resolution is a
   judgement call (which policy is the real one), so it must NOT be automated
   inside the migration.
4. **Prisma drift.** Because the partial indexes are not in `schema.prisma`,
   a future `prisma migrate dev` will propose dropping them. Guarded only by the
   model comments in §4 and by this document.

## 6. Execution order (once approved)

Per the 2026-08-02 lesson, the migration is applied to production **before** any
code that depends on it deploys — though nothing here depends on it, so the
ordering is only about dev → test → production discipline.

```bash
# 0. Pre-flight, READ-ONLY, per environment. Must print 0 for every duplicate
#    count and 0-or-1 for wallet_settings before going further.
EDURA_ENV=<env> npx tsx packages/database/scripts/verify-db.ts
# plus the three duplicate SELECTs from §2

# 1. dev
cd packages/database && npx prisma migrate deploy          # EDURA_ENV unset = dev
npx tsx scripts/verify-db.ts

# 2. test
EDURA_ENV=test npx prisma migrate deploy
EDURA_ENV=test npx tsx scripts/verify-db.ts

# 3. production — read the "Datasource ... at <host>" line prisma prints and
#    confirm it is the production endpoint BEFORE trusting anything after it.
EDURA_ENV=production npx prisma migrate status              # expect exactly 1 pending
EDURA_ENV=production npx prisma migrate deploy
EDURA_ENV=production npx tsx scripts/verify-db.ts
```

Use `npx tsx` / `npx prisma`, never `bun run db:*` — bun injects the CWD's
`.env.local` and every command silently reaches **dev**.

`scripts/expected-db-shape.json` must be bumped **70 → 71** in the same commit
(`migrations` key only; `tables`, `sequences`, `rlsTables`, `policies` are all
unchanged, since an index is none of those).

## 7. Rollback

Fully reversible; the migration adds no column and rewrites no row.

```sql
DROP INDEX IF EXISTS "center_teacher_affiliation_one_live";
DROP INDEX IF EXISTS "parent_student_link_one_live";
DROP INDEX IF EXISTS "wallet_settings_one_row";
```

Applied as a forward migration (`20260901…_dedupe_guards_rollback`), never by
deleting the row from `_prisma_migrations` — migration order in the repo is the
contract, per the 2026-08-02 note in CLAUDE.md. Reverting `expected-db-shape.json`
to 70 (or forward to 72) belongs in the same commit.

No data rollback is needed: dropping a unique index cannot lose a row, and no
row was rewritten to create it.

## 8. Verification after applying

Per environment, on the environment itself:

1. `verify-db` reports its full check count green.
2. The three indexes exist and are `indisunique` and `indisvalid`:
   ```sql
   SELECT indexrelid::regclass AS idx, indisunique, indisvalid
     FROM pg_index
    WHERE indexrelid::regclass::text IN (
      'center_teacher_affiliation_one_live',
      'parent_student_link_one_live',
      'wallet_settings_one_row');
   ```
3. Row counts before and after are identical (§2 numbers, re-measured).
4. The constraint actually bites — two concurrent `linkTeacherCenter` calls for
   the same (center, teacher) end with exactly ONE live affiliation and a 409,
   proven in a DB suite rather than asserted here. That suite is part of the
   implementation commit, not of this plan.
