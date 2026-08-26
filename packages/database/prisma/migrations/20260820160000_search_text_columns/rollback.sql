-- Rollback for 20260820160000_search_text_columns.
--
-- Revert the APPLICATION first. Code filtering `search_text` against a database
-- without it turns every list search into a 500.
--
-- Order matters: the indexes depend on the columns, the columns depend on
-- `edura_search_haystack`, and that depends on `edura_search_normalize` — which
-- this file does NOT drop, because the previous migration owns it.

DROP INDEX IF EXISTS contact_submissions_search_text_trgm;
DROP INDEX IF EXISTS courses_search_text_trgm;
DROP INDEX IF EXISTS centers_search_text_trgm;
DROP INDEX IF EXISTS users_search_text_trgm;

ALTER TABLE contact_submissions DROP COLUMN IF EXISTS search_text;
ALTER TABLE courses DROP COLUMN IF EXISTS search_text;
ALTER TABLE centers DROP COLUMN IF EXISTS search_text;
ALTER TABLE users DROP COLUMN IF EXISTS search_text;

DROP FUNCTION IF EXISTS edura_search_haystack(text);

-- Restore the expression indexes the migration retired.
CREATE INDEX IF NOT EXISTS users_name_search_trgm
  ON users USING gin (edura_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS centers_name_search_trgm
  ON centers USING gin (edura_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS courses_title_search_trgm
  ON courses USING gin (edura_search_normalize(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_submissions_name_search_trgm
  ON contact_submissions USING gin (edura_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_submissions_subject_search_trgm
  ON contact_submissions USING gin (edura_search_normalize(subject) gin_trgm_ops);
