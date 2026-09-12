-- SECURITY_AUDIT.md (2026-09-11) DB-04 — the application role could hard-delete
-- a user. Deletion in this codebase is `users.status = 'deleted'` + `deleted_at`
-- (the soft-delete Prisma extension); no code path calls `user.delete`, and a
-- raw statement or a leaked app-role credential was the only way a row — and,
-- through ON DELETE CASCADE, its two_factors, sessions and accounts — could
-- vanish with no ledger of it. The database now refuses, as it already does
-- for the money tables (00000000000003, 20260909120100). Tooling that really
-- removes users (test-cleanup, wipe-data, production-cleanup, owner-purge)
-- has always run on ADMIN_URL and is unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    REVOKE DELETE ON "users" FROM "edura_app";
  END IF;
END $$;
