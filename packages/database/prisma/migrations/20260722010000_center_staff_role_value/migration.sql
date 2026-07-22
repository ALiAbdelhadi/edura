-- New platform role for center front-desk / manager / center-accountant staff.
-- ISOLATED migration: ADD VALUE on an EXISTING enum must be committed before
-- anything references it (same discipline as 20260719230000_attendance_status_
-- counter_only and 20260720100000_invite_purpose_walk_in). The Postgres type
-- name is "role" (Prisma @@map). center_staff is a lower-privilege principal
-- that acts ON BEHALF OF a center — NOT a co-equal center_admin.
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'center_staff' AFTER 'center_admin';
