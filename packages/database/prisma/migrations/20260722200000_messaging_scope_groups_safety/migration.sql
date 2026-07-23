-- =============================================================================
-- Messaging v2 — relationship-scoped messaging, group channels, child safety.
--
-- ADDITIVE ONLY. Nothing is dropped, no column is narrowed, no existing row is
-- rewritten. Every new column is nullable or has a default, so deploying this
-- ahead of the application code is safe.
--
--  1. student_profiles: date_of_birth (+ verified_at/by) — the ONLY inputs to
--     the default-minor rule. Absent/unverified/under-18 ⇒ MINOR.
--  2. conversation_messages.deleted_at/by + conversations.is_demo.
--  3. conversation_groups / group_members / group_messages — derived-membership
--     announcement channels.
--  4. conversation_blocks / conversation_reports — block & report.
--  5. Two new notification_type values.
--  6. RLS + edura_app grants matching the existing chat tables' pattern.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Child-safety: date of birth, and whether it has been VERIFIED.
--    No backfill: every existing student stays NULL ⇒ minor ⇒ oversight ON.
--    That is the intended default, not a gap.
-- ---------------------------------------------------------------------------
ALTER TABLE "student_profiles"
    ADD COLUMN IF NOT EXISTS "date_of_birth" DATE,
    ADD COLUMN IF NOT EXISTS "date_of_birth_verified_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "date_of_birth_verified_by" UUID;

-- A verification stamp is meaningless without the date it verifies.
ALTER TABLE "student_profiles"
    ADD CONSTRAINT "student_profiles_dob_verification_shape"
    CHECK ("date_of_birth_verified_at" IS NULL OR "date_of_birth" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. Retention: soft-delete only (body is never erased) + demo flag.
-- ---------------------------------------------------------------------------
ALTER TABLE "conversation_messages"
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "conversations"
    ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3. Group channels.
-- ---------------------------------------------------------------------------
CREATE TYPE "group_kind" AS ENUM ('course', 'session', 'center_announcement');
CREATE TYPE "group_post_policy" AS ENUM ('owner_only', 'members');

CREATE TABLE "conversation_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "group_kind" NOT NULL,
    "course_id" UUID,
    "session_id" UUID,
    "center_id" UUID,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "post_policy" "group_post_policy" NOT NULL DEFAULT 'owner_only',
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" TEXT,
    "last_message_sender_id" UUID,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_groups_pkey" PRIMARY KEY ("id")
);

-- Membership is DERIVED, so exactly one source relation must match `kind`.
-- A group with no valid source could never derive members — reject it here
-- rather than let it exist as an unreachable channel.
ALTER TABLE "conversation_groups"
    ADD CONSTRAINT "conversation_groups_source_shape" CHECK (
        (kind = 'course'              AND course_id  IS NOT NULL AND session_id IS NULL)
     OR (kind = 'session'             AND session_id IS NOT NULL AND course_id  IS NOT NULL)
     OR (kind = 'center_announcement' AND center_id  IS NOT NULL AND course_id  IS NULL
                                       AND session_id IS NULL)
    );

-- One channel per source relation (partial, because the source column varies).
CREATE UNIQUE INDEX "conversation_groups_course_key"
    ON "conversation_groups"("course_id") WHERE kind = 'course';
CREATE UNIQUE INDEX "conversation_groups_session_key"
    ON "conversation_groups"("session_id") WHERE kind = 'session';
CREATE UNIQUE INDEX "conversation_groups_center_key"
    ON "conversation_groups"("center_id") WHERE kind = 'center_announcement';

CREATE INDEX "conversation_groups_owner_id_last_message_at_idx"
    ON "conversation_groups"("owner_id", "last_message_at" DESC);
CREATE INDEX "conversation_groups_center_id_last_message_at_idx"
    ON "conversation_groups"("center_id", "last_message_at" DESC);
CREATE INDEX "conversation_groups_course_id_idx"  ON "conversation_groups"("course_id");
CREATE INDEX "conversation_groups_session_id_idx" ON "conversation_groups"("session_id");

-- Fanout/unread CACHE. Never the authorization source: assertGroupAccess
-- re-derives live per user, so a stale row here grants nothing.
CREATE TABLE "group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "role" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "last_read_at" TIMESTAMPTZ(6),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_members_group_id_user_id_key"
    ON "group_members"("group_id", "user_id");
CREATE INDEX "group_members_user_id_left_at_idx"
    ON "group_members"("user_id", "left_at");

CREATE TABLE "group_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "client_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_messages_group_id_client_id_key"
    ON "group_messages"("group_id", "client_id");
CREATE INDEX "group_messages_group_id_seq_idx" ON "group_messages"("group_id", "seq");

ALTER TABLE "group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id")
    REFERENCES "conversation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_messages"
    ADD CONSTRAINT "group_messages_group_id_fkey" FOREIGN KEY ("group_id")
    REFERENCES "conversation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Block & report.
-- ---------------------------------------------------------------------------
CREATE TYPE "report_category" AS ENUM
    ('harassment', 'spam', 'inappropriate', 'safety_concern', 'other');
CREATE TYPE "report_status" AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

CREATE TABLE "conversation_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "conversation_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_blocks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "conversation_blocks"
    ADD CONSTRAINT "conversation_blocks_not_self" CHECK ("blocker_id" <> "blocked_id");

-- One ACTIVE block per (blocker, blocked); unblocking sets removed_at, and a
-- later re-block inserts a fresh row (full history retained).
CREATE UNIQUE INDEX "conversation_blocks_active_key"
    ON "conversation_blocks"("blocker_id", "blocked_id") WHERE "removed_at" IS NULL;
CREATE INDEX "conversation_blocks_blocker_id_removed_at_idx"
    ON "conversation_blocks"("blocker_id", "removed_at");
CREATE INDEX "conversation_blocks_blocked_id_removed_at_idx"
    ON "conversation_blocks"("blocked_id", "removed_at");

CREATE TABLE "conversation_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "group_id" UUID,
    "message_id" UUID,
    "category" "report_category" NOT NULL,
    "details" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "involves_minor" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversation_reports_status_involves_minor_created_at_idx"
    ON "conversation_reports"("status", "involves_minor", "created_at" DESC);
CREATE INDEX "conversation_reports_reported_user_id_idx"
    ON "conversation_reports"("reported_user_id");
CREATE INDEX "conversation_reports_reporter_id_idx"
    ON "conversation_reports"("reporter_id");

-- ---------------------------------------------------------------------------
-- 5. Notification types for group posts and filed reports.
-- ---------------------------------------------------------------------------
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'chat_group_message';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'chat_report_filed';

-- ---------------------------------------------------------------------------
-- 6. RLS — same pattern as `conversations`: center-scoped tables join the
--    tenant policy; the tables with no center_id stay app-layer scoped through
--    the membership/participant checks in chat-scope.ts (matching the existing
--    conversation_messages precedent). FORCE so the table owner is subject too
--    (edura_app is NOBYPASSRLS).
-- ---------------------------------------------------------------------------
ALTER TABLE "conversation_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversation_groups"
    USING (rls_bypass() OR "center_id" = current_center_id())
    WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "conversation_groups", "group_members", "group_messages",
      "conversation_blocks", "conversation_reports"
    TO "edura_app";
    GRANT USAGE, SELECT ON SEQUENCE "group_messages_seq_seq" TO "edura_app";
  END IF;
END $$;
