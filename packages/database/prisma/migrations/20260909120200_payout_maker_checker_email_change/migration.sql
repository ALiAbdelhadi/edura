-- SECURITY_AUDIT.md Phase 3, migration 78: M-03 payout maker-checker,
-- M-06 email-change confirmation, L-05 view-as replay guard.
--
-- Prisma cannot model the two partial/expression unique indexes below and
-- `prisma migrate dev` WILL offer to drop them — refuse. c07-security-audit-
-- guards asserts them by definition.

-- ---------------------------------------------------------------------------
-- M-03: "approved" and "paid" are two acts by two people. `external_ref` is the
-- bank/transfer reference the payer types and is unique across payouts, so one
-- transfer can never be recorded as paying two payouts. `generated_by` is who
-- ran the generator, so the approver check can refuse the maker.
-- ---------------------------------------------------------------------------
ALTER TABLE "payouts"
  ADD COLUMN "external_ref" text,
  ADD COLUMN "paid_by"      uuid REFERENCES "users"("id"),
  ADD COLUMN "generated_by" uuid REFERENCES "users"("id");

CREATE UNIQUE INDEX "payouts_external_ref_unique"
  ON "payouts" ("external_ref") WHERE "external_ref" IS NOT NULL;

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'payout_paid';

-- ---------------------------------------------------------------------------
-- M-06: a login-email change is a REQUEST confirmed from the new address.
-- Same shape as password_reset_tokens: 256-bit random token stored hashed,
-- 1 h TTL, single use (confirmed_at).
-- ---------------------------------------------------------------------------
CREATE TABLE "email_change_requests" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "new_email"    text NOT NULL,
  "old_email"    text,
  "token_hash"   text NOT NULL,
  "expires_at"   timestamptz NOT NULL,
  "confirmed_at" timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "email_change_requests_token_hash_key" ON "email_change_requests" ("token_hash");
CREATE INDEX "email_change_requests_user_id_idx" ON "email_change_requests" ("user_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "email_change_requests" TO "edura_app";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- L-05: two concurrent claims of the same 60-second view-as token could both
-- pass the findFirst replay check. The claim's audit row is the replay record;
-- this makes writing it twice impossible, so the second claim fails on insert.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "audit_logs_view_as_jti"
  ON "audit_logs" (("after_state"->>'jti'))
  WHERE "action" = 'user.view_as_claimed';
