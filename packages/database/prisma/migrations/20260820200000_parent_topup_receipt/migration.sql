-- =============================================================================
-- A PARENT WALLET TOP-UP GETS A RECEIPT.
--
-- NOT APPLIED BY WRITING THIS FILE. Merging a migration applies it nowhere —
-- the 2026-08-02 production outage in CLAUDE.md is what that lesson cost. The
-- code in this commit REQUIRES this migration, so it must reach dev and then
-- production BEFORE that code deploys:
--
--     cd packages/database
--     EDURA_ENV=production npx prisma migrate deploy   # production
--     npx prisma migrate deploy                        # dev (EDURA_ENV unset)
--
-- Read the `Datasource "db": … at "<host>"` line prisma prints before trusting
-- either: production is ep-solitary-river-…, dev is ep-patient-scene-….
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
-- `settleParentWalletTopUpFromIntentTx` already minted a receipt number and put
-- it in the notification, so a parent was told "Receipt RCP-EDURA-2026-00042
-- has been issued" — and nothing anywhere could produce it.
-- `sendPaymentReceiptEmail` looked it up, found no `payments` row, and returned
-- `no_payment_row`; the fees `ReceiptLink` had no id to open. A receipt that is
-- announced and does not exist is worse than no receipt: the parent has a number
-- to quote at a counter and the counter has nothing to match it against.
-- (PARENT_IA_AUDIT.md §7.1 finding 4.)
--
-- ---------------------------------------------------------------------------
-- WHY THIS REVERSES A DECISION THAT WAS DELIBERATE
-- ---------------------------------------------------------------------------
-- docs/decisions/parent-pays-lesson.md §5 said a parent top-up writes NO Payment
-- row, "a float deposit by a guardian, not a center/teacher receipt", and that
-- this is why `payments.student_id` stayed NOT NULL while
-- `payment_intents.student_id` became nullable.
--
-- That reasoning holds for the LEDGER — the money still moves nowhere near a
-- center or a teacher, `center_id` and `course_id` stay NULL, and no
-- distribution, payout or statement sees a piaster of it. What it got wrong is
-- what a `payments` row IS to the people using this product. It is the receipt
-- table. An Egyptian parent handing over money expects a numbered receipt, and
-- the product already promised them one. Ali reversed §5 on 2026-08-20; the
-- money model is unchanged, only the receipt is now real.
--
-- ---------------------------------------------------------------------------
-- THE LOOSENING, AND ITS GUARD
-- ---------------------------------------------------------------------------
-- This is a widening: no existing row is affected and every existing row keeps
-- a non-null student_id. Exactly the shape of the `payment_intents` loosening in
-- 20260727110100_parent_wallet, and guarded the same way — a NULL must be able
-- to mean ONE thing, or the column stops meaning anything.
--
-- `payments` has no `purpose` column to key the guard on, so the guard is the
-- SHAPE of a parent float deposit, which nothing else in the model has:
--
--   payer_user_id IS NOT NULL  — somebody paid, and it was not the student
--   center_id     IS NULL      — no center took this money
--   course_id     IS NULL      — it bought no lesson
--
-- A teacher-direct receipt has center_id NULL but names its course. A cash
-- top-up at a counter has course_id NULL but names its center AND its student.
-- A course payment names all three. Only the parent float deposit matches.
-- =============================================================================

-- 1. The loosening.
ALTER TABLE payments ALTER COLUMN student_id DROP NOT NULL;

-- 2. The guard. Written NOT VALID first would buy nothing here — the table
--    cannot contain a violating row, because until this statement runs the
--    column is NOT NULL. So it validates immediately and cheaply.
ALTER TABLE payments ADD CONSTRAINT payments_student_required
  CHECK (
    student_id IS NOT NULL
    OR (payer_user_id IS NOT NULL AND center_id IS NULL AND course_id IS NULL)
  );

-- 3. The partial index behind "my receipts" for a payer.
--    `getPayment` now grants a payer ownership of the row they funded, and
--    `listPayments` lets a parent read their own top-ups. Both filter on
--    payer_user_id; the existing payments_payer_user_id_idx already covers that,
--    so nothing is added here. Recorded so the absence reads as considered.

-- 4. NOT TOUCHED, deliberately:
--    * `payments.amount` stays SIGNED — negative is a refund, and a top-up
--      refund keeps using that, not a new column.
--    * `transactions` is unchanged. The Transaction this Payment accompanies is
--      already written by the settler and still carries the float direction
--      (from_entity_id = the parent, to_entity_id = NULL, center_id = NULL).
--    * No RLS policy changes. `payments`'s tenant_isolation keys on center_id,
--      and a NULL center_id row is invisible under a tenant context — which is
--      correct and is already how teacher-direct receipts behave. The parent
--      reads it through platformDb, where authorization is the application's
--      job and is done in `getPayment`.
