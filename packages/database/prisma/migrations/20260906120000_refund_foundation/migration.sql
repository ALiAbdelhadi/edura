-- REFUND_DECISION.md §2.0 — the foundation both refund options need.
--
-- Before this, a counter refund was a negative `payments` row with NOTHING
-- linking it to what it reversed: no FK, no idempotency key, and an over-refund
-- bound that lived in the browser. The stopgap that replaced the browser check
-- (a per-receipt cap plus "the centre's net take from this student may not go
-- negative") is REMOVED in the same change as this migration -- the two must not
-- stack, because a bound in the service and a bound in the database that
-- disagree is worse than either alone.
--
-- Additive only: three columns on `payments`, one on `transactions`, two CHECKs,
-- three indexes. No table created, no row rewritten, no column dropped.
--
-- NOT CONCURRENTLY is deliberate: `prisma migrate deploy` wraps each migration in
-- a transaction block, so CONCURRENTLY is not available. Measured immediately
-- before applying: production holds 0 payments and 0 transactions (the
-- 2026-08-26 cleanup), so no index build blocks a live writer.
--
-- PRISMA CANNOT MODEL the partial unique index or either CHECK, and
-- `prisma migrate dev` WILL offer to drop them. Refuse. `c06-refund-guards`
-- asserts all six objects, exactly as c04/c05 do for their indexes.

-- 1. The refund row points at what it reverses.
--    Declared as a bare column in schema.prisma with no Prisma relation, the
--    same shape `transactions.reversal_of_id` already uses.
ALTER TABLE "payments" ADD COLUMN "reversal_of_id" uuid REFERENCES "payments"("id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_is_negative"
  CHECK ("reversal_of_id" IS NULL OR "amount" < 0);

-- One refund per receipt -- full or partial, once. `refunded_total` below is
-- what makes MULTIPLE partial refunds a later additive change (drop this index)
-- rather than a redesign.
CREATE UNIQUE INDEX "payments_one_refund_per_payment"
  ON "payments" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;

-- 2. Over-refund bounded on the SAME ROW, because a CHECK cannot look at other
--    rows and a trigger would be a second money engine. The conditional update
--    `SET refunded_total = refunded_total + X WHERE id = $1 AND refunded_total
--    + X <= amount` then gives the H2 idiom: zero rows affected is a clean 422,
--    never a 500.
--
--    GREATEST(amount, 0) pins a refund row's own refunded_total to 0 -- so a
--    refund can never itself be refunded, enforced by the database rather than
--    by a service remembering to check the sign.
ALTER TABLE "payments" ADD COLUMN "refunded_total" int NOT NULL DEFAULT 0;

ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_within_amount"
  CHECK ("refunded_total" >= 0 AND "refunded_total" <= GREATEST("amount", 0));

-- 3. Retry-safe. Mirrors `payouts_client_request_unique`
--    (20260831090000_payout_client_request_id) exactly, including relying on
--    NULL-distinctness so legacy and keyless rows do not collide.
ALTER TABLE "payments" ADD COLUMN "client_request_id" text;

CREATE UNIQUE INDEX "payments_client_request_unique"
  ON "payments" ("center_id", "client_request_id");

-- 4. Let the refund's ledger row find the charge's ledger row, which re-arms the
--    EXISTING `transactions_one_refund_per_payment` index (20260720170000) --
--    unarmed until now because nothing ever set `transactions.reversal_of_id`
--    on a counter refund.
--
--    Rows written BEFORE this migration carry NULL and cannot be backfilled by
--    the app role (`transactions` has UPDATE revoked, migration 3). The service
--    tolerates a missing link rather than refusing the refund. Production holds
--    no such rows.
ALTER TABLE "transactions" ADD COLUMN "payment_id" uuid REFERENCES "payments"("id");

CREATE INDEX "transactions_payment_id_idx" ON "transactions" ("payment_id");
