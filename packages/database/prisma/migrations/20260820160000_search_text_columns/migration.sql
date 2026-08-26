-- =============================================================================
-- SEARCH TEXT COLUMNS — making the paginated lists EXACT.
--
-- WHY. `20260820120000_search_normalize` put the normalizer in the database, but
-- Prisma cannot express `WHERE f(col) LIKE …` in a typed `where`, so the
-- paginated list screens still could not use it. They were left NARROWING only:
-- a search for «احمد» also listed «محمد», because the pre-filter compares the
-- byte-comparable fragments of a query and the exact decision was made in JS —
-- which a paginated query cannot do, since filtering after the page is cut
-- returns a short page and a wrong total.
--
-- A STORED GENERATED COLUMN is the way out that costs no second source of truth:
-- Postgres maintains it, Prisma filters it with a plain `contains`, and the
-- result is exact, indexed, paginable AND countable.
--
-- ── ONE COLUMN PER TABLE, NOT ONE PER FIELD ──────────────────────────────────
-- Fourteen columns would have been the literal translation of what the lists
-- search. One per table, holding every searchable field of that row joined, is
-- the same thing and is exactly what the JS matcher already does:
-- `matchesSearchTerms` joins the parts, normalizes once, and requires EVERY term
-- to appear. `search_text` is that haystack, precomputed.
--
-- ── AND IT CARRIES BOTH OF THE JS MATCHER'S CHANCES ──────────────────────────
-- `matchesSearchTerms` tries the normalized haystack AND the same haystack with
-- its spaces closed up, so «عبدالرحمن» finds «عبد الرحمن» — one Egyptian name
-- written two ways. `edura_search_haystack` stores both halves in the one
-- column, so `search_text LIKE '%term%'` is TRUE in exactly the cases the JS
-- matcher returns true. That equivalence is the point of this design, and
-- `apps/erp/tests/db/search-normalize.test.ts` asserts it row by row.
--
-- ── THE HAZARD, STATED PLAINLY ───────────────────────────────────────────────
-- A STORED generated column is computed on write. `CREATE OR REPLACE FUNCTION`
-- on `edura_search_normalize` with a different body would NOT recompute the
-- rows already stored, and the database would then hold two definitions of the
-- same word with nothing to say so. So: CHANGING THE NORMALIZER REQUIRES
-- REBUILDING THESE COLUMNS. The DB suite compares every stored value against a
-- live call, which turns that from a silent divergence into a red test.
--
-- ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
-- No table's existing columns, constraints, defaults or rows are touched. The
-- five expression indexes from the previous migration are DROPPED because the
-- queries they served no longer exist — the app filters the column now, and an
-- index nothing can use is write cost with no reader. `rollback.sql` restores
-- them.
-- =============================================================================

-- 1. The haystack helper --------------------------------------------------
-- Separate from `edura_search_normalize` because it answers a different
-- question: that one gives THE canonical form of a string, this one gives the
-- form a ROW is searched by. Keeping them apart means the normalizer stays the
-- single definition of "the same word" and this stays the single definition of
-- "what a row is findable by".
--
-- IMMUTABLE is a requirement, not a label: a generated column cannot be built on
-- anything less. It is honestly true — every call inside is immutable.
CREATE OR REPLACE FUNCTION edura_search_haystack(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT n || ' ' || replace(n, ' ', '')
  FROM (SELECT edura_search_normalize(input) AS n) AS t;
$$;

COMMENT ON FUNCTION edura_search_haystack(text) IS
  'The form a ROW is searched by: its normalized text, plus the same text with spaces closed up so a compound name written either way matches. Mirrors matchesSearchTerms in packages/database/src/search-text.ts — proven by apps/erp/tests/db/search-normalize.test.ts.';

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT EXECUTE ON FUNCTION edura_search_haystack(text) TO "edura_app";
  END IF;
END
$grant$;

-- 2. The columns ----------------------------------------------------------
-- Each lists exactly the fields its own list screen searches today, in the same
-- order the service joins them. `coalesce` because a nullable field must
-- contribute an empty string rather than turning the whole haystack NULL.

-- Searched by: apps/superadmin listUsers + platform.ts teachers,
-- apps/erp discovery.searchTeachers.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    edura_search_haystack(
      coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '')
    )
  ) STORED;

-- Searched by: apps/erp discovery.searchCenters. `short_id` is in because it is
-- what a centre is referred to by over the phone.
ALTER TABLE centers
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    edura_search_haystack(
      coalesce(name, '') || ' ' || coalesce(short_id, '') || ' ' ||
      coalesce(area, '') || ' ' || coalesce(governorate, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED;

-- Searched by: apps/erp discovery.searchCourses.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    edura_search_haystack(
      coalesce(title, '') || ' ' || coalesce(subject, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED;

-- Searched by: apps/superadmin listContactSubmissions. The one list in the
-- product whose text is written IN ARABIC by the public, straight off the
-- marketing site — which is why it was the most certain to be broken.
ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    edura_search_haystack(
      coalesce(name, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(phone, '') || ' ' || coalesce(subject, '') || ' ' ||
      coalesce(message, '')
    )
  ) STORED;

-- 3. The indexes ----------------------------------------------------------
-- GIN + gin_trgm_ops, because the query is `search_text LIKE '%…%'` and a
-- trigram index is the only kind that serves a leading wildcard.
--
-- NOT CONCURRENTLY: prisma runs each migration inside one transaction and
-- CREATE INDEX CONCURRENTLY cannot run in one. Measured before applying —
-- dev 257/71/62/0 rows, production 9/2/1/0 — so these build instantly. On a
-- large table, build them by hand with CONCURRENTLY first and let
-- `IF NOT EXISTS` make this a no-op.
CREATE INDEX IF NOT EXISTS users_search_text_trgm
  ON users USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS centers_search_text_trgm
  ON centers USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS courses_search_text_trgm
  ON courses USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_submissions_search_text_trgm
  ON contact_submissions USING gin (search_text gin_trgm_ops);

-- 4. Retire the expression indexes ----------------------------------------
-- They served `edura_search_normalize(col) LIKE …`, a query the application no
-- longer issues: it filters `search_text` instead. An index no reader can use
-- is write cost with nothing on the other side of it.
DROP INDEX IF EXISTS users_name_search_trgm;
DROP INDEX IF EXISTS centers_name_search_trgm;
DROP INDEX IF EXISTS courses_title_search_trgm;
DROP INDEX IF EXISTS contact_submissions_name_search_trgm;
DROP INDEX IF EXISTS contact_submissions_subject_search_trgm;
