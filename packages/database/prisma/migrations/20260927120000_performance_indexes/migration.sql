-- Performance indexes (db-analysis 2026-09-27, batch 7). Additive only: thirteen
-- plain B-tree indexes, no column added, no row rewritten, no index dropped, no
-- query changed. Every index below is mirrored as an @@index(..., map:) in
-- schema.prisma, so `prisma migrate diff` sees no drift from this migration.
--
-- NOT CONCURRENTLY is deliberate: prisma migrate deploy wraps each migration in a
-- transaction block and CONCURRENTLY cannot run inside one (same reasoning as
-- 20260902120000_dedupe_guards). A plain CREATE INDEX holds a SHARE lock on the
-- table for the build: reads continue, writes wait. Fine while a table is small.
--
-- If a table has grown large by the time this reaches an environment (check
-- `SELECT relname, n_live_tup FROM pg_stat_user_tables` first), build that
-- table's indexes BY HAND, outside a transaction, BEFORE `migrate deploy`; the
-- IF NOT EXISTS below then makes the migration a no-op for them:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_type_created_idx"        ON "notifications" ("type", "created_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_user_read_at_idx"        ON "notifications" ("user_id", "read_at");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_center_created_idx"         ON "audit_logs" ("center_id", "created_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "subs_center_created_idx"               ON "subscriptions" ("center_id", "created_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "subs_payment_idx"                      ON "subscriptions" ("payment_id");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "attendance_records_student_created_idx" ON "attendance_records" ("student_id", "created_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "attendance_records_center_status_idx"  ON "attendance_records" ("center_id", "status");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "attendance_records_course_status_idx"  ON "attendance_records" ("course_id", "status");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_course_paid_idx"              ON "payments" ("course_id", "paid_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "wallet_ledger_payment_idx"             ON "wallet_ledger" ("payment_id");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "parent_wallet_ledger_payment_idx"      ON "parent_wallet_ledger" ("payment_id");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_date_start_time_idx"          ON "sessions" ("date", "start_time");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "grades_teacher_date_idx"               ON "grades" ("teacher_id", "date" DESC);
--
-- A CONCURRENTLY build that fails leaves an INVALID index behind; check
-- `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid` and DROP it
-- before retrying, or the IF NOT EXISTS below will keep the broken one.
--
-- Partial indexes were considered for payment_id / read_at / status and
-- rejected: Prisma cannot model them, so they would be permanent drift. The
-- plain forms serve the same equality / IS NULL lookups.

-- notifications: renewal-reminder dedupe scans one type (cron/jobs.ts); the
-- unread badge counts `user_id = ? AND read_at IS NULL` (messages.ts).
CREATE INDEX IF NOT EXISTS "notifications_type_created_idx"
  ON "notifications" ("type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_user_read_at_idx"
  ON "notifications" ("user_id", "read_at");

-- audit_logs: the centre audit page orders one centre's rows by time
-- (center-audit.ts, superadmin audit-log.ts). The fastest-growing table.
CREATE INDEX IF NOT EXISTS "audit_logs_center_created_idx"
  ON "audit_logs" ("center_id", "created_at" DESC);

-- subscriptions: the counter list is one centre newest-first with an optional
-- status (center/subscriptions route); refunds resolve the subscriptions a
-- receipt bought (refund-payment.ts).
CREATE INDEX IF NOT EXISTS "subs_center_created_idx"
  ON "subscriptions" ("center_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "subs_payment_idx"
  ON "subscriptions" ("payment_id");

-- attendance_records: a student's history newest-first (me/attendance route,
-- data-export.ts); dashboard present/total counts per centre and per course
-- (reports.ts).
CREATE INDEX IF NOT EXISTS "attendance_records_student_created_idx"
  ON "attendance_records" ("student_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "attendance_records_center_status_idx"
  ON "attendance_records" ("center_id", "status");
CREATE INDEX IF NOT EXISTS "attendance_records_course_status_idx"
  ON "attendance_records" ("course_id", "status");

-- payments: course-scoped revenue for external teachers (external-teachers.ts,
-- reconciliation.ts, reports.ts). course_id had no index at all.
CREATE INDEX IF NOT EXISTS "payments_course_paid_idx"
  ON "payments" ("course_id", "paid_at" DESC);

-- wallet ledgers: the refund wallet gate looks up the ledger rows a receipt
-- funded, inside the refund transaction (refund-payment.ts).
CREATE INDEX IF NOT EXISTS "wallet_ledger_payment_idx"
  ON "wallet_ledger" ("payment_id");
CREATE INDEX IF NOT EXISTS "parent_wallet_ledger_payment_idx"
  ON "parent_wallet_ledger" ("payment_id");

-- sessions: the reminder cron selects a day and a start-time window with no
-- course or teacher lead (cron/jobs.ts); nothing date-leading existed.
CREATE INDEX IF NOT EXISTS "sessions_date_start_time_idx"
  ON "sessions" ("date", "start_time");

-- grades: teacher-scoped lists ordered by date (manual-grades.ts,
-- external-teachers.ts, reports.ts). teacher_id had no index at all.
CREATE INDEX IF NOT EXISTS "grades_teacher_date_idx"
  ON "grades" ("teacher_id", "date" DESC);
