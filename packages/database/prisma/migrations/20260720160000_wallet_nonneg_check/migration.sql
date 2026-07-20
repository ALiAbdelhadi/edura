-- H2: wallet balances must never go negative. DB-level backstop that holds
-- even if application code is ever bypassed — complements the conditional
-- decrement in settlePayout (updateMany WHERE wallet_balance >= net).

-- teacher_profiles is clean (no existing negatives) -> fully validated CHECK.
ALTER TABLE teacher_profiles
  ADD CONSTRAINT teacher_profiles_wallet_balance_nonneg CHECK (wallet_balance >= 0);

-- centers has ONE pre-existing legacy negative row (id 26464e5c… = -2600), a
-- non-seed 2026-04-25 test-run center slated for the Step 9 pre-launch wipe
-- (CLAUDE.md decision #6: leave legacy data untouched, do not flag/edit it).
-- Add the constraint NOT VALID so it enforces every future INSERT/UPDATE
-- without retroactively failing on that historical row. After the Step 9 wipe
-- removes the legacy row, run:
--   ALTER TABLE centers VALIDATE CONSTRAINT centers_wallet_balance_nonneg;
ALTER TABLE centers
  ADD CONSTRAINT centers_wallet_balance_nonneg CHECK (wallet_balance >= 0) NOT VALID;
