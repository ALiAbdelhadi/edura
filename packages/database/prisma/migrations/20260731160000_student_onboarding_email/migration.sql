-- Student welcome/onboarding email idempotency stamp (approved 2026-07-31).
-- Nullable, no backfill: existing students simply never received one, and the
-- sender's atomic claim (UPDATE ... WHERE onboarding_email_sent_at IS NULL)
-- is what guarantees exactly-once sending for new sign-ups.
ALTER TABLE "student_profiles" ADD COLUMN "onboarding_email_sent_at" TIMESTAMPTZ(6);
