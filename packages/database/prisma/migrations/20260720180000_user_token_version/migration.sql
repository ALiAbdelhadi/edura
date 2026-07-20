-- L1: server-side session revocation for stateless 30-day JWTs.
-- Every issued token records this value; the NextAuth jwt callback rejects any
-- token whose recorded version != the current column value. Bumped on password
-- reset/change so an attacker's pre-existing session is invalidated the moment
-- the real owner resets — while a fresh login (which reads the new value) works.
-- Backfills every existing row to 0, matching the tokens already in the wild
-- (which carry no version yet and are treated as 0), so this migration does NOT
-- log anyone out on deploy.
ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0;
