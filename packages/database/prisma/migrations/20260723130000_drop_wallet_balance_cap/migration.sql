-- Student wallet: remove the balance cap (2026-07-23).
--
-- The wallet used to carry a global max_balance (seeded at 50000 piasters =
-- 500 EGP by 20260722000100_student_wallet), enforced in assertTopupAllowed and
-- shown to the student as a "Wallet limit" card. The cap is gone: a student may
-- hold any balance. Only the per-transaction min_topup / max_topup bounds stay.
--
-- Data-only, non-destructive: the column is kept (nullable = uncapped) but is
-- now INERT — no code reads it. NULL it so nothing can resurrect a silent cap.
UPDATE wallet_settings SET max_balance = NULL WHERE max_balance IS NOT NULL;
