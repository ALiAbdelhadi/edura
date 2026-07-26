-- Guardian contact channel (child safety, approved 2026-07-25).
--
-- Purely additive: five nullable columns + one index. No backfill, so every
-- existing student starts with NO guardian email — which, combined with the
-- DEFAULT-MINOR rule, means adult-facing messaging is locked for them until an
-- email is supplied OR they already have an APPROVED parent link carrying one.
-- That is the intended failure direction on a K-12 platform, not a regression.

ALTER TABLE "student_profiles"
  ADD COLUMN IF NOT EXISTS "guardian_email"          text,
  ADD COLUMN IF NOT EXISTS "guardian_phone"          text,
  ADD COLUMN IF NOT EXISTS "guardian_email_added_at" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "guardian_email_added_by" uuid,
  ADD COLUMN IF NOT EXISTS "guardian_contact_due_at" timestamptz(6);

-- Drives the reminder-escalation sweep (cron), which scans by deadline.
CREATE INDEX IF NOT EXISTS "student_profiles_guardian_contact_due_at_idx"
  ON "student_profiles" ("guardian_contact_due_at");
