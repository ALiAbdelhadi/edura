-- =============================================================================
-- ROLLBACK for 20260803110000_student_code_v2.
--
-- Prisma Migrate has no `down` step, so this file is the reversal, kept beside
-- its migration and run by hand:
--
--   psql "$ADMIN_URL" -f rollback.sql
--   DELETE FROM _prisma_migrations WHERE migration_name = '20260803110000_student_code_v2';
--
-- Then check out the schema.prisma from before the migration and regenerate.
--
-- WHAT IT COSTS — stated plainly, because a rollback that pretends to be free
-- is how data disappears:
--
--   * EVERY STUDENT'S CODE CHANGES AGAIN. The v1 codes were sequence numbers
--     and the sequence has moved on, so this file CANNOT restore the codes
--     that existed before the migration — it can only mint fresh `STU-` ones.
--     Any card printed, any code written on paper at a counter, any code a
--     parent was told over the phone, stops resolving. Dump the mapping first
--     if the environment has any students, so a human can look one up:
--         \copy (SELECT id, user_id, full_name, student_code FROM student_profiles)
--               TO 'student_codes_v2.csv' CSV HEADER
--
--   * THE CHECK CHARACTER GOES AWAY. Back to v1 behaviour, where one mistyped
--     character at the counter resolves to a different child instead of failing.
--     That is the defect this migration existed to close; reverting reopens it.
--
--   * The system letter on the catalog is dropped. Nothing else reads it, so
--     this part is genuinely free.
--
-- WHAT IT DOES NOT TOUCH: no student, enrollment, attendance, payment or ledger
-- row is deleted or re-pointed. Only the `student_code` text and the catalog
-- column added above.
-- =============================================================================

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_student_code_shape;

-- Restore the v1 generator. `student_code_seq` was never dropped, so it is
-- still here — it simply resumes from where it stopped.
CREATE OR REPLACE FUNCTION gen_student_code() RETURNS text
  LANGUAGE sql VOLATILE
  AS $$ SELECT 'STU-' || lpad(nextval('student_code_seq')::text, 6, '0') $$;

UPDATE student_profiles SET student_code = gen_student_code()
WHERE student_code !~ '^STU-';

DROP FUNCTION IF EXISTS student_code_for(text);
DROP FUNCTION IF EXISTS student_code_check_char(text);

ALTER TABLE education_systems DROP CONSTRAINT IF EXISTS education_systems_code_letter_alphabet;
DROP INDEX IF EXISTS education_systems_code_letter_key;
ALTER TABLE education_systems DROP COLUMN IF EXISTS code_letter;
