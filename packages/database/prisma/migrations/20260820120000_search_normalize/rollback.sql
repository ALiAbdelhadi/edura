-- Rollback for 20260820120000_search_normalize.
--
-- The migration is purely additive — one extension, one function, five indexes,
-- and no table, column, constraint or row touched — so this returns the
-- database exactly to its previous state.
--
-- ORDER MATTERS: the indexes depend on the function, and the function depends
-- on nothing. `pg_trgm` is dropped LAST and only if nothing else uses it; if
-- another index anywhere uses gin_trgm_ops the DROP will refuse, which is the
-- correct outcome — comment that line out rather than forcing it.
--
-- Any application code calling `edura_search_normalize` must be reverted FIRST.
-- Dropping the function under running code turns every search into a 500.

DROP INDEX IF EXISTS contact_submissions_subject_search_trgm;
DROP INDEX IF EXISTS contact_submissions_name_search_trgm;
DROP INDEX IF EXISTS courses_title_search_trgm;
DROP INDEX IF EXISTS centers_name_search_trgm;
DROP INDEX IF EXISTS users_name_search_trgm;

DROP FUNCTION IF EXISTS edura_search_normalize(text);

-- DROP EXTENSION IF EXISTS pg_trgm;
