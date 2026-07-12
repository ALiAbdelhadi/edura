-- =============================================================================
-- Integrity, concurrency safety, and scale hardening (Phase 2 audit fixes).
--
-- Addresses the money-safety and DB-integrity defects found in the PRD audit:
--   * count()-based ref/invoice numbering  -> Postgres SEQUENCEs (race-free, O(1))
--   * app-layer distribution idempotency    -> sessions.distributed_at gate
--   * payout reject drops its reason         -> payouts.rejection_reason column
--   * no DB guard on duplicate active enroll -> partial unique index
--   * missing composite / sort indexes for the §4 hot query shapes
--   * ledger tables hard-deletable at the DB role level -> REVOKE UPDATE/DELETE
-- Raw SQL because Prisma cannot model sequences, partial indexes, or grants.
-- Applied over the Neon WS driver via scripts/apply-migrations.mjs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Race-free reference-number sequences (replaces `count()+1`).
--    Seed each sequence at the current row count so the next value continues
--    the historical TXN-YYYY-NNNNN / INV-YYYY-NNNNN series without collision.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS txn_ref_seq;
CREATE SEQUENCE IF NOT EXISTS invoice_ref_seq;
SELECT setval('txn_ref_seq',     GREATEST((SELECT count(*) FROM "transactions"), 1));
SELECT setval('invoice_ref_seq', GREATEST((SELECT count(*) FROM "invoices"), 1));
GRANT USAGE, SELECT ON SEQUENCE txn_ref_seq, invoice_ref_seq TO "edura_app";

-- ---------------------------------------------------------------------------
-- 2. Idempotent revenue distribution: a nullable timestamp claimed atomically.
--    Backfill sessions that already have commission ledger rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "distributed_at" timestamptz;
UPDATE "sessions" s SET "distributed_at" = now()
WHERE "distributed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "transactions" t
    WHERE t."lesson_id" = s."id" AND t."type" = 'commission'
  );

-- ---------------------------------------------------------------------------
-- 3. Preserve the payout rejection reason (route validated it, service dropped it).
-- ---------------------------------------------------------------------------
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "rejection_reason" text;

-- ---------------------------------------------------------------------------
-- 4. Integrity constraints — prevent duplicate/racey rows at the DB layer.
-- ---------------------------------------------------------------------------
-- One active enrollment per (student, course). Matches the P2002 handler in
-- app/api/v1/enrollments/route.ts.
CREATE UNIQUE INDEX IF NOT EXISTS "enrollments_active_student_course"
  ON "enrollments" ("student_id", "course_id") WHERE "status" = 'active';

-- One live classroom booking per (room, session) — supports the §4.4/§4.5
-- booking flow being wired onto this table.
CREATE UNIQUE INDEX IF NOT EXISTS "classroom_bookings_live_room_session"
  ON "classroom_bookings" ("room_id", "session_id")
  WHERE "session_id" IS NOT NULL AND "status" <> 'rejected';

-- ---------------------------------------------------------------------------
-- 5. Composite / sort indexes for the §4 hot query shapes (keyset + filters).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "transactions_type_status_created_idx"
  ON "transactions" ("type", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "transactions_from_entity_id_idx" ON "transactions" ("from_entity_id");
CREATE INDEX IF NOT EXISTS "transactions_to_entity_id_idx"   ON "transactions" ("to_entity_id");
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx"     ON "transactions" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "points_ledger_student_created_idx"
  ON "points_ledger" ("student_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "invoices_created_at_idx"  ON "invoices" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "payouts_created_at_idx"   ON "payouts" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" ("user_id", "read");
CREATE INDEX IF NOT EXISTS "blacklist_entries_target_active_idx"
  ON "blacklist_entries" ("target_id", "is_active");

-- ---------------------------------------------------------------------------
-- 6. Defense-in-depth: make append-only ledgers immutable at the DB role level.
--    The app-layer immutability extension already blocks these; this is the
--    last line if code (or a bug) ever tries a direct update/delete as edura_app.
--    INSERT/SELECT remain so the ledgers can still be appended to and read.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    REVOKE UPDATE, DELETE ON "transactions"  FROM "edura_app";
    REVOKE UPDATE, DELETE ON "points_ledger" FROM "edura_app";
    REVOKE UPDATE, DELETE ON "audit_logs"    FROM "edura_app";
    -- Invoices/payouts legitimately transition status (issued->paid->void,
    -- pending->approved->paid), so keep UPDATE; only block hard deletes.
    REVOKE DELETE ON "invoices" FROM "edura_app";
    REVOKE DELETE ON "payouts"  FROM "edura_app";
  END IF;
END $$;
