# Migration plan — C-5: duplicate-row races NOT covered by C-4

Status: **APPROVED, WRITTEN AND APPLIED (2026-09-05).** The migration is
`packages/database/prisma/migrations/20260905120000_dedupe_guards_c5/migration.sql`,
creating exactly the four indexes in §3. Applied in the order §6 prescribes,
each with the read-only pre-flight first (census 0 rows / 0 duplicates, datasource
line read, exactly one pending):

| env | endpoint | `migrate status` | `verify-db` |
|---|---|---|---|
| dev | `ep-withered-field-b23csnyq` | 72 / 72 | 28 / 28 |
| test | `ep-morning-snow-b269im2n` | 72 / 72 | 28 / 28 |
| production | `ep-mute-rice-b2s8gg42` | 72 / 72 | 28 / 28 |

`expected-db-shape.json` is at 72. The code half of §4 shipped with it: constants in
`packages/server-core/src/db/unique-indexes.ts`, a P2002 rethrow in each of the three
blacklist imposers (same `ConflictError` message as the sequential check) and in
`proposeAgreement` (same `BusinessRuleError` message), and the proof suite
`apps/superadmin/tests/db/c05-dedupe-guards.test.ts` — **26 / 26 on the test branch**:
all four indexes unique and valid, each writer raced concurrently to exactly one live
row with the domain message on the loser, partial-ness proven (a lifted ban re-imposed,
an approved pair re-proposed), and no orphan auto-audit row. Related suites re-run green:
`h04-blacklist-cascade-reversal` 44/44, `teacher-agreements` 13/13,
`c03-status-revocation` 16/16, `agreement-refund-mirror` 10/10. Nothing is committed.
Everything below is the plan as approved, kept for the reasoning.

Audit reference: `VERIFICATION_REPORT.md` → **§2.5** (and **L-2**, the
`proposeAgreement` half). Same class of defect as `AUDIT_REPORT.md` **C-4**,
found by the independent check that ignored the report's own list.

---

## 1. What is actually broken

Four writers use the `findFirst` → `create` shape with nothing in the database
to stop a second, concurrent transaction from doing the same:

| # | Writer | Table | Logical key it checks in code | Consequence of a double-submit |
|---|---|---|---|---|
| A | `platformBlacklistUser` — `packages/server-core/src/services/blacklist/blacklist.ts:254-280` | `blacklist_entries` | `(target_id)` where `level='platform' AND is_active` | Two active platform bans on one user. Lifting one leaves the account blocked by the other; `removeBlacklistEntryTx` restores `users.status='active'` on the first lift, so the user reads as active while an active ban row still stands. The cascade journal is also written twice, so `reverseEnrollmentCascade` replays it twice. |
| B | `centerBlacklistStudentTx` — `blacklist.ts:300-348` (reached from the ERP center route, the superadmin `removeStudentFromCenter`, and `center-operations.ts`) | `blacklist_entries` | `(target_id, center_id)` where `level='center' AND is_active` | Two active center bans for one (student, center). Lifting one clears `center_student_rosters.blacklisted` while the other still blocks enrolment through `assertNotBlacklisted`. |
| C | `teacherBlacklistStudent` — `blacklist.ts:350-372` | `blacklist_entries` | `(target_id, imposed_by_id)` where `level='teacher' AND is_active` | Two active teacher bans for one (student, teacher); same lift-one-stay-blocked shape. |
| D | `proposeAgreement` — `packages/server-core/src/services/finance/agreements.ts:66-117` | `teacher_agreements` | `(center_id, teacher_id)` where `status='proposed'` | Two pending proposals for one pair. `approveAgreementTx` then activates whichever the admin clicks and leaves the other `proposed` forever; the existing `teacher_agreements_one_active_per_pair` only bites once BOTH are approved. Money-relevant: an agreement is the rate the settlement engine reads. |

All four are read-check-write inside one interactive transaction, but at READ
COMMITTED two concurrent transactions both see "no row" and both insert. The
application check cannot close this; only the database can.

`blacklist_entries` today carries **no unique constraint at all** — only three
plain indexes (`target_id`, `center_id`, `level`; `schema.prisma:1399-1401`).
`teacher_agreements` carries exactly one partial unique, on `status='active'`
(`20260825200000_teacher_agreements/migration.sql:62`).

The precedent is the same one C-4 used, and C-4's own migration
`20260902120000_dedupe_guards` (applied to all three databases 2026-09-02,
verified 71/71 on 2026-09-05).

## 2. Current data (measured 2026-09-05, read-only, all three environments)

Measured with the new read-only script
`packages/database/scripts/dedupe-census.ts` (this plan adds it; it runs the
exact SELECTs below and prints the database's `edura-env` label first):

```bash
EDURA_ENV=<dev|test|production> npx tsx scripts/dedupe-census.ts   # from packages/database
```

| | dev `ep-withered-field-b23csnyq` | test `ep-morning-snow-b269im2n` | production `ep-mute-rice-b2s8gg42` |
|---|---|---|---|
| `blacklist_entries` rows | 0 | 0 | 0 |
| …active | 0 | 0 | 0 |
| …duplicate active `(target_id)` at level `platform` | **0** | **0** | **0** |
| …duplicate active `(target_id, center_id)` at level `center` | **0** | **0** | **0** |
| …duplicate active `(target_id, imposed_by_id)` at level `teacher` | **0** | **0** | **0** |
| …active center-level rows with `center_id IS NULL` | 0 | 0 | 0 |
| `teacher_agreements` rows | 0 | 0 | 0 |
| …`proposed` | 0 | 0 | 0 |
| …duplicate `proposed` `(center_id, teacher_id)` | **0** | **0** | **0** |

Every table is **empty** in every environment — the DB suites clean up after
themselves and no operator has yet imposed a ban or proposed a rate. **No
environment needs a dedup backfill today.** The pre-flight in §6 re-runs this
census immediately before applying, because that can change between approval
and execution.

## 3. Proposed constraints

Migration name: `20260905120000_dedupe_guards_c5` (single migration, four
indexes, all additive; no column added, no row rewritten, no table created —
table count stays 82; `expected-db-shape.json` `migrations` 71 → 72).

```sql
-- A. At most ONE active platform ban per user.
CREATE UNIQUE INDEX "blacklist_platform_one_active"
  ON "blacklist_entries" ("target_id")
  WHERE "level" = 'platform' AND "is_active";

-- B. At most ONE active centre ban per (student, centre).
CREATE UNIQUE INDEX "blacklist_center_one_active"
  ON "blacklist_entries" ("target_id", "center_id")
  WHERE "level" = 'center' AND "is_active";

-- C. At most ONE active teacher ban per (student, teacher).
--    The teacher IS the imposer at this level; there is no teacher_id column.
CREATE UNIQUE INDEX "blacklist_teacher_one_active"
  ON "blacklist_entries" ("target_id", "imposed_by_id")
  WHERE "level" = 'teacher' AND "is_active";

-- D. At most ONE pending proposal per (centre, teacher).
--    Sibling of teacher_agreements_one_active_per_pair (migration 20260825200000).
CREATE UNIQUE INDEX "teacher_agreements_one_proposed_per_pair"
  ON "teacher_agreements" ("center_id", "teacher_id")
  WHERE "status" = 'proposed';
```

### Why three blacklist indexes rather than one composite

Each level keys on a different column set. `center_id` is `NULL` at the
platform and teacher levels, and `imposed_by_id` at the centre level is
*whichever admin clicked* — two centre admins banning the same student would
produce two rows that a single composite `(target_id, level, center_id,
imposed_by_id)` would accept as distinct (different imposer), and a composite
without `imposed_by_id` could not express the teacher level at all. Postgres
also treats `NULL`s as distinct in a unique index, so any composite that
includes `center_id` is silently non-unique for the two levels where it is
`NULL`. One partial index per level states each level's key exactly and nothing
else.

### Why partial on `is_active` / `status='proposed'`

Lifted bans and decided proposals are history and must stay repeatable. The
existing suites depend on that: `h04-blacklist-cascade-reversal.test.ts:328`
and `:419` re-ban a student at the platform level after an earlier ban was
lifted, and `teacher-agreements.test.ts:167-196` proposes a second rate for the
same pair after the first proposal was approved (so it is `active`, not
`proposed`). A plain
composite unique would break both flows. The partial predicates match the
`isActive: true` / `status: "proposed"` filters every one of the four writers
already uses in its `findFirst`, so the index rejects exactly what the code
already refuses sequentially.

### Why `NOT CONCURRENTLY` is acceptable here

`prisma migrate deploy` wraps each migration in a transaction block, inside
which `CONCURRENTLY` cannot run. Both tables hold **0 rows** in every
environment, so the `SHARE` lock is sub-millisecond. Re-decide this if either
table has grown materially by the time this is applied.

### What is deliberately NOT in this migration

- **No `CHECK (level <> 'center' OR center_id IS NOT NULL)`.** The census shows
  0 such rows and `centerBlacklistStudentTx:312` already throws before a
  `NULL` can be written; a `CHECK` is a different constraint type with its own
  drift story, and this migration stays index-only like C-4's.
- **No change to `teacher_agreements_one_active_per_pair`**, which is correct
  and already enforced in `approveAgreementTx`.
- **No uniqueness on `pending` collaboration requests** — that `findFirst` at
  `collaboration.ts:137` is over `(teacher, center, subject)` and is out of
  scope for a plan titled C-5; listed so the omission reads as a decision. If
  wanted, it is the same partial-index shape.

## 4. Code that changes with it

The indexes alone close the race — the losing transaction gets P2002, which
`toErrorResponse` already maps to **409 Conflict** and which the auto-audit
extension never sees (the `create` never returned, so no `blacklist.added` row
is written for the loser). So the minimum viable change is the migration plus
`schema.prisma` comments.

**`schema.prisma`** — Prisma cannot model partial unique indexes, so all four
are **deliberately not declared** there (same treatment as C-4's three and the
`search_text` generated columns). A comment on `BlacklistEntry` and
`TeacherAgreement` names the indexes and this plan, so `prisma migrate dev` is
never accepted when it proposes dropping them.

**`packages/server-core/src/db/unique-indexes.ts`** gains four constants next
to the C-4 ones, so the code that relies on them names them in exactly one
place.

**Domain messages for the loser** — recommended, in the same commit, so the
concurrent loser reads the same as the sequential one:

| Writer | Today (sequential) | With the index (concurrent loser) | Change |
|---|---|---|---|
| `platformBlacklistUser` | `ConflictError("User is already platform-blacklisted")` | bare 409 | catch P2002 on `blacklist_platform_one_active` → re-throw the same `ConflictError`. |
| `centerBlacklistStudentTx` | `ConflictError("Student is already blacklisted at this center")` | bare 409 | same, on `blacklist_center_one_active`. |
| `teacherBlacklistStudent` | `ConflictError("You have already blacklisted this student")` | bare 409 | same, on `blacklist_teacher_one_active`. |
| `proposeAgreement` | `BusinessRuleError("A proposal for this teacher is already awaiting approval")` | bare 409 | catch P2002 on `teacher_agreements_one_proposed_per_pair` → re-throw the same `BusinessRuleError`, keeping 422 and the existing (Arabic-mapped) message so the ERP client shows one string for both orderings. |

The `findFirst` checks stay: they give the common sequential case its message
without a failed insert, and the index is what makes them real rather than
advisory.

**Other creators of these tables**, each read for this plan:
- `apps/superadmin/tests/db/center-academic.test.ts:337` inserts ONE centre
  entry per student by raw SQL — unaffected.
- `packages/database/prisma/center-oversight-demo-seed.ts:105-106` only
  DELETEs from these tables — unaffected.
- No seed script creates a `blacklist_entries` or `teacher_agreements` row
  (grep across `packages/database/prisma/*.ts` and `scripts/*.ts` → 0).
- ERP routes `center/blacklist`, `teacher/blacklist`,
  `center/teacher-agreements` and superadmin `students/[id]/blacklist`,
  `teachers/[id]/blacklist`, `users/[id]/blacklist` all call the four writers
  above and change nothing on the happy path.

**Proof suite** (part of the implementation commit, not of this plan):
`apps/superadmin/tests/db/c05-dedupe-guards.test.ts`, modelled on
`c04-dedupe-guards.test.ts` — asserts the four indexes exist, are
`indisunique` and `indisvalid`; races each of the four writers concurrently
for the same key and proves exactly ONE row lands with the domain message on
the loser; proves partial-ness (a lifted ban can be re-imposed, a rejected
proposal re-proposed); and proves no audit row and no cascade journal row is
left behind by the loser.

## 5. Risks

1. **A repeat fixture or seed now fails instead of silently duplicating.** No
   seed writes these tables today; the raw-SQL fixture in `center-academic`
   writes one row per key. Low.
2. **A hidden legitimate duplicate.** The §2 census says both tables are
   empty everywhere, but that is a snapshot — hence the pre-flight in §6.
3. **Prisma drift.** Because the partial indexes are not in `schema.prisma`,
   a future `prisma migrate dev` will propose dropping them. Guarded by the
   model comments, the `unique-indexes.ts` constants, this document, and the
   proof suite's existence assertions (a dropped index is a red test).
4. **Lift-then-re-ban inside one transaction** would hit the index if the
   first row were not flipped to `is_active=false` before the second insert.
   No code path does this; `removeBlacklistEntryTx` and the three imposers
   are separate transactions. Noted so nobody writes one.

## 6. Execution order (once approved)

Per the 2026-08-02 lesson, the migration is applied to production **before**
the code that catches its P2002 deploys — nothing breaks if the code lands
first (a bare 409 instead of a domain message), but the ordering is the rule.

```bash
# 0. Pre-flight, READ-ONLY, per environment. Every "duplicate" line must be 0.
cd packages/database
EDURA_ENV=<env> npx tsx scripts/dedupe-census.ts
EDURA_ENV=<env> npx tsx scripts/verify-db.ts

# 1. dev
npx prisma migrate deploy                                    # EDURA_ENV unset = dev
npx tsx scripts/verify-db.ts

# 2. test
EDURA_ENV=test npx prisma migrate deploy
EDURA_ENV=test npx tsx scripts/verify-db.ts

# 3. production — read the "Datasource ... at <host>" line prisma prints and
#    confirm it is ep-mute-rice-b2s8gg42 BEFORE trusting anything after it.
EDURA_ENV=production npx prisma migrate status               # expect exactly 1 pending
EDURA_ENV=production npx prisma migrate deploy
EDURA_ENV=production npx tsx scripts/verify-db.ts
```

Use `npx tsx` / `npx prisma`, never `bun run db:*` — bun injects the CWD's
`.env.local` and every command silently reaches **dev**.

`scripts/expected-db-shape.json` is bumped **71 → 72** in the same commit
(`migrations` key only; `tables`, `sequences`, `rlsTables`, `policies` are
unchanged, since an index is none of those).

## 7. Rollback

Fully reversible; the migration adds no column and rewrites no row.

```sql
DROP INDEX IF EXISTS "blacklist_platform_one_active";
DROP INDEX IF EXISTS "blacklist_center_one_active";
DROP INDEX IF EXISTS "blacklist_teacher_one_active";
DROP INDEX IF EXISTS "teacher_agreements_one_proposed_per_pair";
```

Applied as a forward migration, never by deleting the row from
`_prisma_migrations` — migration order in the repo is the contract. Bumping
`expected-db-shape.json` forward to 73 belongs in the same commit. No data
rollback is needed: dropping a unique index cannot lose a row.

## 8. Verification after applying

Per environment, on the environment itself:

1. `verify-db` reports 28/28.
2. The four indexes exist and are `indisunique` and `indisvalid`:
   ```sql
   SELECT indexrelid::regclass AS idx, indisunique, indisvalid
     FROM pg_index
    WHERE indexrelid::regclass::text IN (
      'blacklist_platform_one_active',
      'blacklist_center_one_active',
      'blacklist_teacher_one_active',
      'teacher_agreements_one_proposed_per_pair');
   ```
3. `dedupe-census.ts` prints the same counts as before (§2, re-measured).
4. The constraint actually bites — proven by `c05-dedupe-guards.test.ts` on
   the test branch, not asserted here.
