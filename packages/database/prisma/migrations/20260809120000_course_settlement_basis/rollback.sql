-- =============================================================================
-- ROLLBACK for 20260809120000_course_settlement_basis.
--
-- Prisma Migrate has no `down` step, so this file is the reversal, kept beside
-- its migration and run by hand:
--
--   psql "$ADMIN_URL" -f rollback.sql
--   DELETE FROM _prisma_migrations WHERE migration_name = '20260809120000_course_settlement_basis';
--
-- Then check out the schema.prisma from before the migration and regenerate.
--
-- WHAT IT COSTS — stated plainly, because a rollback that pretends to be free
-- is how data disappears:
--   * Dropping the column DISCARDS every per-course choice an operator made.
--     Courses set to `session_price` or `subscription` silently revert to
--     `course_price`, which for a course carrying both prices is a DIFFERENT
--     settled amount per lesson — 2-3x on real data. Lessons already settled
--     are untouched (the ledger is append-only and never re-rated), so the loss
--     is forward-looking: the next lesson settles on the old rule without
--     anyone being told.
--   * Write the choices down before running this if you intend to restore them:
--       SELECT id, title, settlement_basis FROM courses
--        WHERE settlement_basis <> 'course_price';
-- =============================================================================

ALTER TABLE "courses" DROP COLUMN IF EXISTS "settlement_basis";
DROP TYPE IF EXISTS "settlement_basis";
