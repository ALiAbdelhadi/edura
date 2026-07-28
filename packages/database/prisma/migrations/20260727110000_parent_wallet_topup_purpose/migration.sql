-- Parent wallet — new payment-intent purpose.
--
-- OWN FILE ON PURPOSE: Postgres cannot USE a new enum value in the same
-- transaction that adds it, so the value lands here and every table/column that
-- reads it lands in the next migration (same precedent as
-- 20260725100000_invite_purposes_guardian_notice).

ALTER TYPE payment_intent_purpose ADD VALUE IF NOT EXISTS 'parent_wallet_topup';
