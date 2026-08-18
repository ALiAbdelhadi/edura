-- Per-lesson ratings: make the promise in the schema actually reachable.
--
-- THE BUG THIS FIXES. `reviews.lesson_id` has carried the comment "for
-- per-lesson ratings (PRD)" since the init migration, while the table also
-- carried UNIQUE (student_id, teacher_id). Those two cannot both hold: the
-- constraint allows a student EXACTLY ONE review per teacher for all time, so
-- the second per-lesson rating is a P2002 no matter which lesson it is about.
-- The column was unreachable by construction, and nothing ever wrote it.
--
-- WHY TWO PARTIAL INDEXES AND NOT UNIQUE (student_id, teacher_id, lesson_id).
-- In Postgres, NULLs are distinct in a unique index, so a three-column unique
-- would silently permit UNLIMITED overall (lesson_id IS NULL) reviews of the
-- same teacher by the same student — it would fix the per-lesson case by
-- breaking the one rule the old constraint got right. Splitting on the
-- NULL-ness of lesson_id keeps both rules, each stated explicitly:
--
--   reviews_one_overall_per_teacher : one standing review per (student, teacher)
--   reviews_one_per_lesson          : one rating per (student, lesson)
--
-- The per-lesson index is keyed on (student_id, lesson_id) and NOT on the
-- teacher: a lesson has exactly one teacher, so adding teacher_id would let
-- the same lesson be rated twice by passing a different teacher_id, which is
-- the same class of hole the old constraint had.
--
-- This is the partial-unique pattern the repo already uses for
-- commission_one_per_center / commission_one_per_teacher and for the
-- one-refund-per-payment guard.
--
-- BACKFILL SAFETY: every existing row has lesson_id IS NULL (nothing has ever
-- written the column), so every existing row lands in the overall index under
-- exactly the key the dropped constraint enforced. No row can collide and no
-- data is rewritten.

DROP INDEX IF EXISTS "reviews_student_id_teacher_id_key";

CREATE UNIQUE INDEX "reviews_one_overall_per_teacher"
  ON "reviews" ("student_id", "teacher_id")
  WHERE "lesson_id" IS NULL;

CREATE UNIQUE INDEX "reviews_one_per_lesson"
  ON "reviews" ("student_id", "lesson_id")
  WHERE "lesson_id" IS NOT NULL;

-- The per-lesson read path ("show me the ratings for this lesson").
CREATE INDEX IF NOT EXISTS "reviews_lesson_id_idx" ON "reviews" ("lesson_id");
