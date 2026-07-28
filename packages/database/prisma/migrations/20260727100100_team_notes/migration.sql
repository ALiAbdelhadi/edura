-- Team notes (approved 2026-07-27) — a lightweight internal TO-DO board for
-- exactly one team:
--   * a CENTER's team  -> center_id set  (owner/center_admins + active center_staff)
--   * a TEACHER's team -> teacher_id set (teacher + active assistants)
-- The CHECK below enforces exactly-one-scope at the DB level.
--
-- This is deliberately NOT messaging: the chat matrix has no staff<->staff or
-- assistant<->assistant edge and stays untouched. Notes are non-conversational
-- (status open/done/declined + read receipts), so they need none of the
-- child-safety machinery — every possible participant is an adult staff role.
--
-- NOTE: CREATE TYPE for a NEW enum is fine in-file — only ADD VALUE on an
-- EXISTING type needs its own isolated migration (see the sibling migration
-- 20260727100000_team_note_notification_types).

CREATE TYPE "team_note_status" AS ENUM ('open', 'done', 'declined');

CREATE TABLE "team_notes" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id"            uuid,
  "teacher_id"           uuid,
  "author_user_id"       uuid NOT NULL,
  "body"                 text NOT NULL,
  "pinned"               boolean NOT NULL DEFAULT false,
  "status"               "team_note_status" NOT NULL DEFAULT 'open',
  "status_changed_by_id" uuid,
  "status_changed_at"    timestamptz(6),
  "deleted_at"           timestamptz(6),
  "created_at"           timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"           timestamptz(6) NOT NULL DEFAULT now(),
  -- Exactly ONE scope: a note belongs to a center team XOR a teacher team.
  CONSTRAINT "team_notes_exactly_one_scope"
    CHECK (("center_id" IS NULL) <> ("teacher_id" IS NULL))
);

CREATE INDEX "team_notes_center_id_created_at_idx"
  ON "team_notes" ("center_id", "created_at" DESC);
CREATE INDEX "team_notes_teacher_id_created_at_idx"
  ON "team_notes" ("teacher_id", "created_at" DESC);

-- Read receipts: one row per team member who has SEEN a note (upserted when
-- the board is opened). Powers the "who read this" line on each note.
CREATE TABLE "team_note_reads" (
  "id"      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "note_id" uuid NOT NULL REFERENCES "team_notes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "read_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "team_note_reads_note_id_user_id_key" UNIQUE ("note_id", "user_id")
);

CREATE INDEX "team_note_reads_user_id_idx" ON "team_note_reads" ("user_id");

-- RLS: center-scoped rows get the same tenant_isolation policy as center_staff
-- (FORCE so the owner role is subject to it too). Teacher rows have a NULL
-- center_id and are therefore INVISIBLE to a tenant-bound session — correct,
-- since a center actor never reads a teacher board; the teacher/assistant path
-- runs under platform context and is app-guarded (same posture as
-- teacher_assistants, which has no center_id either).
ALTER TABLE "team_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "team_notes"
  USING (rls_bypass() OR "center_id" = current_center_id())
  WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

-- team_note_reads carries no center_id (a receipt row is meaningless without
-- its note), so like teacher_assistants it is NOT tenant-isolated at the DB
-- level — the service only ever touches receipts through a note it already
-- authorized. Stated honestly rather than pretending a guarantee.

COMMENT ON TABLE "team_notes" IS 'Internal team to-do notes: center team (center_id) XOR teacher team (teacher_id). Status open/done/declined, pinning, soft-delete, read receipts in team_note_reads. NOT messaging — the chat matrix is untouched.';
