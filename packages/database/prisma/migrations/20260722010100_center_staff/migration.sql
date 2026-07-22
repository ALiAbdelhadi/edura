-- Center staff (receptionist / manager / center-accountant), mirroring
-- teacher_assistants (Step 8). One ACTIVE center per staff user (partial
-- unique). center_staff HAS a center_id, so unlike teacher_assistants it is
-- DB-tenant-isolated via the same tenant_isolation RLS policy as every other
-- center table (00000000000001_rls_and_constraints.sql).
--
-- NOTE: CREATE TYPE for a NEW enum is fine in-file — only ADD VALUE on an
-- EXISTING type needs its own isolated migration (see the sibling migration
-- 20260722010000_center_staff_role_value).

CREATE TYPE "center_staff_role" AS ENUM ('receptionist', 'manager', 'center_accountant');

CREATE TABLE "center_staff" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id"     uuid NOT NULL,
  "staff_user_id" uuid NOT NULL,
  "role"          "center_staff_role" NOT NULL DEFAULT 'receptionist',
  "title"         text,
  "removed_at"    timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "center_staff_center_id_staff_user_id_key" UNIQUE ("center_id", "staff_user_id")
);

CREATE INDEX "center_staff_staff_user_id_idx" ON "center_staff" ("staff_user_id");
CREATE INDEX "center_staff_center_id_idx"     ON "center_staff" ("center_id");

-- Partial unique (Prisma can't express it): one ACTIVE center per staff user.
-- Soft-removed rows (removed_at set) never block re-adding. Mirrors
-- teacher_assistants_one_active_teacher_per_assistant (Step 8).
CREATE UNIQUE INDEX "center_staff_one_active_center_per_staff"
  ON "center_staff" ("staff_user_id")
  WHERE "removed_at" IS NULL;

-- Center-scoped RLS: identical tenant_isolation policy to the other center
-- tables. FORCE so the owner Prisma connects as is also subject to the policy.
ALTER TABLE "center_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "center_staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "center_staff"
  USING (rls_bypass() OR "center_id" = current_center_id())
  WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

COMMENT ON TABLE "center_staff" IS 'Center front-desk / manager / center-accountant staff, mirroring teacher_assistants. One active center per staff user (partial unique). Delegation is default-closed; every action is audited on-behalf-of the center.';
