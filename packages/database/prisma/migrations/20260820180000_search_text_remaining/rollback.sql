-- Rollback for 20260820180000_search_text_remaining.
-- Revert the APPLICATION first: code filtering `search_text` against a database
-- without it turns the counter search into a 500.
DROP INDEX IF EXISTS rooms_search_text_trgm;
DROP INDEX IF EXISTS student_profiles_search_text_trgm;
ALTER TABLE rooms DROP COLUMN IF EXISTS search_text;
ALTER TABLE student_profiles DROP COLUMN IF EXISTS search_text;
