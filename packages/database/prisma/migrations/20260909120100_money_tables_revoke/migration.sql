-- SECURITY_AUDIT.md M-04 — the launch-hardening step the wallet migrations
-- deferred (20260722000100_student_wallet:41-43, 20260727110100_parent_wallet:55).
--
-- The three wallet ledgers are append-only in code (IMMUTABLE_MODELS) but were
-- fully writable by the application role, so any bug, injection or leaked
-- app-role credential could rewrite a balance history with no database-level
-- refusal. `transactions` has had this REVOKE since 00000000000003; these
-- tables carry the same kind of money and now carry the same rule.
--
-- `payments` keeps UPDATE: the refund bookkeeping columns (refunded_total,
-- refund_confirmed_at, refund_external_ref, refund_confirmed_by) are written
-- by conditional updates whose WHERE clauses ARE the guard. Only DELETE goes —
-- a receipt is never removed, it is reversed.
--
-- Demo purges (prisma/*-demo-seed.ts, preview-seed.ts) used to delete these
-- rows as the app role; they now do so through prisma/owner-purge.ts on
-- ADMIN_URL, exactly as test-cleanup.ts and wipe-data.ts always have.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    REVOKE UPDATE, DELETE ON "wallet_ledger"        FROM "edura_app";
    REVOKE UPDATE, DELETE ON "parent_wallet_ledger" FROM "edura_app";
    REVOKE UPDATE, DELETE ON "center_wallet_ledger" FROM "edura_app";
    REVOKE DELETE         ON "payments"             FROM "edura_app";
  END IF;
END $$;
