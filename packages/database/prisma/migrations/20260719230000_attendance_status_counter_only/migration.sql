-- Step 6 (part 1 of 2): the distinct "passed the counter, never reached the
-- classroom door" status. ISOLATED in its own migration so the enum value is
-- committed before anything references it (ADD VALUE inside a transaction is
-- legal on PG12+, but the value is unusable until commit — keeping it alone
-- makes the ordering bulletproof).
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'counter_only';
