/* eslint-disable no-console */
/**
 * ============================================================================
 * LABEL A DATABASE WITH ITS ENVIRONMENT
 * ============================================================================
 * Writes `edura-env:<env>` as the comment on the database object. That comment
 * is what scripts/db-guard.ts reads, and it is stored INSIDE the database — so
 * it describes the database actually reached, not whatever a connection string
 * claims. See db-guard.ts for why the marker lives there rather than in a file.
 *
 * A Neon branch inherits its parent's comment, so relabel every new branch
 * immediately. A branch that still reports its parent's label will make the
 * guard fail loudly, which is the intended behaviour.
 *
 * Usage:  tsx --env-file=.env scripts/label-db.ts dev
 *         tsx --env-file=.env.test scripts/label-db.ts test
 *         tsx --env-file=.env.production scripts/label-db.ts production
 */
import "./load-env";
import pg from "pg";

const VALID = ["dev", "test", "production"] as const;

async function main() {
  const env = process.argv[2];
  if (!env || !(VALID as readonly string[]).includes(env)) {
    throw new Error(`label-db: usage: label-db.ts <${VALID.join("|")}>`);
  }
  // OWNER ONLY, no fallback (2026-07-26, FINDING 0): COMMENT ON DATABASE
  // requires ownership, and a silent app-role fallback would fail obscurely.
  const url = process.env.ADMIN_URL;
  if (!url) {
    throw new Error(
      "label-db: ADMIN_URL (or DIRECT_URL) must be the database OWNER string.",
    );
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{ db: string; existing: string | null }>(
      `SELECT current_database() db,
              shobj_description(d.oid, 'pg_database') existing
         FROM pg_database d WHERE d.datname = current_database()`,
    );
    const { db, existing } = rows[0]!;

    // COMMENT ON DATABASE takes no parameters, and the database name comes from
    // the catalog rather than user input — quote it as an identifier anyway.
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
