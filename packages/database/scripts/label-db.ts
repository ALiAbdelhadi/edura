/* eslint-disable no-console */
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";

const VALID = ["dev", "test", "production"] as const;

async function main() {
  const env = process.argv[2];
  if (!env || !(VALID as readonly string[]).includes(env)) {
    throw new Error(`label-db: usage: label-db.ts <${VALID.join("|")}>`);
  }
  const url = process.env.ADMIN_URL;
  if (!url) {
    throw new Error(
      "label-db: ADMIN_URL (or DIRECT_URL) must be the database OWNER string.",
    );
  }

  const pool = new pg.Pool({ connectionString: pinSslMode(url), max: 1 });
  try {
    const { rows } = await pool.query<{ db: string; existing: string | null }>(
      `SELECT current_database() db,
              shobj_description(d.oid, 'pg_database') existing
         FROM pg_database d WHERE d.datname = current_database()`,
    );
    const { db, existing } = rows[0]!;

    await pool.query(
      `COMMENT ON DATABASE ${pg.escapeIdentifier(db)} IS ${pg.escapeLiteral(
        `edura-env:${env}`,
      )}`,
    );

    console.log(
      `Labelled "${db}" @ ${new URL(url).host}\n` +
        `  was: ${existing ?? "(unlabelled)"}\n` +
        `  now: edura-env:${env}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
