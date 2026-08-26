-- =============================================================================
-- SEARCH TEXT — the last two tables a free-text search actually reaches.
--
-- WHY ONLY TWO, when the database has 79 tables. Measured 2026-08-20 rather than
-- guessed: 58 tables carry a candidate free-text column, but only SIX are
-- reached by a free-text search anywhere in the product. Four got `search_text`
-- in 20260820160000; these are the other two.
--
-- The remaining 52 have no code searching them — no Prisma `contains`, no
-- refine `operator: "contains"`, nothing. A generated column there is write cost
-- on every insert and update with no reader on the other side of it, and on
-- `transactions`, `points_ledger`, `wallet_ledger` and `audit_logs` — append-only,
-- money, the highest-volume tables here — it is a cost paid per ledger row
-- forever. The `chatbot_*` tables are descoped product surface and are not
-- touched at all.
--
-- WHAT THIS BUYS, stated precisely so nobody reads more into it. Both call sites
-- were ALREADY EXACT: they are not paginated, so they narrow in SQL and decide
-- in JS, and the JS decision is the same normalized comparison. What changes is
-- the NARROWING — from a loose fragment (`contains 'حمد'`, which also matches
-- «محمد») over an unindexed column, to a tight indexed match on the haystack.
-- On `lookupStudents` that matters: it is the counter search, which runs on
-- every keystroke while somebody is standing at the desk.
--
-- AND THE JS PASS STAYS, on purpose. `lookupStudents` searches a haystack that
-- spans TWO tables — the profile's own name and phone, and the user row's name
-- and phone — and a generated column cannot reference another table. Splitting
-- it into two OR'd columns is NOT the same predicate: a query naming the student
-- by their user-row name and their profile phone matches the joined haystack and
-- would miss the OR. Only JS can join the two, so only JS can decide.
--
-- ── WHAT IS DELIBERATELY ABSENT FROM THE STUDENT HAYSTACK ────────────────────
-- `student_code`, and the guardian columns. Both would WIDEN REACH, which
-- `docs/decisions/global-search.md` rule 1 forbids:
--   · the code is matched through `readStudentScan`, whose check character means
--     a single mistype resolves to NOBODY rather than to a different child. Put
--     it in a substring haystack and six characters of a code would match again,
--     which is the weaker rule the check character exists to replace.
--   · a guardian's email or phone would make a CHILD findable by their parent's
--     contact details. Nothing searches that today and nothing should start
--     because a column made it easy.
-- =============================================================================

-- Searched by: `lookupStudents` (the counter), `teacherStudents`, `searchParent`.
-- `full_name` and `phone` only — exactly the profile columns the free-text
-- branch reads today, and nothing more.
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    edura_search_haystack(coalesce(full_name, '') || ' ' || coalesce(phone, ''))
  ) STORED;

-- Searched by: the palette's `centerRooms`. A small table per centre, included
-- so the rule stays one sentence — every table a free-text search reaches
-- carries `search_text` — rather than one sentence plus a judgement call.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    edura_search_haystack(coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS student_profiles_search_text_trgm
  ON student_profiles USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS rooms_search_text_trgm
  ON rooms USING gin (search_text gin_trgm_ops);
