-- Phase 3 of the revenue-operations spec (docs/reports/
-- revenue-operations-spec-audit.md §Phase 3): a settlement record for EVERY
-- settled lesson, not only room-based ones.
--
-- session_settlements is the spec's `Session_Financials` — the queryable
-- answer to "what did this lesson produce". Until now a NO-ROOM course
-- settled with no record at all (`if (course.pricingMethod != null)` in
-- distribution.ts), so the column goes nullable: NULL = the legacy no-room
-- fee model, exactly as NULL room_id already means "no hall".
--
-- Append-only posture (REVOKE UPDATE/DELETE) and UNIQUE(session_id) — the
-- exactly-once witness beside sessions.distributed_at — are untouched.

ALTER TABLE "session_settlements" ALTER COLUMN "pricing_method" DROP NOT NULL;
