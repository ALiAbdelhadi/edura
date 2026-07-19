-- Step 7: new invite purpose for the tokenized walk-in onboarding link.
-- ISOLATED migration: a new enum value must be committed before any other
-- statement uses it (same discipline as 20260719230000).

ALTER TYPE invite_purpose ADD VALUE IF NOT EXISTS 'walk_in_onboarding';
