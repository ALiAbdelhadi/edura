-- C-5 (VERIFICATION_REPORT.md §2.5) / MIGRATION_PLAN_C5.md: the duplicate-row races
-- C-4 did not cover. Four writers used findFirst-then-create with nothing in the
-- database behind them: the three blacklist imposers and proposeAgreement. Additive
-- only: four partial unique indexes, no column added, no row rewritten, no table
-- created. Same idiom as 20260902120000_dedupe_guards.
--
-- Three blacklist indexes rather than one composite: each level keys on a
-- different column set (center_id is NULL at two levels, and Postgres treats NULLs
-- as distinct in a unique index; imposed_by_id at the centre level is whichever
-- admin clicked). Partial on is_active / status = 'proposed' because lifted bans
-- and decided proposals are history and must stay repeatable.
--
-- NOT CONCURRENTLY is deliberate: prisma migrate deploy wraps each migration in a
-- transaction block. Measured immediately before applying, both tables held 0 rows
-- in every environment.

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
