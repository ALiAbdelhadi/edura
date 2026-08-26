-- Phase 4 sibling (revenue-operations spec, D4/D5) — the enum value alone.
-- ADD VALUE cannot be USED in the transaction that adds it, and the sibling
-- migration's rebuilt CHECK names this value — same isolation pattern as
-- 20260727100000_team_note_notification_types.
ALTER TYPE "payment_intent_purpose" ADD VALUE IF NOT EXISTS 'center_credit_topup';
