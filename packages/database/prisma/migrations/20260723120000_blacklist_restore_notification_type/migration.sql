-- H-04 — a lifted blacklist can restore a student into a course that filled up
-- while they were out. The seat was taken from them by a platform action, not
-- given up, so the restore wins over the cap (see blacklist_cascade_actions.
-- reversal = 'restored_over_capacity') — but the owning center/teacher must be
-- TOLD, otherwise a course silently sits over max_students with nobody aware.
--
-- ISOLATED migration: ADD VALUE on an EXISTING enum must be committed before
-- anything references it (same discipline as 20260722010000_center_staff_role_
-- value and 20260720100000_invite_purpose_walk_in). Postgres type name is
-- "notification_type" (Prisma @@map).
ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'enrollment_restored_over_capacity' AFTER 'blacklist_action';
