-- Reversal of 20260809140000_student_qr_credential, and what it costs.
--
-- Dropping these columns loses every reissue's CURRENT version. The audit rows
-- (`student.card_reissued` / `student.card_revoked`) survive, so the history is
-- still readable — but the live state is not, and re-adding the columns would
-- reset every student to version 1, silently re-validating cards that were
-- revoked because they were LOST. If cards have been reissued in anger, replay
-- the audit log into `qr_version` before trusting any scan.

ALTER TABLE "student_profiles"
  DROP CONSTRAINT IF EXISTS "student_profiles_qr_revoked_reason_present",
  DROP CONSTRAINT IF EXISTS "student_profiles_qr_version_positive";

ALTER TABLE "student_profiles"
  DROP COLUMN IF EXISTS "qr_revoked_reason",
  DROP COLUMN IF EXISTS "qr_revoked_at",
  DROP COLUMN IF EXISTS "qr_issued_at",
  DROP COLUMN IF EXISTS "qr_version";
