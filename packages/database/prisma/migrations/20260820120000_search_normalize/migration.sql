-- =============================================================================
-- ARABIC SEARCH NORMALIZATION, INSIDE POSTGRES
--
-- WHY THIS EXISTS. `ILIKE` folds ASCII case and nothing else. Measured on dev
-- before any of this work (2026-08-19):
--
--     stored «أحمد» (3 rows)   typed «احمد»    -> 0 rows
--     stored «فريدة»           typed «فريده»   -> 0 rows
--     stored «كنزي»            typed «كنزى»    -> 0 rows
--
-- An Egyptian typist omits the hamza (Shift on the standard layout), writes ة
-- and ه interchangeably, and does the same with ى and ي. Every one of those
-- returned an empty list from a search that was working perfectly.
--
-- The application fixed this on 2026-08-20 with a two-stage match: NARROW in
-- SQL on the byte-comparable fragments of the query, then DECIDE in JS with
-- `@repo/database/search-text`. That is exact wherever the caller can slice its
-- own result — but a PAGINATED list cannot: a filter applied after the page is
-- cut returns a short page and a wrong total. Those lists were therefore left
-- returning a SUPERSET («احمد» also lists «محمد»).
--
-- This migration is what makes them exact. `edura_search_normalize` is the same
-- normalizer, in SQL, so the comparison can happen INSIDE the query — indexed,
-- countable, and paginable.
--
-- ── THE ONE PROPERTY THAT MATTERS ────────────────────────────────────────────
-- This function and `packages/database/src/search-text.ts` must produce
-- BYTE-IDENTICAL output. Two normalizers that disagree are two search engines,
-- and the reader would learn one rule on the palette and a different one on the
-- list below it. It is not assumed: `apps/erp/tests/db/search-normalize.test.ts`
-- runs BOTH over every distinct value in every searchable column on the live
-- database and fails on the first disagreement.
--
-- ADDITIVE ONLY. No table, column, constraint or row is touched. It creates one
-- extension, one function and five indexes. Dropping all of them returns the
-- database to its previous state exactly — see rollback.sql.
-- =============================================================================

-- 1. pg_trgm -----------------------------------------------------------------
-- Needed for GIN trigram indexes, which are the only kind that can serve a
-- LIKE '%…%' — and a substring match is what a search box is. Without it the
-- normalized comparison would work and then sequentially scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. The normalizer ----------------------------------------------------------
-- IMMUTABLE is required (an expression index cannot be built on anything less)
-- and is TRUE: the result depends only on the argument. Every builtin it calls
-- is itself immutable — `normalize` reports provolatile = 'i' on PG 13+, and
-- `translate` / `regexp_replace` / `lower` / `btrim` are immutable under a
-- fixed collation. STRICT so NULL in gives NULL out rather than an empty
-- string, which keeps `WHERE f(col) LIKE …` false for a NULL column instead of
-- accidentally true. PARALLEL SAFE because it touches nothing outside itself.
CREATE OR REPLACE FUNCTION edura_search_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        -- (f) Latin diacritics: NFD splits é into e + U+0301 and the combining
        --     mark goes. Arabic is untouched here, its own marks having been
        --     stripped in step (b).
        regexp_replace(
          normalize(
            -- (e) Anything that is not a letter or a digit becomes a SPACE, not
            --     nothing. `RCP-NILE-2026-4` and `RCP NILE 2026 4` then produce
            --     the same words and each finds the other; deleting instead
            --     would have glued `RCPNILE20264` together, which matches
            --     neither way a human writes a receipt number down.
            regexp_replace(
              -- (d) Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits
              --     fold to ASCII. Not cosmetic: a phone number typed on an
              --     Arabic keypad is unfindable without it.
              translate(
                -- (c) The letter folds. Shapes Egyptian typists use for one
                --     another, mapped onto one canonical form: the four hamza'd
                --     alefs onto ا, ة onto ه, ى onto ي, the hamza carriers, and
                --     the Persian/Urdu shapes a mis-set phone keyboard emits.
                --     ء is last in the FROM list with no counterpart, so it is
                --     deleted rather than mapped.
                translate(
                  -- (b) Marks that vanish: tashkeel, madda/hamza above and
                  --     below, the dagger alef, Quranic annotation, the tatweel
                  --     (a typographic stretch, never a letter), and the
                  --     invisible bidi/joiner controls a copy-paste out of a PDF
                  --     or a WhatsApp message drags along.
                  regexp_replace(
                    -- (a) NFKC first: it resolves the Arabic presentation forms
                    --     (ﻻ, ﺍ) a PDF paste carries and the full-width Latin a
                    --     phone keyboard can emit.
                    normalize(input, NFKC),
                    '[ً-ْٓ-ٰٕۖ-ۭـ​-‏‪-‮⁦-⁩؜﻿]',
                    '',
                    'g'
                  ),
                  'أإآٱةىؤئکیھء',
                  'ااااهيويكيه'
                ),
                '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
                '01234567890123456789'
              ),
              '[^[:alnum:]]',
              ' ',
              'g'
            ),
            NFD
          ),
          '[̀-ͯ]',
          '',
          'g'
        )
      ),
      ' +',
      ' ',
      'g'
    )
  );
$$;

COMMENT ON FUNCTION edura_search_normalize(text) IS
  'Canonical form of a string for searching. MUST stay byte-identical to packages/database/src/search-text.ts:normalizeSearchText — proven by apps/erp/tests/db/search-normalize.test.ts.';

-- The runtime role is NOBYPASSRLS and owns nothing; it needs EXECUTE to use the
-- function in a WHERE clause. Guarded the way every grant in this repo is, so a
-- database without the role still applies cleanly.
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT EXECUTE ON FUNCTION edura_search_normalize(text) TO "edura_app";
  END IF;
END
$grant$;

-- 3. The indexes -------------------------------------------------------------
-- GIN + gin_trgm_ops on the NORMALIZED expression: the query compares
-- `edura_search_normalize(col) LIKE '%…%'`, so the index has to be on exactly
-- that expression or it cannot be used.
--
-- Five columns, not every searchable one. Each is a free-text column on a
-- PAGINATED list that a human searches by name; the ASCII-only columns
-- (gateway references, `idempotency_key`, `providerMessageId`) are deliberately
-- absent — ILIKE already served them and a trigram index there would be write
-- cost for nothing.
--
-- NOT CONCURRENTLY: prisma runs each migration inside one transaction, and
-- CREATE INDEX CONCURRENTLY cannot run in one. These tables are small today
-- (dev: 232 users, 63 centers, 55 courses; production: fewer). If this is ever
-- applied to a large production table, build them by hand with CONCURRENTLY
-- first and let `IF NOT EXISTS` make this migration a no-op.
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
