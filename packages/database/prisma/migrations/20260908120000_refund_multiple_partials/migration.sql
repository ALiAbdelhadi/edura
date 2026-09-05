-- Multiple partial refunds per receipt (decided 2026-09-05, after
-- REFUND_DECISION.md §2.0 shipped one-refund-per-receipt as the first shape).
--
-- A receipt refunded 200 of 500 was stranded: the second refund hit
-- `payments_one_refund_per_payment` and the remaining 300 had no path back.
-- `refunded_total` + `payments_refunded_within_amount` (migration 73) were
-- always the real bound; this drops the index that made them moot.
--
-- Two indexes collided with a second partial, not one. The counter refund's
-- ledger row stamps `reversal_of_id` with the charge's transaction, so
-- `transactions_one_refund_per_payment` (20260720170000, H3) refused it too.
-- That index is ALSO the guard on the superadmin lesson refund
-- (refundLessonForStudent), which is what stops two concurrent clawbacks of the
-- same charge — so it is NOT dropped. It is recreated with `payment_id IS NULL`
-- added to its predicate: lesson refunds never set `payment_id` and keep the
-- guard exactly; counter refunds always set it (migration 73) and are exempt,
-- keeping their charge link.
--
-- Additive in effect: no column, no row rewritten. Measured immediately before
-- applying: dev, test and production hold ZERO `type='refund'` transactions
-- and ZERO reversing payments, so the rebuild locks nothing that is in use.
--
-- NOT CONCURRENTLY is deliberate: `prisma migrate deploy` runs this inside a
-- transaction. Prisma cannot model either partial index and `prisma migrate
-- dev` WILL offer to "fix" them — refuse. `c06-refund-guards` asserts the
-- payments index is ABSENT and the transactions predicate is this one.

DROP INDEX IF EXISTS "payments_one_refund_per_payment";

DROP INDEX IF EXISTS "transactions_one_refund_per_payment";
CREATE UNIQUE INDEX "transactions_one_refund_per_payment"
  ON "transactions" ("reversal_of_id")
  WHERE "type" = 'refund' AND "payment_id" IS NULL;
