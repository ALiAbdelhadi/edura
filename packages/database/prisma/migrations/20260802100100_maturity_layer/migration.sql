-- ============================================================================
-- MATURITY LAYER (2026-08-02) — feature flags, the public contact inbox,
-- self-serve data exports, and the data-rights columns on the EXISTING
-- deletion queue.
--
-- ADDITIVE ONLY. Nothing is dropped, no column changes type, and every new
-- column is nullable or carries a default, so the migration is safe to deploy
-- ahead of the code that reads it.
--
-- THREE THINGS ARE LOAD-BEARING HERE:
--
-- 1. THERE IS STILL ONE DELETION QUEUE. `deletion_requests` already existed as
--    the CENTER-raised queue ("this center wants this member's account gone").
--    Data rights (قانون 151/2020 art. 2) needs a SELF-raised and a
--    GUARDIAN-raised path too. Those are the same request with a different
--    origin, reviewed by a different desk when the subject has no center — so
--    this migration WIDENS the existing table rather than adding a second one.
--    A second deletion table is exactly the C-04 failure mode: two paths that
--    disable an account, drifting apart.
--
-- 2. THE LEDGER IS NEVER DELETED, ONLY DETACHED FROM A NAME. `anonymized_at`
--    records when the PII scrub ran. The scrub rewrites `users` and the
--    profile rows; it does NOT touch transactions, payments, points_ledger,
--    session_settlements, invoices or payouts — those carry `REVOKE
--    UPDATE/DELETE` and are the accounting record Egyptian law requires us to
--    keep. The user ROW survives too (soft-delete), so every ledger foreign
--    reference still resolves; what stops existing is the name, the email,
--    the phone and the guardian contact.
--
-- 3. AN EXPORT IS THE USER'S OWN DATA, SO IT NEVER LEAVES THE DATABASE.
--    `data_export_requests.payload` holds the built export inline instead of
--    writing a file to object storage behind a guessable URL. There is no
--    public artifact to leak, and expiry is a column, not a bucket lifecycle
--    rule someone forgets to configure.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. FEATURE FLAGS — platform config, deliberately DEFAULT-CLOSED.
-- ---------------------------------------------------------------------------
-- A key that is absent from this table reads as OFF (see isFeatureEnabled).
-- That is the safe direction for a kill switch: a typo'd key, a row someone
-- deleted, or a database that has not been seeded yet all fail to "feature is
-- not available" rather than silently exposing something.
--
-- No center_id ⇒ platform-global config, same posture as commission_settings:
-- not tenant-isolated at the DB level, reached only through platformDb by a
-- super_admin-guarded route.
CREATE TABLE "feature_flags" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable machine key, e.g. 'receipts.pdf' — referenced from code, never renamed.
  "key"         text NOT NULL,
  "description" text,
  "enabled"     boolean NOT NULL DEFAULT false,
  -- Free-text note for the operator who flipped it last ("off during Paymob cutover").
  "note"        text,
  "updated_by"  uuid,
  "created_at"  timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"  timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "feature_flags_key_key" UNIQUE ("key")
);

COMMENT ON TABLE "feature_flags" IS
  'Platform-global feature switches. DEFAULT-CLOSED: a key with no row reads as disabled. Flipped only by super_admin, every flip audited as feature_flag.updated.';

-- ---------------------------------------------------------------------------
-- 2. CONTACT SUBMISSIONS — the public contact form's store.
-- ---------------------------------------------------------------------------
-- WRITTEN BY the marketing site (workstream 3), READ ONLY from the back office.
-- The table is defined here because the back-office viewer is what gives the
-- rows a purpose; the insert side is one INSERT against this shape.
--
-- `status` is triage state, not moderation: nothing here is ever shown to
-- another user, so there is no publish/reject decision to make.
CREATE TYPE "contact_submission_status" AS ENUM ('new', 'handled', 'spam');

CREATE TABLE "contact_submissions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"         text NOT NULL,
  "email"        text,
  "phone"        text,
  "subject"      text,
  "message"      text NOT NULL,
  "locale"       "locale" NOT NULL DEFAULT 'ar',
  -- Which form/page produced it ('landing', 'pricing', 'centers'…), for routing.
  "source"       text,
  -- Set when the sender happened to be signed in; NULL for an anonymous visitor.
  "user_id"      uuid,
  "ip_address"   inet,
  "user_agent"   text,
  "status"       "contact_submission_status" NOT NULL DEFAULT 'new',
  "handled_by"   uuid,
  "handled_at"   timestamptz(6),
  "handled_note" text,
  "created_at"   timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"   timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX "contact_submissions_status_created_at_idx"
  ON "contact_submissions" ("status", "created_at" DESC);
CREATE INDEX "contact_submissions_created_at_idx"
  ON "contact_submissions" ("created_at" DESC);
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions" ("email");

COMMENT ON TABLE "contact_submissions" IS
  'Public contact-form submissions. Written by the marketing site, READ-ONLY from the back office apart from triage status. Not tenant-scoped — these arrive before anyone belongs to a center.';

-- ---------------------------------------------------------------------------
-- 3. DATA EXPORT REQUESTS — self-serve "export my data".
-- ---------------------------------------------------------------------------
CREATE TYPE "data_export_status" AS ENUM ('pending', 'processing', 'ready', 'failed', 'expired');

CREATE TABLE "data_export_requests" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Who asked. Equals user_id for a self-serve request; a PARENT's id when a
  -- guardian exports a minor child's data (same authority that lets them pay
  -- for and oversee that child).
  "requested_by" uuid NOT NULL,
  "status"       "data_export_status" NOT NULL DEFAULT 'pending',
  "requested_at" timestamptz(6) NOT NULL DEFAULT now(),
  "started_at"   timestamptz(6),
  "completed_at" timestamptz(6),
  -- After this instant the payload is dropped and the row reads as 'expired'.
  -- A copy of your whole account sitting around forever is itself a risk.
  "expires_at"   timestamptz(6),
  "payload"      jsonb,
  "byte_size"    integer,
  "error"        text,
  "created_at"   timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"   timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX "data_export_requests_user_id_requested_at_idx"
  ON "data_export_requests" ("user_id", "requested_at" DESC);
-- The worker's claim query: oldest pending first.
CREATE INDEX "data_export_requests_status_requested_at_idx"
  ON "data_export_requests" ("status", "requested_at");

-- At most ONE unfinished export per subject. Enforced by the DATABASE rather
-- than by a service check, because the cheap way to DoS an export worker is to
-- press the button forty times.
CREATE UNIQUE INDEX "data_export_requests_one_in_flight"
  ON "data_export_requests" ("user_id")
  WHERE "status" IN ('pending', 'processing');

COMMENT ON TABLE "data_export_requests" IS
  'Self-serve data export (قانون 151/2020). Payload is stored inline and expires — there is no file in object storage and no public URL to leak.';

-- ---------------------------------------------------------------------------
-- 4. DATA-RIGHTS COLUMNS ON THE EXISTING DELETION QUEUE
-- ---------------------------------------------------------------------------
-- Existing rows keep their exact meaning: origin 'center' (set by the DEFAULT
-- and by the backfill below) is what every pre-existing row was.
CREATE TYPE "deletion_origin" AS ENUM ('self', 'guardian', 'center');

ALTER TABLE "deletion_requests"
  -- Who raised it. NULL only for historical rows raised before this column
  -- existed, which were all center-raised.
  ADD COLUMN "requested_by"   uuid,
  ADD COLUMN "origin"         "deletion_origin" NOT NULL DEFAULT 'center',
  -- Set when the PII scrub has run. NULL on an approved row means the account
  -- is soft-deleted but still carries a name — a state the admin queue shows,
  -- so a half-finished erasure cannot hide.
  ADD COLUMN "anonymized_at"  timestamptz(6),
  -- What the scrub actually touched, for the audit trail.
  ADD COLUMN "anonymized_by"  uuid,
  -- The subject's own note ("I no longer use the platform"), distinct from
  -- review_note which is the REVIEWER's.
  ADD COLUMN "requester_note" text;

COMMENT ON COLUMN "deletion_requests"."origin" IS
  'self = the account holder asked; guardian = an approved parent asked for their minor child; center = raised by the owning center (the original, and only, pre-2026-08-02 meaning).';

-- A subject may have at most ONE open deletion request. Same reasoning as the
-- export index: without it, a refresh-happy user creates a queue of duplicates
-- an admin then has to reject one by one.
CREATE UNIQUE INDEX "deletion_requests_one_open_per_user"
  ON "deletion_requests" ("user_id")
  WHERE "status" = 'pending';

CREATE INDEX "deletion_requests_status_requested_at_idx"
  ON "deletion_requests" ("status", "requested_at" DESC);

-- ---------------------------------------------------------------------------
-- 5. Runtime role grants (new tables)
-- ---------------------------------------------------------------------------
-- Note what is NOT granted: nothing here loosens a money table, and the
-- existing REVOKEs on transactions / points_ledger / session_settlements /
-- audit_logs are untouched. The anonymization service runs as `edura_app` like
-- everything else, so it CANNOT rewrite a ledger row even if it tried.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "feature_flags", "contact_submissions", "data_export_requests"
      TO "edura_app";
  END IF;
END $$;
