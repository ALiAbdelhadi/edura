-- REFUND_DECISION.md Option B, on top of migration 73's foundation.
--
-- The foundation records that a receipt WAS reversed and how much. This records
-- WHERE the money went and demands evidence that it arrived. Under B the cash
-- leaves the drawer (or the gateway reverses the charge); the platform records
-- an outflow it did not itself execute, so the only honest way to book it is as
-- an OBLIGATION first and a settled movement second.
--
-- Additive only: one enum type, four columns on `payments`, two CHECKs, one
-- partial unique index. No table created, no row rewritten, no column dropped.
-- Tables stay 82 -- a type is not a table.
--
-- Measured immediately before applying (MIGRATION_PLAN_B.md §1): every
-- environment holds ZERO rows with `reversal_of_id IS NOT NULL`, so both CHECKs
-- are added VALIDATED and nothing is backfilled.
--
-- CREATE TYPE is transaction-safe, so this runs inside `migrate deploy`'s
-- wrapper. Note for later: `ALTER TYPE ... ADD VALUE` is NOT, so adding a fifth
-- channel needs its own migration written to run outside a transaction.

CREATE TYPE "refund_channel" AS ENUM ('cash_drawer', 'bank_transfer', 'gateway', 'wallet');

-- `wallet` is in the enum from day one even though Option A was rejected: a
-- wallet refund is a legitimate channel if the spendability gaps in
-- WALLET_SPENDABILITY.md §Verdict are ever closed, and having the value present
-- means the two shapes can coexist rather than fork.
ALTER TABLE "payments" ADD COLUMN "refund_channel"      "refund_channel";
ALTER TABLE "payments" ADD COLUMN "refund_external_ref" text;
ALTER TABLE "payments" ADD COLUMN "refund_confirmed_at" timestamptz(6);
ALTER TABLE "payments" ADD COLUMN "refund_confirmed_by" uuid REFERENCES "users"("id");

-- A refund row must declare its channel; a non-refund row must not have one.
-- Paired with migration 73's `payments_reversal_is_negative`, this makes the
-- three refund facts -- negative, linked, channelled -- inseparable.
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_channel_shape"
  CHECK (("reversal_of_id" IS NULL     AND "refund_channel" IS NULL)
      OR ("reversal_of_id" IS NOT NULL AND "refund_channel" IS NOT NULL));

-- Confirmation requires a reference AND a named actor, together or not at all.
-- There is no "confirmed, no proof" state the database will accept, which is the
-- single strongest control B has: an operator can still lie about a voucher
-- number, but cannot record a confirmation without writing one down and signing
-- it.
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_confirmation_complete"
  CHECK (("refund_confirmed_at" IS NULL AND "refund_confirmed_by" IS NULL)
      OR ("refund_confirmed_at" IS NOT NULL
          AND "refund_confirmed_by" IS NOT NULL
          AND "refund_external_ref" IS NOT NULL));

-- One external reference per channel. `cash_drawer` is EXCLUDED on purpose: a
-- paper voucher number is centre-local stationery and two centres will
-- legitimately both write "0001". A gateway refund id and a bank reference are
-- globally unique, and reusing one to confirm a second refund is the fraud this
-- index makes impossible.
CREATE UNIQUE INDEX "payments_refund_external_ref_unique"
  ON "payments" ("refund_channel", "refund_external_ref")
  WHERE "refund_external_ref" IS NOT NULL AND "refund_channel" <> 'cash_drawer';
