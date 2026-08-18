-- =============================================================================
-- COURSE SETTLEMENT BASIS — additive only.
--
-- What one lesson is WORTH, made explicit per course instead of inferred.
--
-- A course can carry two prices that both mean something real: `price` (the
-- legacy full-course figure, amortised across the planned schedule) and
-- `price_per_session` (the drop-in pass). On dev, 13 of the 14 courses holding
-- both DISAGREE, often by 2-3x — and until now the settlement engine silently
-- picked one of them while the back office's own preview quoted the other. This
-- column moves that choice out of the code and onto the course, so the number a
-- confirm button shows is a decision someone made rather than an accident of
-- which function read the row.
--
--   course_price  — price / planned sessions.  The behaviour of every existing
--                   course, which is why it is the DEFAULT: this migration
--                   changes the settled value of nothing.
--   session_price — price_per_session, the value of one lesson by definition.
--   subscription  — each PRESENT student settles at what THEIR OWN coverage
--                   paid for this lesson (a single-session pass at its price; a
--                   monthly plan at its price divided by the lessons its period
--                   actually contains). The only basis that can never
--                   distribute money the platform did not collect.
--
-- NOTHING here changes an existing row's meaning: the column is NOT NULL with a
-- DEFAULT describing the world before this feature, so existing data, queries
-- and writes are untouched and the migration is backward compatible.
--
-- ROLLBACK: see rollback.sql beside this file.
-- =============================================================================

-- 1. The type is BRAND NEW, so creating it and using it as a column type in the
--    SAME transaction is safe. (The rule that forbids this applies to ADDING A
--    VALUE to an existing enum, which Postgres cannot use until it commits.)
CREATE TYPE "settlement_basis" AS ENUM ('course_price', 'session_price', 'subscription');

-- 2. DEFAULT 'course_price' is load-bearing, not a formality: it is exactly what
--    `resolveLessonPrice` did before this column existed, so every course
--    already in the database keeps settling at the same figure it would have
--    settled at yesterday. Backfilling anything else here would silently
--    re-rate live courses, which M4.5 forbids.
ALTER TABLE "courses"
  ADD COLUMN "settlement_basis" "settlement_basis" NOT NULL DEFAULT 'course_price';

COMMENT ON COLUMN "courses"."settlement_basis" IS
  'What one lesson is worth: course_price = price/planned sessions (default, the pre-existing behaviour); session_price = price_per_session; subscription = each present student at their own coverage''s per-lesson value.';
