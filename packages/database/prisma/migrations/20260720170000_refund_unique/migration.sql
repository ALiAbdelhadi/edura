-- H3: a lesson charge can be refunded AT MOST ONCE. DB-level backstop against
-- the findFirst-then-insert TOCTOU in refundLessonForStudent — two concurrent
-- refunds of the same payment can no longer both insert a refund row.
--
-- Partial unique on the refund rows only (each carries reversal_of_id = the
-- original payment). Non-refund correction rows are unaffected. Probed clean
-- (0 existing duplicates) before applying.
CREATE UNIQUE INDEX transactions_one_refund_per_payment
  ON transactions (reversal_of_id)
  WHERE type = 'refund';
