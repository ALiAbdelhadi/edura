-- Step 8: assistant delegation.
-- 1. Enforce approved decision #9: an assistant serves EXACTLY ONE teacher.
--    (Probed 2026-07-20: zero active double-links, safe to apply directly.)
--    Soft-revoked rows (removed_at set) never block relinking.
CREATE UNIQUE INDEX teacher_assistants_one_active_teacher_per_assistant
  ON teacher_assistants (assistant_id)
  WHERE removed_at IS NULL;

-- 2. On-behalf-of attribution for delegated actions:
--    "assistant X (actor_id) on behalf of teacher Y (on_behalf_of)".
ALTER TABLE audit_logs ADD COLUMN on_behalf_of uuid;
CREATE INDEX audit_logs_on_behalf_of_idx ON audit_logs (on_behalf_of);
