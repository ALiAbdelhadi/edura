-- C-4 (AUDIT_REPORT.md) / MIGRATION_PLAN_C4.md: close the duplicate-row races on
-- three tables that had nothing in the database to stop a second concurrent
-- transaction inserting the same logical row. Additive only: three indexes, no
-- column added, no row rewritten, no table created.
--
-- Same idiom commission_settings already uses (20260719160000_commission_settings):
--   CREATE UNIQUE INDEX commission_one_global ON commission_settings ((true)) WHERE scope = 'global';
--
-- The two pair indexes are PARTIAL on purpose. A plain UNIQUE (center_id, teacher_id)
-- would make the terminal states unrepeatable -- a teacher removed from a centre could
-- never be re-invited, because the 'removed' row would block the new 'pending' one --
-- which breaks inviteTeacher (server-core/services/center/roster.ts) and
-- acceptCollaborationRequest. The same argument applies to parent_student_links
-- ('rejected' / 'revoked' are history and re-requestable).
--
-- NOT CONCURRENTLY is deliberate: prisma migrate deploy wraps each migration in a
-- transaction block and CONCURRENTLY cannot run inside one. Measured immediately
-- before applying, these tables hold 0-3 rows in every environment, so the SHARE
-- lock is sub-millisecond. Re-decide this if they have grown materially.

-- A. At most ONE live affiliation per (center, teacher).
CREATE UNIQUE INDEX "center_teacher_affiliation_one_live"
  ON "center_teacher_affiliations" ("center_id", "teacher_id")
  WHERE "status" IN ('pending', 'active');

-- B. At most ONE live guardian link per (parent, student).
CREATE UNIQUE INDEX "parent_student_link_one_live"
  ON "parent_student_links" ("parent_id", "student_id")
  WHERE "status" IN ('pending', 'approved');

-- C. wallet_settings is a singleton.
CREATE UNIQUE INDEX "wallet_settings_one_row"
  ON "wallet_settings" ((true));
