-- Step 6 (part 2 of 2): attendance modes + check-in stages + typeable student
-- codes. Additive only.

-- A) Global per-teacher attendance mode (approved decision #4).
CREATE TYPE attendance_mode AS ENUM ('counter_only', 'counter_and_door');
ALTER TABLE teacher_profiles
  ADD COLUMN attendance_mode attendance_mode NOT NULL DEFAULT 'counter_only';

-- B) Check-in stages as FACTS on the attendance record; `status` stays the
--    single derived truth the money engine and reports consume.
ALTER TABLE attendance_records ADD COLUMN counter_at timestamptz;
ALTER TABLE attendance_records ADD COLUMN counter_by uuid;
ALTER TABLE attendance_records ADD COLUMN door_at timestamptz;
ALTER TABLE attendance_records ADD COLUMN door_by uuid;

-- C) Human-typeable Student ID for counter entry ("STU-000123"). DB-side
--    default via a function so EVERY creation site (register, temp walk-in,
--    seed, ETL) gets a code with zero app-code involvement; existing rows
--    backfilled here.
CREATE SEQUENCE student_code_seq;
CREATE FUNCTION gen_student_code() RETURNS text
  LANGUAGE sql VOLATILE
  AS $$ SELECT 'STU-' || lpad(nextval('student_code_seq')::text, 6, '0') $$;

ALTER TABLE student_profiles ADD COLUMN student_code text;
UPDATE student_profiles SET student_code = gen_student_code() WHERE student_code IS NULL;
ALTER TABLE student_profiles
  ALTER COLUMN student_code SET NOT NULL,
  ALTER COLUMN student_code SET DEFAULT gen_student_code();
CREATE UNIQUE INDEX student_profiles_student_code_key ON student_profiles (student_code);
