// Applies prisma/migrations/**/migration.sql through the Neon serverless driver
// (WebSocket/443), because this environment cannot reach Neon over raw TCP:5432
// that `prisma migrate` requires. Records each in _prisma_migrations with the
// Prisma-compatible sha256 checksum so `prisma migrate status/deploy` stays in
// sync going forward.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { config } from "dotenv";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

config();
neonConfig.webSocketConstructor = ws;

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "migrations",
);

// DDL must run as the admin/owner role, not the restricted runtime role.
const pool = new Pool({
  connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL,
});

async function main() {
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
