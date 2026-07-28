-- Parent Wallet — a real-money prepaid balance owned by a PARENT, so a guardian
-- can pay for their own child's lesson from their own money. Additive only.
--
-- Balance model mirrors the student wallet exactly: parent_profiles.
-- wallet_balance is a cached figure; the append-only parent_wallet_ledger is the
-- source of truth (SUM(delta) == wallet_balance == last balance_after), with the
-- H2-style DB CHECK (>= 0) as the non-negative floor.
--
-- WHY A SIBLING TABLE rather than a parent_id column on wallet_ledger:
-- wallet_ledger.student_id is NOT NULL and the student wallet is proven money
-- code (reconcileWallet, the H2 conditional debit, the immutability extension).
-- Loosening that column would change the meaning of every query already built on
-- it. A sibling table costs a mirrored pair of primitives and touches none of it.

-- ---------------------------------------------------------------------------
-- 1. Cached balance on the parent profile + non-negative floor
-- ---------------------------------------------------------------------------
-- Every existing row is 0, so this CHECK is created VALID from birth (unlike the
-- centers wallet CHECK, which had to land NOT VALID over legacy data).
ALTER TABLE parent_profiles ADD COLUMN wallet_balance integer NOT NULL DEFAULT 0;
ALTER TABLE parent_profiles ADD CONSTRAINT parent_profiles_wallet_balance_nonneg
  CHECK (wallet_balance >= 0);

-- ---------------------------------------------------------------------------
-- 2. Append-only parent wallet subledger (mirrors wallet_ledger)
-- ---------------------------------------------------------------------------
-- The one column the student ledger has no need for: beneficiary_student_id,
-- which names WHICH child a spend was for. NULL on top-ups (money in is not for
-- any one child) and on adjustments.
CREATE TABLE parent_wallet_ledger (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id              uuid NOT NULL,
  beneficiary_student_id uuid,                                    -- which child this spend was for
  type                   wallet_entry_type NOT NULL,
  delta                  integer NOT NULL,                        -- signed piasters
  balance_after          integer NOT NULL CHECK (balance_after >= 0),
  method                 payment_method,
  ref_number             text,
  payment_id             uuid,
  payment_intent_id      uuid,
  subscription_id        uuid,
  related_txn_id         uuid,
  reason                 text,
  recorded_by            uuid,                                    -- actor who moved it (audit)
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parent_wallet_ledger_parent_idx ON parent_wallet_ledger (parent_id);
CREATE INDEX parent_wallet_ledger_parent_created_idx
  ON parent_wallet_ledger (parent_id, created_at DESC);
CREATE INDEX parent_wallet_ledger_beneficiary_idx
  ON parent_wallet_ledger (beneficiary_student_id);

-- App-scoped (no RLS) like wallet_ledger / points_ledger; runtime immutability is
-- enforced by the Prisma immutability extension (ParentWalletLedger is added to
-- IMMUTABLE_MODELS). The DB-level REVOKE is deliberately deferred to the same
-- launch-hardening step as wallet_ledger's, so is_demo preview rows stay
-- purgeable — stated here rather than claimed as a guarantee that is not there.

-- ---------------------------------------------------------------------------
-- 3. Who PAID, as distinct from who the money is FOR
-- ---------------------------------------------------------------------------
-- NULL means "the student paid for themselves", which is exactly what every
-- pre-existing row means — so no backfill, and no row changes meaning.
ALTER TABLE payments        ADD COLUMN payer_user_id uuid;
ALTER TABLE payment_intents ADD COLUMN payer_user_id uuid;
CREATE INDEX payments_payer_idx        ON payments (payer_user_id);
CREATE INDEX payment_intents_payer_idx ON payment_intents (payer_user_id);

-- A parent topping up their OWN wallet has no beneficiary student: the money is
-- platform float until they spend it. student_id becomes nullable for that one
-- purpose. This is a LOOSENING — no existing row is affected, and every existing
-- row keeps a non-null student_id.
ALTER TABLE payment_intents ALTER COLUMN student_id DROP NOT NULL;

-- Guard the loosening so it can only ever apply to that one purpose: any intent
-- that is NOT a parent wallet top-up must still name its student.
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_student_required
  CHECK (student_id IS NOT NULL OR purpose = 'parent_wallet_topup');

-- payments.student_id stays NOT NULL: a parent wallet top-up writes no Payment
-- row at all (it is a float deposit, not a center/teacher receipt). Its receipt
-- number lives on the Transaction and on the ledger row's ref_number.

-- ---------------------------------------------------------------------------
-- 4. Runtime role grants (new table)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON parent_wallet_ledger TO "edura_app";
  END IF;
END $$;
