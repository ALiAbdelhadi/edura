-- =============================================================================
-- `teacher_invite` — the claim purpose an OFF-SYSTEM teacher uses when they
-- decide to join the platform after all.
--
-- ITS OWN FILE, on purpose: Postgres cannot USE a new enum value inside the
-- transaction that adds it, so ALTER TYPE ... ADD VALUE always ships alone and
-- the migration that reads the value comes after it. Same shape as
-- 20260725100000_invite_purposes_guardian_notice and
-- 20260727110000_parent_wallet_topup_purpose.
--
-- This reuses the PROVEN claim kernel (invite_tokens + the better-auth
-- invite-token plugin, five gates) rather than inventing a teacher-specific
-- flow. Note that the pre-existing `teacher_activation` value is NOT this: it
-- is minted by roster.inviteTeacher and has never had a consumer, so building
-- the conversion path on it would have handed centers a link nobody can open.
--
-- ROLLBACK: Postgres cannot remove an enum value. See rollback.sql.
-- =============================================================================

ALTER TYPE invite_purpose ADD VALUE IF NOT EXISTS 'teacher_invite';
