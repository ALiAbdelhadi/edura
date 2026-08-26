-- T-9 — reopen-for-settlement (API session 2, item B.1#7; approved decision
-- 2026-08-21, docs/decisions/attendance-reopen-settlement.md).
--
-- A session past the 7-day edit window that was NEVER settled could not be
-- settled at all: settlement demands attendance, attendance editing was
-- frozen, and nothing reconciled the two — the teacher's share of that lesson
-- was stranded (TEACHER_IA_AUDIT §7.2 T-9, measured on a real dev lesson).
--
-- These two columns are the reopen FACT: who reopened the register and when.
-- The lock predicate honours a reopen only while the session is unsettled —
-- `distributed_at` re-arms it permanently, so settled attendance facts (what
-- the money was computed from) can never move again. The same change closes
-- the bulk-write bypass: bulkMarkAttendance now consults the same lock the
-- GET reports and editAttendance enforces.
ALTER TABLE "sessions" ADD COLUMN "attendance_reopened_at" TIMESTAMPTZ(6);
ALTER TABLE "sessions" ADD COLUMN "attendance_reopened_by" UUID;
