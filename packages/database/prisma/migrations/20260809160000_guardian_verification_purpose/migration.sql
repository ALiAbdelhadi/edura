-- Guardian email verification — the new invite purpose.
--
-- OWN FILE ON PURPOSE: Postgres cannot USE a new enum value in the same
-- transaction that adds it, so the value lands here and the columns that read
-- it land in the next migration (same precedent as
-- 20260725100000_invite_purposes_guardian_notice and
-- 20260727110000_parent_wallet_topup_purpose).
--
-- THIS PURPOSE IS DELIBERATELY NOT CLAIMABLE. `CLAIMABLE` in
-- services/invites/invite-token.ts maps a purpose to the exactly-one ROLE a
-- token of that purpose may resolve into — it mints a SESSION. A guardian is
-- not a user of this platform, and a link that signed them in would hand a
-- session to whoever holds a child's guardian address. A token of this purpose
-- can only ever flip one timestamp; see the verify endpoint.

ALTER TYPE invite_purpose ADD VALUE IF NOT EXISTS 'guardian_email_verification';
