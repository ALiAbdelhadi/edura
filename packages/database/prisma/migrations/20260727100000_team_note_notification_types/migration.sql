-- Team notes (approved 2026-07-27): an internal to-do board for one team
-- (center owner + center_staff, or teacher + assistants). Two notification
-- moments: a new note tells the rest of the team; a status flip (done /
-- declined) tells the note's author.
--
-- ISOLATED migration: ADD VALUE on an EXISTING enum must be committed before
-- anything references it (same discipline as 20260723120000_blacklist_restore_
-- notification_type). Postgres type name is "notification_type" (Prisma @@map).
ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'team_note_created' AFTER 'chat_report_filed';
ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'team_note_status_changed' AFTER 'team_note_created';
