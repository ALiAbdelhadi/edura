-- Phase 1 of the revenue-operations spec (docs/reports/
-- revenue-operations-spec-audit.md §Phase 1): the counter takes money four
-- ways in the real Egyptian center — cash, InstaPay, a POS card machine, and
-- mobile wallets (Vodafone Cash et al.) — and the drawer cannot be reconciled
-- if three of them are recorded as the fourth.
--
-- Values ONLY in this migration, deliberately: ALTER TYPE ... ADD VALUE may
-- run inside a transaction (PG 12+), but the new value cannot be USED in the
-- same transaction that adds it. Any backfill or seed touching these values
-- belongs in a later migration.
--
-- Reconciliation semantics, decided here and consumed by Phase 2 (shifts):
--   cash          -> the DRAWER. The only method counted against the till.
--   instapay      -> bank-side; matched against the account statement.
--   pos_card      -> bank-side; matched against the POS settlement report.
--   mobile_wallet -> wallet-provider-side (Vodafone Cash etc.).
--   wallet        -> internal transfer; moves no physical money at the counter.
--   unknown       -> its own bucket, never folded into cash (MC-3 rule).

ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'instapay';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'pos_card';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'mobile_wallet';
