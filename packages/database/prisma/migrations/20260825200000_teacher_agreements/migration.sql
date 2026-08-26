-- Phase 5 of the revenue-operations spec (docs/reports/
-- revenue-operations-spec-audit.md §Phase 5, decisions D1 + D2) — teacher
-- agreements: the per-teacher contract the spec asked for, WITHOUT flipping
-- the engine and WITHOUT letting the ERP write a rate.
--
-- D1 — the residual side. The agreement's rate always prices the NON-residual
-- side, and the other side keeps the remainder:
--   residual = 'teacher' (DEFAULT = today's direction): the rate is the
--     CENTER's share; the teacher keeps the remainder. No live course
--     re-rates on deploy.
--   residual = 'center' (the spec's direction): the rate is the TEACHER's
--     take (60% of net, or 50 EGP/student); the center keeps the remainder.
-- Both express through the SAME computeLessonSplit identity by deriving
-- centerShare — no second money engine.
--
-- D2 — governance. The ERP writes PROPOSALS ONLY (status='proposed'); only a
-- superadmin approval activates a rate. center-share-governance keeps its
-- exact meaning: no rate crosses the app boundary.
--
-- EFFECTIVE DATING, append-only in effect: a change ends the old row and
-- opens a new one, so any settled lesson is explained by the agreement live
-- ON ITS DATE (the same live-resolution precedent as resolveCommission).
-- PRECEDENCE: a room-based course (Method 1/2) is governed by its frozen room
-- economics — an agreement applies to NO-ROOM courses only ("ONE rule per
-- course", the engine's own header).

CREATE TYPE "agreement_basis" AS ENUM ('percent_of_net', 'fixed_per_student');
CREATE TYPE "agreement_residual" AS ENUM ('teacher', 'center');
CREATE TYPE "agreement_status" AS ENUM ('proposed', 'active', 'rejected', 'ended');

CREATE TABLE "teacher_agreements" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id"      uuid NOT NULL,
  "teacher_id"     uuid NOT NULL,
  "basis"          "agreement_basis" NOT NULL,
  "rate_bp"        int,  -- percent_of_net: basis points of the post-fee net
  "rate_flat"      int,  -- fixed_per_student: piasters per present student
  "residual"       "agreement_residual" NOT NULL DEFAULT 'teacher',
  "status"         "agreement_status" NOT NULL DEFAULT 'proposed',
  "proposed_by"    uuid NOT NULL,
  "approved_by"    uuid,
  "effective_from" timestamptz(6),
  "ended_at"       timestamptz(6),
  "note"           text,
  "created_at"     timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"     timestamptz(6) NOT NULL DEFAULT now(),
  -- Exactly ONE rate, matching the basis.
  CONSTRAINT "teacher_agreements_rate_shape" CHECK (
    ("basis" = 'percent_of_net'   AND "rate_bp" IS NOT NULL AND "rate_bp" BETWEEN 0 AND 10000 AND "rate_flat" IS NULL)
    OR
    ("basis" = 'fixed_per_student' AND "rate_flat" IS NOT NULL AND "rate_flat" > 0 AND "rate_bp" IS NULL)
  ),
  -- A rate in force knows since when; a superseded one knows until when.
  CONSTRAINT "teacher_agreements_dating_shape" CHECK (
    ("status" IN ('proposed', 'rejected') AND "effective_from" IS NULL AND "ended_at" IS NULL)
    OR ("status" = 'active' AND "effective_from" IS NOT NULL AND "ended_at" IS NULL)
    OR ("status" = 'ended'  AND "effective_from" IS NOT NULL AND "ended_at" IS NOT NULL)
  )
);

-- At most ONE live rate per pair (Prisma cannot express partial uniques).
CREATE UNIQUE INDEX "teacher_agreements_one_active_per_pair"
  ON "teacher_agreements" ("center_id", "teacher_id") WHERE "status" = 'active';

CREATE INDEX "teacher_agreements_center_id_status_idx"
  ON "teacher_agreements" ("center_id", "status");
CREATE INDEX "teacher_agreements_teacher_id_idx"
  ON "teacher_agreements" ("teacher_id");

ALTER TABLE "teacher_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_agreements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "teacher_agreements"
  USING (rls_bypass() OR "center_id" = current_center_id())
  WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON teacher_agreements TO "edura_app";
  END IF;
END $$;

COMMENT ON TABLE "teacher_agreements" IS 'Per-(center,teacher) money contract (Phase 5, D1/D2): the rate prices the non-residual side. ERP proposes; superadmin approval activates. Effective-dated append-only rows; no-room courses only.';
