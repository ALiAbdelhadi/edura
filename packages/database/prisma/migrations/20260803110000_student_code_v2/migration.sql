-- =============================================================================
-- STUDENT CODE v2 — an eight-character code a student can be handed on a card.
--
-- Replaces `STU-000123`, a bare sequence number, with:
--
--        G 7K3M2Q F      G/A/B = education system, X = not chosen yet
--        │ │      └──── check character
--        │ └─────────── body, unique and one-way
--        └───────────── system letter
--
-- WHY THE CHECK CHARACTER IS THE POINT. Every `STU-` code neighbours another
-- valid one, so a single mistyped digit at the counter resolved to a DIFFERENT
-- CHILD — silently, against attendance and cash. The alphabet here is 31
-- symbols (Crockford minus Z) and 31 is prime, so with weights 1..7 no single
-- wrong character and no swap of two neighbours can produce a valid code.
--
-- WHY THE CODE CARRIES NO PERSONAL DATA. It is printed, scanned and read aloud
-- across a counter, and almost every student on this platform is a minor. See
-- the header of packages/server-core/src/services/students/student-code.ts.
--
-- WHY EXISTING ROWS ARE REWRITTEN RATHER THAN LEFT ALONE. Two formats in one
-- column means every reader carries a branch forever. Doing it now is nearly
-- free — dev holds no students after the 2026-07-31 wipe and production holds
-- no money rows — and it is impossible once cards are printed and receipts are
-- in parents' hands. The rewrite lands them on PENDING codes; the final letter
-- is issued in TypeScript, from the profile id, by
-- `scripts/finalize-student-codes.ts` (idempotent, run right after this).
--
-- `student_code_seq` is deliberately LEFT IN PLACE and unused: dropping it buys
-- nothing and a sequence is the one object a rollback cannot recreate with its
-- old value.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The system letter lives on the CATALOG, not in application code, so a new
--    education system added later needs no deploy. Nullable on purpose: a
--    system without a letter simply cannot finalize codes yet, which is a
--    working state, not a broken one. It may never be 'X' — that value is
--    reserved for "not known yet" and would collide with pending codes.
-- ---------------------------------------------------------------------------
ALTER TABLE education_systems ADD COLUMN code_letter char(1);

UPDATE education_systems SET code_letter = 'G' WHERE code = 'general';
UPDATE education_systems SET code_letter = 'A' WHERE code = 'azhari';
UPDATE education_systems SET code_letter = 'B' WHERE code = 'bacc';

CREATE UNIQUE INDEX education_systems_code_letter_key
  ON education_systems (code_letter);

ALTER TABLE education_systems
  ADD CONSTRAINT education_systems_code_letter_alphabet
  CHECK (code_letter IS NULL OR (code_letter ~ '^[0-9A-HJKMNP-TV-Y]$' AND code_letter <> 'X'));

-- ---------------------------------------------------------------------------
-- 2. The check character. IMMUTABLE and total: it raises rather than returning
--    a wrong answer for input outside the alphabet.
--
--    A TypeScript twin of this function exists (the counter and the card need
--    it too). Two implementations of one rule drift, so they are held together
--    by a proof rather than by hope — see student-code-drift.test.ts, which
--    generates codes here and verifies every one of them there.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION student_code_check_char(head text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXY';
  total int := 0;
  pos int;
  i int;
BEGIN
  IF length(head) <> 7 THEN
    RAISE EXCEPTION 'student_code_check_char expects 7 characters, got %', length(head);
  END IF;
  FOR i IN 1..7 LOOP
    pos := strpos(alphabet, substr(head, i, 1));
    IF pos = 0 THEN
      RAISE EXCEPTION 'student code character out of alphabet: %', substr(head, i, 1);
    END IF;
    total := total + i * (pos - 1);
  END LOOP;
  RETURN substr(alphabet, (total % 31) + 1, 1);
END $$;

-- ---------------------------------------------------------------------------
-- 3. Minting. `gen_student_code()` keeps its name and stays the column DEFAULT,
--    which is what lets every creation path — register, invite claim, walk-in,
--    temp student, manual student, every seed — keep working untouched.
--
--    The body is random rather than derived here because a column DEFAULT
--    cannot see the row's own id. That only affects the PENDING code, which
--    exists between registering and finishing onboarding; the final code is
--    derived from the profile id in TypeScript.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION student_code_for(letter text) RETURNS text
  LANGUAGE plpgsql VOLATILE STRICT AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXY';
  body text;
  head text;
  candidate text;
  i int;
  attempt int;
BEGIN
  FOR attempt IN 1..64 LOOP
    body := '';
    FOR i IN 1..6 LOOP
      body := body || substr(alphabet, floor(random() * 31)::int + 1, 1);
    END LOOP;
    head := upper(letter) || body;
    candidate := head || student_code_check_char(head);
    PERFORM 1 FROM student_profiles WHERE student_code = candidate;
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'could not mint a unique student code after 64 attempts';
END $$;

CREATE OR REPLACE FUNCTION gen_student_code() RETURNS text
  LANGUAGE sql VOLATILE
  AS $$ SELECT student_code_for('X') $$;

-- ---------------------------------------------------------------------------
-- 4. Rewrite the legacy rows. Volatile function, so each row draws its own.
-- ---------------------------------------------------------------------------
UPDATE student_profiles SET student_code = gen_student_code()
WHERE student_code LIKE 'STU-%';

-- ---------------------------------------------------------------------------
-- 5. Validity is now an invariant the database itself holds — the alphabet AND
--    the check character. No writer (service, seed, script, raw SQL) can put a
--    code in this column that the counter would then fail to verify.
-- ---------------------------------------------------------------------------
ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_student_code_shape
  CHECK (
    student_code ~ '^[0-9A-HJKMNP-TV-Y]{8}$'
    AND substr(student_code, 8, 1) = student_code_check_char(substr(student_code, 1, 7))
  );
