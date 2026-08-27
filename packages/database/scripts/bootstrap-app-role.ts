/* eslint-disable no-console */
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";
import { assertDbEnv } from "./db-guard";

const ROLE = "edura_app";

async function main() {
  const env = await assertDbEnv(["dev", "test", "production"], {
    intent: "bootstrap-app-role",
  });
  console.log(`bootstrap-app-role: target database is labelled '${env}'.`);

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

  const pool = new pg.Pool({ connectionString: pinSslMode(adminUrl), max: 1 });
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

    await client.query(
      `GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(ROLE)}`,
    );
    await client.query(
      `REVOKE CREATE ON SCHEMA public FROM ${pg.escapeIdentifier(ROLE)}`,
    );

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
