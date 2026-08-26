-- Phase 2 of the revenue-operations spec (docs/reports/
-- revenue-operations-spec-audit.md §Phase 2): shift / drawer reconciliation.
--
-- A shift is ONE staff member's drawer session: opened with a float, closed
-- against a physical count. It writes no money of its own — every figure it
-- reports is a SUM over `payments` rows stamped with its id at write time, so
-- the reconciliation and the ledger can never be two sets of books.
--
-- What is frozen at close (expected_cash / counted_cash / variance) freezes
-- only the DRAWER: cash is the one method that physically sits in the till
-- (Phase 1's rule, recorded in migration 20260825120000). The bank-side
-- channels (instapay / pos_card) and the provider-side one (mobile_wallet)
-- are reported per method for statement matching but have no drawer count to
-- diverge from; `wallet` moves no physical money and is excluded from
-- physical expectations entirely.

CREATE TYPE "shift_status" AS ENUM ('open', 'closed');

CREATE TABLE "center_shifts" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id"     uuid NOT NULL,
  -- Whose drawer. The same id the money writers record as payments.recorded_by,
  -- which is what lets the stamp be derived rather than passed.
  "staff_user_id" uuid NOT NULL,
  "status"        "shift_status" NOT NULL DEFAULT 'open',
  "opened_at"     timestamptz(6) NOT NULL DEFAULT now(),
  "opened_by"     uuid NOT NULL,
  "closed_at"     timestamptz(6),
  "closed_by"     uuid,
  -- Piasters. The float the drawer STARTED with; expected = float + cash net.
  "opening_float" int NOT NULL DEFAULT 0,
  "counted_cash"  int,
  "expected_cash" int,
  "variance"      int,
  "note"          text,
  "created_at"    timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"    timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "center_shifts_opening_float_nonneg" CHECK ("opening_float" >= 0),
  -- A closed shift carries ALL its frozen figures; an open one carries none.
  CONSTRAINT "center_shifts_closed_shape" CHECK (
    ("status" = 'open'   AND "closed_at" IS NULL AND "closed_by" IS NULL
      AND "counted_cash" IS NULL AND "expected_cash" IS NULL AND "variance" IS NULL)
    OR
    ("status" = 'closed' AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL
      AND "counted_cash" IS NOT NULL AND "expected_cash" IS NOT NULL AND "variance" IS NOT NULL)
  )
);

-- ONE open drawer per staff member (Prisma cannot express partial uniques —
-- same raw-SQL pattern as teacher_assistants / center_staff).
CREATE UNIQUE INDEX "center_shifts_one_open_per_staff"
  ON "center_shifts" ("staff_user_id") WHERE "status" = 'open';

CREATE INDEX "center_shifts_center_id_opened_at_idx"
  ON "center_shifts" ("center_id", "opened_at" DESC);

-- RLS: tenant-isolated exactly like center_staff / team_notes (FORCE so the
-- owner role is subject to it too).
ALTER TABLE "center_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "center_shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "center_shifts"
  USING (rls_bypass() OR "center_id" = current_center_id())
  WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

-- The stamp: a payment recorded while its recorder has an open shift names
-- that shift. Nullable — a center that never opens shifts keeps working
-- exactly as today, and nothing pre-existing changes meaning.
ALTER TABLE "payments" ADD COLUMN "shift_id" uuid
  REFERENCES "center_shifts"("id") ON DELETE SET NULL;

CREATE INDEX "payments_shift_id_idx" ON "payments" ("shift_id")
  WHERE "shift_id" IS NOT NULL;

COMMENT ON TABLE "center_shifts" IS 'Counter drawer sessions (Phase 2, revenue-operations spec): open with a float, close against a physical count. Figures derive from payments.shift_id — never a second set of books.';
