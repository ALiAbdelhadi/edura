-- Student Wallet: add 'wallet' as a ledger payment method (funding a
-- subscription/session from the student's own wallet balance — an internal
-- transfer). In its OWN migration because Postgres forbids USING a newly-added
-- enum value in the same transaction that added it; the next migration
-- (…_student_wallet) references it. The runner commits each migration separately.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'wallet';
