-- =============================================================================
-- OFF-SYSTEM ("EXTERNAL") TEACHERS — additive only.
--
-- A center runs on the platform while one or more of its teachers refuses to
-- (or keeps their own system). The center still needs a 100% complete picture
-- of those students, lessons and money, so its staff key those records in by
-- hand. This migration adds:
--
--   1. teacher_profiles.system_status  — enrolled (default) | external
--      + access_level, managed_by_center_id, data_source
--   2. data_source on every table a human can now write into by hand
--   3. student_profiles.national_id    — the second manual-entry DEDUP key
--   4. teacher_system_status_changes   — append-only conversion journal
--   5. external_teacher_settlements    — append-only center<->teacher statement
--
-- NOTHING here changes the meaning of an existing row: every new column is
-- NOT NULL DEFAULT with the value that describes the world before this feature
-- (`enrolled`, `full`, `system`), so existing data, queries and writes are
-- untouched and the whole migration is backward compatible.
--
-- ROLLBACK: see rollback.sql beside this file.
-- =============================================================================

-- 1. Enums ---------------------------------------------------------------
-- All three types are BRAND NEW, so creating them and using them as a column
-- default in the same transaction is safe. (The "one enum value per migration"
-- rule applies to ALTER TYPE ... ADD VALUE on an EXISTING type, which this is
-- not — no existing enum is touched here.)

CREATE TYPE teacher_system_status AS ENUM ('enrolled', 'external');
CREATE TYPE teacher_access_level AS ENUM ('full', 'read_only');
CREATE TYPE data_source AS ENUM ('system', 'manual');

-- 2. teacher_profiles ----------------------------------------------------

ALTER TABLE teacher_profiles
  ADD COLUMN system_status        teacher_system_status NOT NULL DEFAULT 'enrolled',
  ADD COLUMN access_level         teacher_access_level  NOT NULL DEFAULT 'full',
  ADD COLUMN managed_by_center_id uuid,
  ADD COLUMN data_source          data_source           NOT NULL DEFAULT 'system';

-- An off-system teacher with nobody responsible for their records is exactly
-- the orphan this feature exists to prevent, so the link is REQUIRED for them
-- and optional for everyone else. Kept after a conversion to `enrolled` — it is
-- the historical fact of who entered those records.
ALTER TABLE teacher_profiles
  ADD CONSTRAINT teacher_external_needs_center
  CHECK (system_status <> 'external' OR managed_by_center_id IS NOT NULL);

ALTER TABLE teacher_profiles
  ADD CONSTRAINT teacher_profiles_managed_by_center_id_fkey
  FOREIGN KEY (managed_by_center_id) REFERENCES centers(id) ON DELETE RESTRICT;

CREATE INDEX teacher_profiles_system_status_idx
  ON teacher_profiles (system_status);
-- The center's "my off-system teachers" list, which is the hot path.
CREATE INDEX teacher_profiles_managed_by_center_idx
  ON teacher_profiles (managed_by_center_id);

-- 3. student_profiles.national_id — manual-entry dedup key ----------------
--
-- When staff type a student in by hand the same child is very likely already on
-- the platform (with an enrolled teacher, or another center). The dedup keys
-- are users.phone (already globally UNIQUE) and this column. NULLABLE + UNIQUE:
-- Postgres allows many NULLs in a unique index, so students with no national ID
-- on file are unaffected, while two rows can never claim the same one.
ALTER TABLE student_profiles ADD COLUMN national_id text;
CREATE UNIQUE INDEX student_profiles_national_id_key
  ON student_profiles (national_id);

-- 4. data_source provenance ----------------------------------------------
--
-- Every table a center staff member can now write into on behalf of an
-- off-system teacher. DEFAULT 'system' means: every existing row keeps saying
-- exactly what it always meant, and every existing INSERT keeps compiling and
-- keeps writing the same value it implied before.

ALTER TABLE courses                    ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE sessions                   ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE enrollments                ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE attendance_records         ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE grades                     ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE payments                   ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE transactions               ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE subscriptions              ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE center_student_rosters     ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';
ALTER TABLE center_teacher_affiliations ADD COLUMN data_source data_source NOT NULL DEFAULT 'system';

-- PARTIAL indexes, deliberately. A plain index on data_source would be almost
-- entirely one value ('system') and the planner would ignore it; the query the
-- UI actually runs is "show me the manually-entered rows for THIS center", so
-- the index covers exactly that and stays small forever.
CREATE INDEX courses_manual_idx
  ON courses (center_id, created_at DESC) WHERE data_source = 'manual';
CREATE INDEX enrollments_manual_idx
  ON enrollments (center_id, enrolled_at DESC) WHERE data_source = 'manual';
CREATE INDEX attendance_records_manual_idx
  ON attendance_records (center_id, created_at DESC) WHERE data_source = 'manual';
CREATE INDEX payments_manual_idx
  ON payments (center_id, paid_at DESC) WHERE data_source = 'manual';
CREATE INDEX transactions_manual_idx
  ON transactions (center_id, created_at DESC) WHERE data_source = 'manual';
CREATE INDEX subscriptions_manual_idx
  ON subscriptions (center_id, created_at DESC) WHERE data_source = 'manual';
CREATE INDEX sessions_manual_idx
  ON sessions (course_id, date DESC) WHERE data_source = 'manual';
CREATE INDEX grades_manual_idx
  ON grades (center_id, date DESC) WHERE data_source = 'manual';

-- 5. teacher_system_status_changes — the conversion journal ---------------
--
-- Converting external <-> enrolled moves NO data: the teacher's users.id never
-- changes, so every course, session, attendance row, payment and ledger entry
-- stays attached exactly where it was. This table is therefore not a migration
-- log — it is the EVIDENCE of that. Each row freezes the record counts observed
-- inside the SAME transaction as the flip, so "nothing was lost" is something
-- anyone can re-check later rather than a promise.

CREATE TABLE teacher_system_status_changes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  center_id      uuid NOT NULL REFERENCES centers(id) ON DELETE RESTRICT, -- RLS tenant key
  from_status    teacher_system_status NOT NULL,
  to_status      teacher_system_status NOT NULL,
  reason         text NOT NULL,
  records_before jsonb NOT NULL,
  actor_id       uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- A "change" that changes nothing is a bug, not a record.
  CONSTRAINT teacher_status_change_actually_changes CHECK (from_status <> to_status)
);

CREATE INDEX teacher_system_status_changes_teacher_idx
  ON teacher_system_status_changes (teacher_id, created_at DESC);
CREATE INDEX teacher_system_status_changes_center_idx
  ON teacher_system_status_changes (center_id, created_at DESC);

ALTER TABLE teacher_system_status_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_system_status_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teacher_system_status_changes
  USING (rls_bypass() OR center_id = current_center_id())
  WITH CHECK (rls_bypass() OR center_id = current_center_id());

-- 6. external_teacher_settlements — the cash statement --------------------
--
-- An external teacher cannot request a payout (they have no account), so the
-- CENTER hands them cash and records it here. The money still moves through the
-- ONE engine: the teacher's accrued teacher_profiles.wallet_balance is debited
-- with the same H2 conditional decrement every payout uses, and a `payout`
-- Transaction is written in the same DB transaction. This table is the
-- queryable statement beside that — deliberately NOT the source of truth.
--
-- The period figures are a SNAPSHOT of what the statement said at settlement
-- time, so a later attendance edit cannot silently rewrite history. They are
-- NOT constrained to sum to gross_collected: money collected for a session that
-- has not been completed yet is legitimately collected-but-undistributed, and a
-- conservation CHECK would reject that honest state.

CREATE TABLE external_teacher_settlements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id          uuid NOT NULL REFERENCES centers(id) ON DELETE RESTRICT, -- RLS tenant key
  teacher_id         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  period_start       timestamptz NOT NULL,
  period_end         timestamptz NOT NULL,
  gross_collected    integer NOT NULL CHECK (gross_collected    >= 0),
  center_share_total integer NOT NULL CHECK (center_share_total >= 0),
  platform_fee_total integer NOT NULL CHECK (platform_fee_total >= 0),
  teacher_accrued    integer NOT NULL CHECK (teacher_accrued    >= 0),
  amount_paid        integer NOT NULL CHECK (amount_paid        >  0),
  payment_method     payment_method NOT NULL DEFAULT 'cash',
  txn_ref            text,
  note               text,
  settled_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_settlement_period_ordered CHECK (period_end > period_start)
);

CREATE INDEX external_teacher_settlements_center_idx
  ON external_teacher_settlements (center_id, created_at DESC);
CREATE INDEX external_teacher_settlements_teacher_idx
  ON external_teacher_settlements (teacher_id, created_at DESC);

ALTER TABLE external_teacher_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_teacher_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON external_teacher_settlements
  USING (rls_bypass() OR center_id = current_center_id())
  WITH CHECK (rls_bypass() OR center_id = current_center_id());

-- 7. Grants — append-only for the runtime role ----------------------------
--
-- Both tables are history. Corrections to the MONEY live in the transactions
-- ledger as reversal entries (they always have); a settlement statement that
-- could be edited afterwards would be worth nothing as evidence, and a
-- conversion journal that could be edited would defeat its only purpose. Same
-- recipe as session_settlements; mirrored at runtime by the Prisma immutability
-- extension (IMMUTABLE_MODELS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT ON teacher_system_status_changes TO "edura_app";
    REVOKE UPDATE, DELETE ON teacher_system_status_changes FROM "edura_app";

    GRANT SELECT, INSERT ON external_teacher_settlements TO "edura_app";
    REVOKE UPDATE, DELETE ON external_teacher_settlements FROM "edura_app";
  END IF;
END $$;
