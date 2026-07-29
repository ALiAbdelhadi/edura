import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { hardenNeonWebSockets } from "../src/neon-ws.ts";
import { config } from "dotenv";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { assertDbEnv } from "./db-guard.ts";


function requireAdminUrl() {
  const url = process.env.ADMIN_URL;
  if (!url) {
    throw new Error(
      "apply-migrations: ADMIN_URL is required (the database OWNER connection " +
        "string). The DIRECT_URL fallback was removed so an app-role URL cannot " +
        "be silently accepted here. See docs/reports/feature-completeness.md \"FINDING 0\".",
    );
  }
  return url;
}
config();
// Normalize a dropped socket into a real Error — see src/neon-ws.ts.
hardenNeonWebSockets();
neonConfig.webSocketConstructor = ws;

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "migrations",
);

const pool = new Pool({
  // OWNER ONLY, no fallback (2026-07-26, FINDING 0): this applies DDL.
  connectionString: requireAdminUrl(),
});

async function main() {
  // DELIBERATELY NOT restricted to dev/test: applying migrations to production
  // is this script's job, and guarding it shut would break the one bootstrap
  // path that needs it. What it refuses is an UNLABELLED database — a target
  // nobody has claimed is not a target we create schema on. The resolved label
  // is printed so the operator sees which world they are about to migrate.
  const env = await assertDbEnv(["dev", "test", "production"], {
    intent: "apply-migrations",
  });
  console.log(`apply-migrations: target database is labelled '${env}'.`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id varchar(36) PRIMARY KEY,
      checksum varchar(64) NOT NULL,
      finished_at timestamptz,
      migration_name varchar(255) NOT NULL,
      logs text,
      rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0
    );
  `);

  const dirs = readdirSync(migrationsDir)
    .filter((d) => statSync(join(migrationsDir, d)).isDirectory())
    .sort();

  for (const name of dirs) {
    const sqlPath = join(migrationsDir, name, "migration.sql");
    const sql = readFileSync(sqlPath, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    const existing = await pool.query(
      `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`,
      [name],
    );
    if (existing.rowCount > 0) {
      console.log(`skip  ${name} (already applied)`);
      continue;
    }

    console.log(`apply ${name} ...`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), 1)`,
        [randomUUID(), checksum, name],
      );
      await client.query("COMMIT");
      console.log(`done  ${name}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const t = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
  );
  console.log(`\npublic tables now: ${t.rows[0].n}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
