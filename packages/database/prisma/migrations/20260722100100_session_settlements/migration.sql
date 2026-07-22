-- Per-session settlement records (Room Pricing Methods). A queryable projection
-- written in the SAME transaction as distributeSessionRevenue for ROOM-BASED
-- courses (both methods). The transactions ledger stays the money source of
-- truth; this table freezes the settled attendee count + totals so
-- post-settlement attendance edits become DETECTABLE (superadmin oversight),
-- and UNIQUE(session_id) stands as a second exactly-once witness beside
-- sessions.distributed_at.

CREATE TABLE session_settlements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL UNIQUE,               -- loose ref, like transactions.lesson_id
  course_id         uuid NOT NULL,
  center_id         uuid NOT NULL,                      -- RLS tenant key
  teacher_id        uuid NOT NULL,
  room_id           uuid,
  pricing_method    room_pricing_method NOT NULL,
  present_count     integer NOT NULL CHECK (present_count > 0),
  per_session_price integer NOT NULL CHECK (per_session_price >= 0),
  platform_total    integer NOT NULL CHECK (platform_total >= 0),
  center_total      integer NOT NULL CHECK (center_total >= 0),
  teacher_total     integer NOT NULL CHECK (teacher_total >= 0),
  m2_center_fee     integer,                            -- Method-2 flat rate used (piasters/student)
  m2_center_bp      integer,                            -- Method-2 bp rate used
  settled_by        uuid NOT NULL,                      -- actor who completed the session
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX session_settlements_center_created_idx
  ON session_settlements (center_id, created_at DESC);
CREATE INDEX session_settlements_course_idx ON session_settlements (course_id);

-- Money conservation, DB-enforced: totals must sum to the settled revenue.
ALTER TABLE session_settlements ADD CONSTRAINT session_settlements_conserve
  CHECK (platform_total + center_total + teacher_total = per_session_price * present_count);

-- Tenant isolation (standard recipe — center_admin traffic runs withTenant).
ALTER TABLE session_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON session_settlements
  USING (rls_bypass() OR center_id = current_center_id())
  WITH CHECK (rls_bypass() OR center_id = current_center_id());

-- Append-only for the runtime role: INSERT + SELECT, no UPDATE/DELETE
-- (corrections live in the transactions ledger; mirrored by the Prisma
-- immutability extension for SessionSettlement).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT ON session_settlements TO "edura_app";
    REVOKE UPDATE, DELETE ON session_settlements FROM "edura_app";
  END IF;
END $$;
