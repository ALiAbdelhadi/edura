-- =============================================================================
-- Real-time chat rebuild (1:1 conversations) + teacher assistants.
--
--  1. New `assistant` role value.
--  2. `teacher_assistants` — teacher↔assistant team membership.
--  3. `conversations` / `conversation_messages` replace the old
--     `message_threads` / `messages` pair. Exactly two participants, stored
--     canonically (user_a_id < user_b_id), per-side unread counters, and
--     per-message delivery state (sent → delivered → read) with a bigserial
--     `seq` as the authoritative order key.
--  4. Data migration: every 2-participant thread is copied over (dedup on the
--     canonical pair, keeping the most recent thread's counters and merging
--     ALL of the pair's messages). Migrated messages get status 'delivered'
--     (pre-rebuild data had no per-message state).
--  5. Old tables dropped.
--  6. RLS: `conversations` joins the center-scoped table set (nullable
--     center_id ⇒ platform-context only, same semantics as the old
--     message_threads policy). `conversation_messages` and
--     `teacher_assistants` carry no center_id and stay app-layer scoped via
--     participant checks, matching the old `messages` table's flagged note.
-- =============================================================================

-- AlterEnum (PG12+: allowed in a transaction as long as the new value is not
-- used before commit — this migration never writes the value).
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'assistant' AFTER 'teacher';

-- CreateEnum
CREATE TYPE "message_delivery_status" AS ENUM ('sent', 'delivered', 'read');

-- CreateTable
CREATE TABLE "teacher_assistants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "assistant_id" UUID NOT NULL,
    "title" TEXT,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_assistants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assistants_teacher_id_assistant_id_key"
    ON "teacher_assistants"("teacher_id", "assistant_id");
CREATE INDEX "teacher_assistants_assistant_id_idx"
    ON "teacher_assistants"("assistant_id");

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "center_id" UUID,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" TEXT,
    "last_message_sender_id" UUID,
    "a_unread_count" INTEGER NOT NULL DEFAULT 0,
    "b_unread_count" INTEGER NOT NULL DEFAULT 0,
    "a_last_read_at" TIMESTAMPTZ(6),
    "b_last_read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- Canonical 1:1 pair — also rules out self-conversations. (Prisma cannot model
-- CHECK constraints; app code canonicalizes before every lookup/insert.)
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_pair_canonical"
    CHECK ("user_a_id" < "user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user_a_id_user_b_id_key"
    ON "conversations"("user_a_id", "user_b_id");
CREATE INDEX "conversations_user_a_id_last_message_at_idx"
    ON "conversations"("user_a_id", "last_message_at" DESC);
CREATE INDEX "conversations_user_b_id_last_message_at_idx"
    ON "conversations"("user_b_id", "last_message_at" DESC);
CREATE INDEX "conversations_center_id_last_message_at_idx"
    ON "conversations"("center_id", "last_message_at" DESC);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "client_id" TEXT,
    "status" "message_delivery_status" NOT NULL DEFAULT 'sent',
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversation_id_client_id_key"
    ON "conversation_messages"("conversation_id", "client_id");
CREATE INDEX "conversation_messages_conversation_id_seq_idx"
    ON "conversation_messages"("conversation_id", "seq");
CREATE INDEX "conversation_messages_conversation_id_status_idx"
    ON "conversation_messages"("conversation_id", "status");

-- AddForeignKey
ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data migration: 2-participant threads → conversations (dedup per canonical
-- pair, most recent thread wins the denormalized state), then every message of
-- every thread of that pair → conversation_messages, in chronological order so
-- bigserial seq matches history.
-- ---------------------------------------------------------------------------
WITH ranked AS (
    SELECT
        t.*,
        LEAST(t.participant_ids[1], t.participant_ids[2])    AS ua,
        GREATEST(t.participant_ids[1], t.participant_ids[2]) AS ub,
        ROW_NUMBER() OVER (
            PARTITION BY LEAST(t.participant_ids[1], t.participant_ids[2]),
                         GREATEST(t.participant_ids[1], t.participant_ids[2])
            ORDER BY t.last_message_at DESC
        ) AS rn
    FROM "message_threads" t
    WHERE cardinality(t.participant_ids) = 2
      AND t.participant_ids[1] <> t.participant_ids[2]
)
INSERT INTO "conversations"
    (id, user_a_id, user_b_id, center_id, last_message_at, last_message_preview,
     a_unread_count, b_unread_count, created_at, updated_at)
SELECT
    r.id, r.ua, r.ub, r.center_id, r.last_message_at, r.last_message_body,
    COALESCE((r.unread_counts ->> r.ua::text)::int, 0),
    COALESCE((r.unread_counts ->> r.ub::text)::int, 0),
    r.created_at, r.updated_at
FROM ranked r
WHERE r.rn = 1;

INSERT INTO "conversation_messages"
    (id, conversation_id, sender_id, body, status, delivered_at, created_at)
SELECT
    m.id, c.id, m.sender_id, m.body, 'delivered', m.created_at, m.created_at
FROM "messages" m
JOIN "message_threads" t ON t.id = m.thread_id
JOIN "conversations" c
  ON c.user_a_id = LEAST(t.participant_ids[1], t.participant_ids[2])
 AND c.user_b_id = GREATEST(t.participant_ids[1], t.participant_ids[2])
WHERE cardinality(t.participant_ids) = 2
  AND t.participant_ids[1] <> t.participant_ids[2]
ORDER BY m.created_at, m.id;

-- Backfill last_message_sender_id from the migrated history.
UPDATE "conversations" c
SET last_message_sender_id = lm.sender_id
FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, sender_id
    FROM "conversation_messages"
    ORDER BY conversation_id, seq DESC
) lm
WHERE lm.conversation_id = c.id;

-- DropTable (threads with ≠2 participants — none are expected — die here too;
-- the old model was 1:1-in-practice, this is the enforced version of it).
DROP TABLE "messages";
DROP TABLE "message_threads";

-- ---------------------------------------------------------------------------
-- RLS: conversations joins the center-scoped set (FORCE so the owner is also
-- subject; edura_app is NOBYPASSRLS). NULL center_id rows are visible only
-- under the platform bypass GUC — exactly like the old message_threads policy.
-- ---------------------------------------------------------------------------
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
    USING (rls_bypass() OR "center_id" = current_center_id())
    WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

-- Runtime role privileges (new tables + the seq sequence used on INSERT).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "teacher_assistants", "conversations", "conversation_messages"
    TO "edura_app";
    GRANT USAGE, SELECT ON SEQUENCE "conversation_messages_seq_seq" TO "edura_app";
  END IF;
END $$;
