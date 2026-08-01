-- ============================================================================
-- better-auth foundation (next-auth → better-auth migration, 2026-08-01)
-- ----------------------------------------------------------------------------
-- ADDITIVE ONLY. Introduces DB-backed auth sessions (replacing next-auth's
-- stateless 30-day JWTs), the better-auth credential-account mirror, the
-- verification store, and TOTP two-factor rows — plus the user columns the
-- twoFactor/admin plugins expect.
--
-- Invariants preserved:
--   * users.password_hash stays the SINGLE SOURCE OF TRUTH for credentials.
--     auth_accounts.password (providerId='credential') is a mirror kept in
--     sync by credentialSyncExtension; the backfill script creates the
--     initial rows. Existing bcrypt hashes verify as-is — no forced resets.
--   * `sessions` (the live-class engine) is untouched; the auth table is
--     deliberately named auth_sessions.
--   * banned/ban_reason/ban_expires belong to the better-auth admin plugin
--     and are DISTINCT from users.status — C-03 (status='active' checked on
--     every session read) remains the authoritative suspension gate.
--
-- RLS posture: like `users` and the token tables, these tables carry no
-- center_id and are NOT tenant-isolated at the DB level — they are reached
-- only through better-auth (app-layer scoped by user ownership).
-- ============================================================================

-- 1. User columns for better-auth core + twoFactor + admin plugins ----------
ALTER TABLE "users"
  ADD COLUMN "image"              text,
  ADD COLUMN "two_factor_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "banned"             boolean NOT NULL DEFAULT false,
  ADD COLUMN "ban_reason"         text,
  ADD COLUMN "ban_expires"        timestamptz(6);

-- 2. DB-backed auth sessions ------------------------------------------------
CREATE TABLE "auth_sessions" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token"           text NOT NULL,
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at"      timestamptz(6) NOT NULL,
  "created_at"      timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"      timestamptz(6) NOT NULL,
  "ip_address"      text,
  "user_agent"      text,
  "impersonated_by" text,
  -- session-scoped center claim (resolved at sign-in; mirror of the old JWT
  -- centerId claim — authoritative staff revocation stays requireCenterActor)
  "center_id"       uuid,
  CONSTRAINT "auth_sessions_token_key" UNIQUE ("token")
);
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");

-- 3. Credential-account mirror (+ future OAuth slots, unused today) ---------
CREATE TABLE "auth_accounts" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"               text NOT NULL,
  "provider_id"              text NOT NULL,
  "user_id"                  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "password"                 text,
  "access_token"             text,
  "refresh_token"            text,
  "id_token"                 text,
  "access_token_expires_at"  timestamptz(6),
  "refresh_token_expires_at" timestamptz(6),
  "scope"                    text,
  "created_at"               timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"               timestamptz(6) NOT NULL,
  CONSTRAINT "auth_accounts_provider_id_account_id_key" UNIQUE ("provider_id", "account_id")
);
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" ("user_id");

-- 4. Verification store (better-auth internal: state, tokens) ---------------
CREATE TABLE "auth_verifications" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expires_at" timestamptz(6) NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL
);
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" ("identifier");

-- 5. TOTP two-factor (secret + backup codes are stored ENCRYPTED by
--    better-auth using the auth secret; still: returned:false, never selected
--    into API responses) ----------------------------------------------------
CREATE TABLE "two_factors" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "secret"                    text NOT NULL,
  "backup_codes"              text NOT NULL,
  "verified"                  boolean NOT NULL DEFAULT true,
  "failed_verification_count" integer NOT NULL DEFAULT 0,
  "locked_until"              timestamptz(6)
);
CREATE INDEX "two_factors_secret_idx" ON "two_factors" ("secret");
CREATE INDEX "two_factors_user_id_idx" ON "two_factors" ("user_id");

-- 6. Runtime role grants (repo convention: edura_app gets explicit grants) --
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      auth_sessions, auth_accounts, auth_verifications, two_factors
    TO "edura_app";
  END IF;
END $$;

-- 7. Credential mirror triggers --------------------------------------------
-- users.password_hash is the single source of truth. These triggers keep the
-- better-auth credential account row in sync ATOMICALLY with every writer —
-- Prisma services, seeds, and even manual SQL — so the ~10 existing password
-- writers did not have to change. The WHEN(IS DISTINCT FROM) guards terminate
-- the forward↔reverse recursion after one hop (equal values never re-fire).
CREATE OR REPLACE FUNCTION sync_credential_account() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL THEN
    INSERT INTO auth_accounts (account_id, provider_id, user_id, password, created_at, updated_at)
    VALUES (NEW.id::text, 'credential', NEW.id, NEW.password_hash, now(), now())
    ON CONFLICT (provider_id, account_id)
    DO UPDATE SET password = EXCLUDED.password, updated_at = now()
    WHERE auth_accounts.password IS DISTINCT FROM EXCLUDED.password;
  ELSE
    -- password removed (never happens today): retire the credential row so the
    -- "shell accounts have no credential" invariant holds in both tables.
    DELETE FROM auth_accounts WHERE provider_id = 'credential' AND user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER users_credential_sync_ins
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION sync_credential_account();
CREATE TRIGGER users_credential_sync_upd
  AFTER UPDATE OF password_hash ON users
  FOR EACH ROW
  WHEN (OLD.password_hash IS DISTINCT FROM NEW.password_hash)
  EXECUTE FUNCTION sync_credential_account();

-- Reverse mirror: if better-auth (or anything else) ever writes the account
-- row's password directly, users.password_hash follows. Defense against
-- drift, not an endorsed write path.
CREATE OR REPLACE FUNCTION sync_credential_back() RETURNS trigger AS $$
BEGIN
  IF NEW.provider_id = 'credential' AND NEW.password IS NOT NULL THEN
    UPDATE users SET password_hash = NEW.password
    WHERE id = NEW.user_id AND password_hash IS DISTINCT FROM NEW.password;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER auth_accounts_credential_sync_back
  AFTER INSERT OR UPDATE OF password ON auth_accounts
  FOR EACH ROW EXECUTE FUNCTION sync_credential_back();

-- 8. Hard session revocation ------------------------------------------------
-- L1 (password reset bumps token_version) and C-03 (suspension / blacklist /
-- soft-delete) previously relied on a per-request JWT epoch re-read. With DB
-- sessions, revocation becomes ROW DELETION, atomic with the deactivating
-- write itself and effective even for status changes made outside Prisma.
-- Reactivation does not resurrect anything — the user just logs in fresh.
CREATE OR REPLACE FUNCTION revoke_auth_sessions() RETURNS trigger AS $$
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER users_revoke_sessions
  AFTER UPDATE OF status, deleted_at, token_version ON users
  FOR EACH ROW
  WHEN (
    (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'active')
    OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    OR (NEW.token_version IS DISTINCT FROM OLD.token_version)
  )
  EXECUTE FUNCTION revoke_auth_sessions();

-- 9. Backfill: one credential account row per existing credentialed user ----
-- Idempotent (ON CONFLICT DO NOTHING) — the same statement the migration
-- test-run executes against the DB copy.
INSERT INTO auth_accounts (account_id, provider_id, user_id, password, created_at, updated_at)
SELECT u.id::text, 'credential', u.id, u.password_hash, now(), now()
FROM users u
WHERE u.password_hash IS NOT NULL
ON CONFLICT (provider_id, account_id) DO NOTHING;

COMMENT ON TABLE "auth_sessions" IS 'better-auth DB-backed sessions (30d). NOT the live-class sessions table. token unique; center_id = session-scoped center claim. Rows are deleted by trigger users_revoke_sessions on deactivation/soft-delete/token_version bump (L1 + C-03).';
COMMENT ON TABLE "auth_accounts" IS 'better-auth accounts. providerId=credential rows mirror users.password_hash (source of truth) via the users_credential_sync triggers.';
