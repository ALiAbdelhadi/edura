-- =============================================================================
-- RLS policies, tenant-context helpers, and validation CHECK constraints.
-- Applied AFTER the init migration. Prisma cannot model these, so they live in
-- raw SQL. Tenant isolation here is the DB-enforced layer; app-layer
-- requireRole/requireCenterScope stays on top as defense-in-depth.
-- =============================================================================

-- gen_random_uuid() is native in PG13+, but ensure pgcrypto for older paths.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenant-context helpers (read the per-transaction GUCs set by src/client.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_center_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_center_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION rls_bypass() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.bypass_rls', true), 'off') = 'on' $$;

-- ---------------------------------------------------------------------------
-- Validation CHECK constraints (PRD §8.3). API layer enforces these too; these
-- are the last line of defense so bad data cannot land even via direct SQL.
-- Money bounds: 0 .. 99,999,900 piasters (999,999 EGP).
-- ---------------------------------------------------------------------------
ALTER TABLE "reviews"      ADD CONSTRAINT "reviews_rating_range"   CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "courses"      ADD CONSTRAINT "courses_price_bounds"   CHECK ("price" BETWEEN 0 AND 99999900);
ALTER TABLE "expenses"     ADD CONSTRAINT "expenses_amount_bounds" CHECK ("amount" BETWEEN 0 AND 99999900);
ALTER TABLE "payments"     ADD CONSTRAINT "payments_amount_bounds" CHECK ("amount" BETWEEN -99999900 AND 99999900);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_bounds" CHECK ("amount" BETWEEN 0 AND 99999900);
ALTER TABLE "invoices"     ADD CONSTRAINT "invoices_amounts_nonneg" CHECK (
  coalesce("subtotal", 0) >= 0 AND coalesce("commission", 0) >= 0 AND coalesce("net_amount", 0) >= 0
);
ALTER TABLE "payouts"      ADD CONSTRAINT "payouts_amounts_nonneg" CHECK (
  coalesce("gross_amount", 0) >= 0 AND coalesce("commission", 0) >= 0 AND coalesce("net_payable", 0) >= 0
);
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_satisfaction_range"
  CHECK ("satisfaction" IS NULL OR "satisfaction" BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- Row-Level Security. Every center-scoped table:
--   ENABLE + FORCE RLS (FORCE so the table owner — which Prisma connects as —
--   is also subject to policies), then a tenant_isolation policy.
-- Access is granted when EITHER the platform bypass flag is set (super_admin /
-- accountant / cross-tenant jobs via withPlatformContext) OR the row's
-- center_id equals the current tenant (via withTenant). NULL center_id rows
-- (platform-level: e.g. platform blacklist, SA audit) are visible only under
-- bypass — which is the intended behavior.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  -- Tables whose tenant key is a column named center_id:
  center_tables text[] := ARRAY[
    'center_admin_profiles', 'center_student_rosters', 'center_teacher_affiliations',
    'rooms', 'courses', 'enrollments', 'enrollment_requests', 'attendance_records',
    'grades', 'materials', 'classroom_bookings', 'payments', 'expenses',
    'transactions', 'invoices', 'payouts', 'blacklist_entries', 'audit_logs',
    'deletion_requests', 'message_threads', 'reviews'
  ];
BEGIN
  FOREACH t IN ARRAY center_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (rls_bypass() OR "center_id" = current_center_id()) WITH CHECK (rls_bypass() OR "center_id" = current_center_id())',
      t
    );
  END LOOP;
END $$;

-- The centers table keys on its own id rather than a center_id column.
ALTER TABLE "centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "centers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "centers"
  USING (rls_bypass() OR "id" = current_center_id())
  WITH CHECK (rls_bypass() OR "id" = current_center_id());

-- NOTE (flagged): `sessions`, `grade_scores`, `messages`, `notifications`,
-- `users`, and the profile/token tables have NO center_id column and are NOT
-- RLS-protected here — they remain app-layer scoped (sessions via its course,
-- messages via thread, notifications/users via ownership). Closing the
-- `sessions` gap requires denormalizing center_id onto sessions; deferred to
-- the ETL phase and tracked in the changelog.
