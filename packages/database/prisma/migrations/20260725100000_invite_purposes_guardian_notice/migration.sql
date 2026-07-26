-- Additive enum values ONLY.
--
-- These live in their own migration on purpose: Postgres refuses to USE a new
-- enum value inside the same transaction that added it, so anything that
-- inserts an 'assistant_invite' row must run in a LATER migration/transaction.

ALTER TYPE "invite_purpose" ADD VALUE IF NOT EXISTS 'assistant_invite';
ALTER TYPE "invite_purpose" ADD VALUE IF NOT EXISTS 'center_staff_invite';

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'guardian_contact_required';
