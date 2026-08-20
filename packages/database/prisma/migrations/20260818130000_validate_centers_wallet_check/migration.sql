-- H2 follow-through: VALIDATE the centers wallet-floor CHECK.
--
-- 20260720160000_wallet_nonneg_check added this constraint NOT VALID, because
-- `centers` then held ONE pre-existing legacy negative row (-2600) that the
-- Step 9 pre-launch wipe was going to remove. It left the follow-up as a
-- COMMENT for a human to run afterwards:
--
--     ALTER TABLE centers VALIDATE CONSTRAINT centers_wallet_balance_nonneg;
--
-- Dev and production had that run by hand (CLAUDE.md, 2026-07-26 / 2026-07-31).
-- Nothing automated it, so EVERY FRESH ENVIRONMENT still gets the constraint
-- NOT VALID — and verify-db asserted nothing about `convalidated`, so a new
-- environment reported 27/27 green with the money floor only half-enforced.
-- Measured 2026-08-18 on a freshly bootstrapped database: every other
-- *_nonneg CHECK was convalidated = true; this one alone was false.
--
-- NOT VALID still enforces every INSERT and UPDATE; what it skips is the
-- back-check of existing rows. So this is about closing a gap for future
-- environments, not about repairing live data.
--
-- Guarded so it is a no-op where the manual step already ran (dev, production),
-- which also keeps it cheap: VALIDATE takes a SHARE UPDATE EXCLUSIVE lock and
-- scans the table, and there is no reason to pay that twice.
--
-- If this migration FAILS, it has found a genuinely negative wallet balance.
-- That is a money-integrity problem and failing loudly is the correct outcome:
-- fix the row, then re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'centers_wallet_balance_nonneg'
      AND conrelid = 'centers'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE centers VALIDATE CONSTRAINT centers_wallet_balance_nonneg;
  END IF;
END $$;
