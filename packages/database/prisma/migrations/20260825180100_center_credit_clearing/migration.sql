-- Phase 4 of the revenue-operations spec (docs/reports/
-- revenue-operations-spec-audit.md §Phase 4, decisions D4 + D5) — funding
-- legs + the center credit wallet. THE clearing model:
--
--   `centers.wallet_balance`  keeps exactly its old meaning — PLATFORM-HELD
--                             money owed to the center (H2 CHECK untouched).
--   `centers.credit_balance`  is NEW and is the center<->platform position:
--                             top-ups credit it, obligations debit it, and it
--                             MAY GO NEGATIVE — arrears the platform can see
--                             and chase. One column per meaning, never both.
--
-- WHY (F2, measured before this migration): settlement credited wallet_balance
-- identically whether students paid online (platform holds the gross) or cash
-- at the counter (the CENTER holds the gross) — so a payout of cash-funded
-- credit was the platform transferring money it never received, and the
-- platform's commission on that same cash lesson was a ledger row with no
-- collection mechanism. One missing concept — the funding source — two
-- symptoms.

-- 1. The funding leg, stamped on the per-student lesson `payment` rows at
--    settlement time (INSERT-time only; the table stays append-only).
--    NULL = the row predates funding legs.
CREATE TYPE "funding_source" AS ENUM ('platform_held', 'center_held');
ALTER TABLE "transactions" ADD COLUMN "funding" "funding_source";

-- 2. The position column. Signed; negative = the center owes the platform.
--    DELIBERATELY no non-negative CHECK: refusing the commission debit would
--    mean refusing to settle a lesson that already happened.
ALTER TABLE "centers" ADD COLUMN "credit_balance" int NOT NULL DEFAULT 0;

-- 3. Its ledger — every move, signed, with a running balance (the sibling of
--    wallet_ledger / parent_wallet_ledger, owned by a CENTER).
CREATE TYPE "center_wallet_entry_type" AS ENUM (
  'topup',                  -- center funds its credit (online intent)
  'teacher_debit',          -- settlement: teacher's share of center-held gross
  'commission_debit',       -- settlement: platform fees on center-held gross
  'wallet_cash_collection', -- counter took CASH into a student wallet: the
                            -- drawer now holds platform money (what makes
                            -- "wallet = platform-held" true uniformly)
  'refund_reversal',        -- refund of a center-held lesson (see D5)
  'adjustment'
);

CREATE TABLE "center_wallet_ledger" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id"         uuid NOT NULL,
  "type"              "center_wallet_entry_type" NOT NULL,
  "delta"             int NOT NULL,      -- signed piasters
  "balance_after"     int NOT NULL,      -- running credit_balance snapshot
  "method"            "payment_method",
  "ref_number"        text,
  "payment_intent_id" uuid,
  "session_id"        uuid,              -- the settled lesson, for the debits
  "related_txn_id"    uuid,
  "reason"            text,
  "recorded_by"       uuid,
  "created_at"        timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX "center_wallet_ledger_center_id_created_at_idx"
  ON "center_wallet_ledger" ("center_id", "created_at" DESC);
CREATE INDEX "center_wallet_ledger_session_id_idx"
  ON "center_wallet_ledger" ("session_id") WHERE "session_id" IS NOT NULL;

ALTER TABLE "center_wallet_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "center_wallet_ledger" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "center_wallet_ledger"
  USING (rls_bypass() OR "center_id" = current_center_id())
  WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON center_wallet_ledger TO "edura_app";
  END IF;
END $$;

-- 4. The settlement records the funding split it settled under.
--    NULL on both = the row predates funding legs (never backfilled — an
--    admitted gap, not a guess; the MC-3 rule).
ALTER TABLE "session_settlements"
  ADD COLUMN "platform_held_gross" int,
  ADD COLUMN "center_held_gross" int;

-- 5. A center credit top-up intent has no beneficiary student — widen the
--    guard to exactly the two studentless purposes.
ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_student_required;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_student_required
  CHECK (student_id IS NOT NULL OR purpose IN ('parent_wallet_topup', 'center_credit_topup'));

COMMENT ON COLUMN "centers"."credit_balance" IS 'Signed center<->platform position (Phase 4, D4/D5): top-ups credit, center-held settlement obligations debit; negative = arrears. wallet_balance stays platform-held-payable only.';
COMMENT ON TABLE "center_wallet_ledger" IS 'Every credit_balance move, signed, with running balance_after. Settlement debits reference their lesson via session_id.';
