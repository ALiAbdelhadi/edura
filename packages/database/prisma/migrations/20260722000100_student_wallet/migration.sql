-- Student Wallet — real-money prepaid balance. Additive, migration-safe.
--
-- Balance model: StudentProfile.wallet_balance is a cached figure; the
-- append-only wallet_ledger is the source of truth (SUM(delta) == wallet_balance
-- == last balance_after). H2-style DB CHECK (>= 0) is the non-negative floor.

-- ---------------------------------------------------------------------------
-- 1. Cached balance on the student profile + non-negative floor
-- ---------------------------------------------------------------------------
ALTER TABLE student_profiles ADD COLUMN wallet_balance integer NOT NULL DEFAULT 0;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_wallet_balance_nonneg
  CHECK (wallet_balance >= 0);

-- ---------------------------------------------------------------------------
-- 2. Append-only wallet subledger (mirrors points_ledger)
-- ---------------------------------------------------------------------------
CREATE TYPE wallet_entry_type AS ENUM ('topup', 'payment', 'refund', 'adjustment');

CREATE TABLE wallet_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL,
  type              wallet_entry_type NOT NULL,
  delta             integer NOT NULL,                        -- signed piasters
  balance_after     integer NOT NULL CHECK (balance_after >= 0),
  method            payment_method,
  ref_number        text,
  payment_id        uuid,
  payment_intent_id uuid,
  subscription_id   uuid,
  related_txn_id    uuid,
  center_id         uuid,                                    -- crediting center (cash top-up audit)
  reason            text,
  recorded_by       uuid,                                    -- staff/actor who credited (audit)
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_ledger_student_idx ON wallet_ledger (student_id);
CREATE INDEX wallet_ledger_student_created_idx ON wallet_ledger (student_id, created_at DESC);

-- App-scoped (no RLS) like points_ledger / commission_settings; runtime
-- immutability is enforced by the Prisma immutability extension (WalletLedger).
-- Deliberately NOT REVOKEing UPDATE/DELETE at the DB yet, so is_demo preview
-- wallet rows stay purgeable — the DB REVOKE is a launch-hardening step after
-- the demo wipe (mirrors the centers wallet CHECK NOT VALID precedent).

-- ---------------------------------------------------------------------------
-- 3. Wallet policy singleton (PRD §5.6 cap) — superadmin-editable
-- ---------------------------------------------------------------------------
CREATE TABLE wallet_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  max_balance integer,                                       -- NULL = uncapped; piasters
  min_topup   integer NOT NULL DEFAULT 1000,                 -- 10 EGP
  max_topup   integer NOT NULL DEFAULT 500000,               -- 5000 EGP
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Seed a sensible, editable default cap: 500 EGP.
INSERT INTO wallet_settings (max_balance, min_topup, max_topup) VALUES (50000, 1000, 500000);

-- ---------------------------------------------------------------------------
-- 4. Payment-intent target discriminator (wallet top-up vs subscription)
-- ---------------------------------------------------------------------------
CREATE TYPE payment_intent_purpose AS ENUM ('subscription', 'wallet_topup');
ALTER TABLE payment_intents
  ADD COLUMN purpose payment_intent_purpose NOT NULL DEFAULT 'subscription';

-- ---------------------------------------------------------------------------
-- 5. Runtime role grants (new tables) + the platform receipt sequence, which
--    wallet top-ups draw from and which was never granted to edura_app.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_ledger, wallet_settings TO "edura_app";
    GRANT USAGE, SELECT ON SEQUENCE platform_receipt_seq TO "edura_app";
  END IF;
END $$;
