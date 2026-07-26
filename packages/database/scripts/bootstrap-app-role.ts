/* eslint-disable no-console */
/**
 * ============================================================================
 * BOOTSTRAP THE RUNTIME APPLICATION ROLE (`edura_app`)
 * ============================================================================
 * WHY THIS SCRIPT EXISTS — the quiet failure it prevents:
 *
 * `edura_app` is created by NO migration. It was made by hand on the original
 * database, and six migrations carry their grants inside
 *
 *     DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='edura_app')
 *     THEN GRANT ... ; REVOKE ... ; END IF; END $$;
 *
 * On a database where the role does not yet exist, every one of those
 * GRANT/REVOKE lines is skipped and the migration still reports SUCCESS. A
 * production database built without this script would come up with RLS
 * policies present but the append-only REVOKEs on transactions / points_ledger
 * / audit_logs MISSING — and nothing anywhere would report an error.
 *
 * So: run this FIRST, then `prisma migrate deploy`, then `verify-db.ts`.
 *
 * ORDERING IS ENFORCED, not documented: this script refuses to run against a
 * database that already has application tables, because the blanket
 * `GRANT ... ON ALL TABLES` it issues would re-grant exactly the UPDATE/DELETE
 * privileges the migrations deliberately revoked — silently undoing the
 * ledger's append-only protection.
 *
 * The password is never generated, stored, or logged here. Supply it:
 *     APP_ROLE_PASSWORD="$(openssl rand -base64 32)" \
 *       tsx --env-file=.env.production scripts/bootstrap-app-role.ts
 */
import "./load-env";
import pg from "pg";
import { assertDbEnv } from "./db-guard";

const ROLE = "edura_app";

async function main() {
  // DELIBERATELY NOT restricted to dev/test: creating `edura_app` on the
  // production database is precisely this script's job (step 2 of the bootstrap
  // order above). What it refuses is an UNLABELLED database — creating roles
  // and issuing blanket GRANTs on a target nobody has claimed is how the wrong
  // database quietly acquires the wrong privileges.
  const env = await assertDbEnv(["dev", "test", "production"], {
    intent: "bootstrap-app-role",
  });
  console.log(`bootstrap-app-role: target database is labelled '${env}'.`);

  // OWNER ONLY, no fallback — this issues CREATE ROLE.
  const adminUrl = process.env.ADMIN_URL;
  if (!adminUrl) {
    throw new Error(
      "bootstrap-app-role: ADMIN_URL is required (the database OWNER connection string).\nThe DIRECT_URL fallback was removed on 2026-07-26: it let an app-role URL be\nsilently accepted here, and it created pressure to put an owner string into\nDIRECT_URL — which is how an owner credential reaches a serving environment.\nSee docs/reports/feature-completeness.md \"FINDING 0\".",
    );
  }
  const password = process.env.APP_ROLE_PASSWORD;
  if (!password) {
    throw new Error(
      "bootstrap-app-role: APP_ROLE_PASSWORD is required.\n" +
        `Generate one and keep it — it becomes the runtime DATABASE_URL password:\n` +
        `  APP_ROLE_PASSWORD="$(openssl rand -base64 32)" tsx --env-file=... ${process.argv[1]}`,
    );
  }

  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  const client = await pool.connect();

  try {
    const { rows: whoami } = await client.query<{
      db: string;
      usr: string;
      host: string;
    }>(`SELECT current_database() db, current_user usr, inet_server_addr()::text host`);
    console.log(
      `Target: database "${whoami[0]!.db}" as "${whoami[0]!.usr}"\n`,
    );

    // ---- Ordering gate -----------------------------------------------------
    // A blanket GRANT after the migrations have run would re-grant the
    // UPDATE/DELETE that 00000000000003 revoked on the ledger tables. Refuse.
    const { rows: existing } = await client.query<{ n: string }>(
      `SELECT count(*) n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    if (Number(existing[0]!.n) > 0) {
      throw new Error(
        `REFUSING TO RUN: the public schema already has ${existing[0]!.n} table(s).\n` +
          `This script issues GRANT ... ON ALL TABLES, which would re-grant the\n` +
          `UPDATE/DELETE privileges that migration 00000000000003 revokes on\n` +
          `transactions / points_ledger / audit_logs — silently breaking the\n` +
          `append-only ledger.\n\n` +
          `Run this on an EMPTY database, before \`prisma migrate deploy\`.\n` +
          `If the role is merely missing on a populated database, add it by hand\n` +
          `and re-apply the six conditional grant blocks, then run verify-db.ts.`,
      );
    }

    await client.query("BEGIN");

    // ---- The role ----------------------------------------------------------
    // NOBYPASSRLS is the entire point: RLS tenant isolation is enforced against
    // this role, so a role that could bypass it would silently void every
    // policy in 00000000000001_rls_and_constraints.
    const { rows: role } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
      [ROLE],
    );

    if (role[0]!.exists) {
      console.log(`Role "${ROLE}" already exists — reconciling attributes.`);
      await client.query(
        `ALTER ROLE ${pg.escapeIdentifier(ROLE)}
           WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT
           PASSWORD ${pg.escapeLiteral(password)}`,
      );
    } else {
      console.log(`Creating role "${ROLE}".`);
      await client.query(
        `CREATE ROLE ${pg.escapeIdentifier(ROLE)}
           WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT
           PASSWORD ${pg.escapeLiteral(password)}`,
      );
    }

    // ---- Schema access -----------------------------------------------------
    // USAGE only. No CREATE: the application must never be able to add or drop
    // objects — that is the migration path's job, which runs as the owner.
    await client.query(
      `GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(ROLE)}`,
    );
    await client.query(
      `REVOKE CREATE ON SCHEMA public FROM ${pg.escapeIdentifier(ROLE)}`,
    );

    // ---- Default privileges ------------------------------------------------
    // This is the mechanism that makes future migrations work: every table a
    // later migration creates as the owner is automatically granted to the app
    // role, so a new feature's tables are reachable without a manual grant.
    // The migrations' explicit GRANT lines then become belt-and-braces, and
    // their REVOKE lines still carve out the append-only tables afterwards.
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${pg.escapeIdentifier(ROLE)}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT USAGE, SELECT ON SEQUENCES TO ${pg.escapeIdentifier(ROLE)}`,
    );

    await client.query("COMMIT");

    console.log(
      `\nDone. "${ROLE}" created with NOBYPASSRLS and default privileges set.\n` +
        `NEXT: prisma migrate deploy, then scripts/verify-db.ts.`,
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
