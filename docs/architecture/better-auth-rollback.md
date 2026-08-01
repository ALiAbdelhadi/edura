# better-auth migration — data migration & rollback plan

Date: 2026-08-01. Companion to `better-auth-migration-audit.md`.

## What the data migration actually is

There was **no NextAuth state to move**: sessions were stateless JWTs (they
live in users' cookies, not the DB) and there were no `accounts` /
`verification_tokens` tables. Users keep their EXACT rows and ids — better-auth
maps onto the existing `users` table, so every FK in the system is untouched.

The one real data step is creating the better-auth **credential account rows**
(`auth_accounts`, providerId=`credential`) mirroring `users.password_hash`.
That backfill is **inside the schema migration itself**
(`packages/database/prisma/migrations/20260801170000_better_auth/migration.sql`,
step 9) and is idempotent (`ON CONFLICT DO NOTHING`). From then on the
`users_credential_sync_*` DB triggers keep the mirror exact for every writer —
Prisma services, seeds, and raw SQL alike.

## Test on a copy (executed 2026-08-01)

- Backup: `pg_dump -Fc` of the dev DB (label `edura-env:dev`) →
  `/Users/ali/edura-backups/edura-dev-pre-better-auth-20260801-191604.dump`.
- Restore-verified into a local Postgres 18 container (`edura-restore-test`):
  71 tables, 13 users — matches live; spot-check rows read correctly.
- The full migration ran against that copy FIRST. Proven there (then re-proven
  on dev/test after `migrate deploy`):
  - backfill 12/12 credentialed users mirrored, 0 hash mismatches;
  - INSERT with password_hash → credential row appears (raw SQL, no Prisma);
  - UPDATE password_hash → mirror follows;
  - reverse write on auth_accounts.password → users.password_hash follows
    (recursion terminates via IS DISTINCT FROM guards);
  - status → suspended deletes the user's auth_sessions rows;
  - token_version bump deletes them (L1);
  - deleted_at set deletes them (C-03).

## Session migration

Impossible by design (stateless JWTs live client-side) and deliberately not
attempted: **every user logs in once again**. Measured blast radius: dev has 13
(demo) users; production has exactly the 2 real staff accounts and no end
users. No forced password resets — bcrypt hashes verify as-is.

## Environment state

- **[dev, 2026-08-01]** migration APPLIED (42 migrations), verify-db 25/25,
  backfill 12/12.
- **[test, 2026-08-01]** migration APPLIED (42 migrations); the db proof
  suites run against it.
- **[production]** NOT applied yet — part of this branch's deploy. Bootstrap
  order stays: `prisma migrate deploy` → verify-db. The backfill will mirror
  the 2 staff accounts; both will need one fresh login, then 2FA enrollment
  (REQUIRED for back-office roles).

## Rollback

Code: revert = don't merge `feat/better-auth`; next-auth was removed only
after all suites went green, and the branch is self-contained.

DB: the migration is **additive** (4 new tables, 5 nullable/defaulted user
columns, 4 triggers) — the pre-migration app runs unmodified against the
migrated schema, so rolling back code does NOT require rolling back the DB.
If a full schema rollback is ever wanted:

```sql
DROP TRIGGER IF EXISTS users_credential_sync_ins ON users;
DROP TRIGGER IF EXISTS users_credential_sync_upd ON users;
DROP TRIGGER IF EXISTS users_revoke_sessions ON users;
DROP TRIGGER IF EXISTS auth_accounts_credential_sync_back ON auth_accounts;
DROP FUNCTION IF EXISTS sync_credential_account(), sync_credential_back(), revoke_auth_sessions();
DROP TABLE IF EXISTS two_factors, auth_verifications, auth_accounts, auth_sessions;
ALTER TABLE users DROP COLUMN IF EXISTS image, DROP COLUMN IF EXISTS two_factor_enabled,
  DROP COLUMN IF EXISTS banned, DROP COLUMN IF EXISTS ban_reason, DROP COLUMN IF EXISTS ban_expires;
DELETE FROM _prisma_migrations WHERE migration_name = '20260801170000_better_auth';
```

Disaster fallback: restore the verified dump above
(`pg_restore --no-owner --no-privileges -d <db> <dump>`).
