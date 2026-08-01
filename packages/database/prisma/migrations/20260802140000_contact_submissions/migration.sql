-- Public contact-form submissions (conversion layer, 2026-08-02). Additive only.
--
-- ── WHY THIS MIGRATION IS IDEMPOTENT ────────────────────────────────────────
-- The shared DEV database already carries this table: a parallel workstream
-- applied `20260802100000_maturity_enums` / `20260802100100_maturity_layer`
-- there on 2026-08-01, but those migration FILES are committed to no branch
-- (verified across every local and remote ref). So the schema existed in one
-- environment and in zero repositories — which meant `POST /api/v1/contact`
-- would have 500'd on production and on any freshly built environment.
--
-- This file closes that hole. It is written IF NOT EXISTS throughout and
-- reproduces the live dev shape COLUMN FOR COLUMN, so:
--   * on dev it is a no-op that simply records itself as applied;
--   * on production / a fresh environment it creates the table;
--   * if the other workstream later commits its own version, the two describe
--     the same object and resolving the merge is deleting one of them — not
--     reconciling two different tables that both already hold rows.
--
-- The `locale` enum is NOT created here: it predates this work (users.locale,
-- subjects.language) and is already modelled as `enum Locale` in schema.prisma.
--
-- Platform-scoped, NOT tenant data: a submission arrives from someone with no
-- account and no center, so there is no center_id to isolate on and no RLS
-- policy — the same posture commission_settings takes. Rows are read from the
-- back office only; apps/www never reads them back and the POST returns no id.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_submission_status') THEN
    CREATE TYPE "contact_submission_status" AS ENUM ('new', 'handled', 'spam');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "contact_submissions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"         text NOT NULL,
  "email"        text,
  "phone"        text,
  "subject"      text,
  "message"      text NOT NULL,
  "locale"       "locale" NOT NULL DEFAULT 'ar',
  "source"       text,
  "user_id"      uuid,
  -- A real address, not a hash: the column is `inet` in the live shape and the
  -- back-office queue needs it for spam triage. It is written only for public
  -- form posts and never joined to an identity.
  "ip_address"   inet,
  "user_agent"   text,
  "status"       "contact_submission_status" NOT NULL DEFAULT 'new',
  "handled_by"   uuid,
  "handled_at"   timestamptz(6),
  "handled_note" text,
  "created_at"   timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"   timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contact_submissions_status_created_at_idx"
  ON "contact_submissions" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "contact_submissions_created_at_idx"
  ON "contact_submissions" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "contact_submissions_email_idx"
  ON "contact_submissions" ("email");

-- Runtime role grants (repo convention: edura_app gets explicit grants).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "contact_submissions" TO "edura_app";
  END IF;
END $$;

COMMENT ON TABLE "contact_submissions" IS 'Public contact-form submissions. Platform-scoped (no center_id, no RLS) — a sender has no account yet. Written by apps/www POST /api/v1/contact; read from the back office.';
