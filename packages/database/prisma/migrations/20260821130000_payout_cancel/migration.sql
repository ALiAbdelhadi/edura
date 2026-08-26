-- T-4 — payout-request cancel (API session 2, item B.1#5; approved decision
-- 2026-08-21: the request's OWNER may cancel while status is 'pending' only).
--
-- 'cancelled' is a distinct terminal status, deliberately not a reuse of
-- 'rejected': rejected records an accountant's refusal, cancelled records the
-- owner's own undo, and an audit trail that cannot tell them apart is not an
-- audit trail. The new value is not USED in this migration (no column default
-- references it), so enum-add + column can share one transaction.
--
-- cancelled_at mirrors paid_at: the row itself says when, like every other
-- terminal payout state.
ALTER TYPE "payout_status" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TABLE "payouts" ADD COLUMN "cancelled_at" TIMESTAMPTZ(6);
