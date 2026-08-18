-- Guardian email verification — the two columns that record it.
--
-- Additive and nullable, with NO backfill: every existing student is therefore
-- UNVERIFIED, which is the truth. Nothing is locked by that today — the
-- messaging gate (chat-guardian.ts) still opens on a guardian email being
-- PRESENT, exactly as before this migration. Requiring verification is a
-- separate, deliberate flip: doing it here would lock adult-facing messaging
-- for every minor whose guardian has not yet clicked a link they were never
-- sent.
--
-- WHY TWO COLUMNS AND NOT ONE. A lone `verified_at` keeps saying "verified"
-- after somebody edits the address, so a stamp earned by one inbox would carry
-- over to another nobody confirmed. `guardian_email_verified_value` pins WHICH
-- address was proven; every reader compares it against the current
-- `guardian_email` and treats a mismatch as unverified.

ALTER TABLE "student_profiles"
  ADD COLUMN IF NOT EXISTS "guardian_email_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "guardian_email_verified_value" TEXT;
