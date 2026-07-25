-- H-04 — "blacklist side effects are not reversed when the blacklist is lifted".
--
-- Blacklisting a student unenrolled them; lifting the blacklist cleared the
-- gating flag and left every enrollment `unenrolled`. The gate was reversible,
-- its cascade was not, so a blacklist silently destroyed enrollment history.
--
-- The fix needs to answer ONE question at lift time: *which* removals did THIS
-- blacklist cause? Not "which rows have an unenrolled_at near the blacklist
-- timestamp" — wall-clock proximity sweeps in unrelated departures and goes
-- ambiguous the second time the same student is blacklisted. And not a boolean
-- on `enrollments` either: it cannot survive a second blacklist/lift cycle,
-- cannot record WHY a restore was skipped, and does not generalise past
-- enrollments.
--
-- So: an append-only JOURNAL. One row per entity a blacklist actually touched,
-- keyed to the blacklist_entries.id that touched it. Reversal replays the
-- journal instead of re-deriving anything, which makes level scoping fall out
-- for free (a center entry only ever journaled that center's enrollments) and
-- makes repeat cycles independent (each entry owns its own rows).
--
-- Written in the SAME transaction as the unenrollment; stamped in the SAME
-- transaction as the lift. Roster-only: nothing here reads or writes money.

CREATE TABLE blacklist_cascade_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The blacklist_entries row that caused this removal. Loose ref (same style
  -- as transactions.lesson_id) — blacklist entries are never hard-deleted.
  entry_id    uuid        NOT NULL,
  target_id   uuid        NOT NULL,              -- the blacklisted user
  -- 'enrollment' is the only kind today; the column is the seam for the
  -- center-admin-suspension cascade tracked as a separate follow-up finding.
  entity_type text        NOT NULL,
  entity_id   uuid        NOT NULL,              -- enrollments.id
  center_id   uuid,                              -- scope snapshot; NULL = teacher-direct course
  course_id   uuid        NOT NULL,
  prev_status text        NOT NULL,              -- status the row held before the cascade
  applied_at  timestamptz NOT NULL DEFAULT now(),
  -- Reversal stamp. NULL = still outstanding; a lift only ever considers those,
  -- which is what makes the reversal idempotent and cycle-safe.
  reversed_at timestamptz,
  reversal    text,
  reversed_by uuid,

  CONSTRAINT blacklist_cascade_actions_entity_uniq UNIQUE (entry_id, entity_type, entity_id),
  CONSTRAINT blacklist_cascade_actions_entity_type_chk
    CHECK (entity_type IN ('enrollment')),
  -- The outcome vocabulary, DB-enforced so a typo cannot silently become a new
  -- verdict. restored*/skipped* are the only two shapes.
  CONSTRAINT blacklist_cascade_actions_reversal_chk
    CHECK (reversal IS NULL OR reversal IN (
      'restored',                  -- put back exactly as it was
      'restored_over_capacity',    -- put back although the course is now full (seat was theirs)
      'skipped_course_ended',      -- course ended/cancelled while they were out
      'skipped_already_active',    -- re-enrolled manually in the meantime (same row)
      'skipped_duplicate',         -- re-enrolled manually in the meantime (new row)
      'skipped_still_blacklisted', -- another active blacklist still covers this scope
      'skipped_missing'            -- enrollment row no longer exists
    )),
  -- reversal and reversed_at are set together, never one without the other.
  CONSTRAINT blacklist_cascade_actions_reversal_shape_chk
    CHECK ((reversed_at IS NULL) = (reversal IS NULL))
);

-- The lift's only hot query: outstanding rows for one entry.
CREATE INDEX blacklist_cascade_actions_open_idx
  ON blacklist_cascade_actions (entry_id) WHERE reversed_at IS NULL;
CREATE INDEX blacklist_cascade_actions_target_idx
  ON blacklist_cascade_actions (target_id, applied_at DESC);

-- Tenant isolation (standard recipe). center_id is NULL for teacher-direct
-- enrollments, which are platform-scope by construction — a center principal
-- must not see them, so a NULL center_id is visible only under rls_bypass().
-- Every read/write on this table today runs through platformDb (rls_bypass),
-- so the policy is defence in depth, not the enforcement path.
ALTER TABLE blacklist_cascade_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist_cascade_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blacklist_cascade_actions
  USING (rls_bypass() OR center_id = current_center_id())
  WITH CHECK (rls_bypass() OR center_id = current_center_id());

-- Append-and-stamp for the runtime role: INSERT + SELECT + UPDATE (the reversal
-- stamp is the only mutation), never DELETE — the journal is the audit record of
-- what a blacklist did and what lifting it gave back.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE ON blacklist_cascade_actions TO "edura_app";
    REVOKE DELETE ON blacklist_cascade_actions FROM "edura_app";
  END IF;
END $$;
