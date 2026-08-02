-- =============================================================================
-- ROLLBACK for 20260803100000_external_teachers.
--
-- Prisma Migrate has no `down` step, so this file is the reversal, kept beside
-- its migration and run by hand:
--
--   psql "$ADMIN_URL" -f rollback.sql
--   DELETE FROM _prisma_migrations WHERE migration_name = '20260803100000_external_teachers';
--
-- Then check out the schema.prisma from before the migration and regenerate.
--
-- WHAT IT COSTS — stated plainly, because a rollback that pretends to be free
-- is how data disappears:
--   * DROPPING the two new tables destroys the conversion journal and the cash
--     settlement statements. The MONEY itself is NOT in them — it is in
--     `transactions` (payout rows) and the wallet balances, both untouched here
--     — but the human-readable statements are gone. Dump them first if the
--     environment has any:
--         \copy (SELECT * FROM external_teacher_settlements)   TO 'ets.csv' CSV HEADER
--         \copy (SELECT * FROM teacher_system_status_changes) TO 'tsc.csv' CSV HEADER
--   * DROPPING data_source loses the provenance labels (which rows were keyed
--     in by hand). No row's meaning changes — a manual payment was always a
--     real payment — but reports can no longer separate the two.
--   * DROPPING system_status turns every off-system teacher back into an
--     ordinary teacher record. Their students, groups, attendance, grades and
--     money all survive untouched, because none of it was ever stored on these
--     columns; they stay `status='shell'` users with no login, which is what
--     they were before this feature existed.
--
-- The order below is the exact reverse of the migration: policies and tables
-- first, then columns, then types (a type cannot be dropped while a column
-- still uses it).
-- =============================================================================

-- 6/5. New tables (their indexes, policies, FKs and grants go with them).
DROP TABLE IF EXISTS external_teacher_settlements;
DROP TABLE IF EXISTS teacher_system_status_changes;

-- 4. Provenance columns (partial indexes are dropped with their column).
ALTER TABLE center_teacher_affiliations DROP COLUMN IF EXISTS data_source;
ALTER TABLE center_student_rosters      DROP COLUMN IF EXISTS data_source;
ALTER TABLE subscriptions               DROP COLUMN IF EXISTS data_source;
ALTER TABLE transactions                DROP COLUMN IF EXISTS data_source;
ALTER TABLE payments                    DROP COLUMN IF EXISTS data_source;
ALTER TABLE grades                      DROP COLUMN IF EXISTS data_source;
ALTER TABLE attendance_records          DROP COLUMN IF EXISTS data_source;
ALTER TABLE enrollments                 DROP COLUMN IF EXISTS data_source;
ALTER TABLE sessions                    DROP COLUMN IF EXISTS data_source;
ALTER TABLE courses                     DROP COLUMN IF EXISTS data_source;

-- 3. Manual-entry dedup key.
DROP INDEX IF EXISTS student_profiles_national_id_key;
ALTER TABLE student_profiles DROP COLUMN IF EXISTS national_id;

-- 2. teacher_profiles.
DROP INDEX IF EXISTS teacher_profiles_managed_by_center_idx;
DROP INDEX IF EXISTS teacher_profiles_system_status_idx;
ALTER TABLE teacher_profiles DROP CONSTRAINT IF EXISTS teacher_profiles_managed_by_center_id_fkey;
ALTER TABLE teacher_profiles DROP CONSTRAINT IF EXISTS teacher_external_needs_center;
ALTER TABLE teacher_profiles
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS managed_by_center_id,
  DROP COLUMN IF EXISTS access_level,
  DROP COLUMN IF EXISTS system_status;

-- 1. Types — last, once nothing references them.
DROP TYPE IF EXISTS data_source;
DROP TYPE IF EXISTS teacher_access_level;
DROP TYPE IF EXISTS teacher_system_status;
