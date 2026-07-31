/* eslint-disable no-console */
/**
 * ============================================================================
 * WIPE ALL DATA — dev/test ONLY, schema stays, migrations stay
 * ============================================================================
 * Truncates every public table except `_prisma_migrations` and restarts every
 * sequence, so the database returns to "freshly migrated, zero rows". Run the
 * seed afterwards to restore the permanent catalog + operator accounts.
 *
 * Guards (all three must hold, in this order):
 *   1. The <env> argument must be `dev` or `test`. `production` is REFUSED
 *      unconditionally — a production reset must never be one command.
 *   2. The database's own `edura-env:<env>` label (see label-db.ts) must match
 *      the argument. A connection string pointing at the wrong branch fails
 *      loudly BEFORE anything is touched.
 *   3. The literal flag `--yes` must be passed.
 *
 * Usage:  tsx --env-file=.env scripts/wipe-data.ts dev --yes
 *         tsx --env-file=.env.test scripts/wipe-data.ts test --yes
 */
import "./load-env";
import pg from "pg";

const WIPABLE = ["dev", "test"] as const;

async function main() {
  const env = process.argv[2];
  if (!env || !(WIPABLE as readonly string[]).includes(env)) {
    throw new Error(
      `wipe-data: usage: wipe-data.ts <${WIPABLE.join("|")}> --yes  (production is refused by design)`,
    );
  }
  if (!process.argv.includes("--yes")) {
    throw new Error("wipe-data: refusing without the explicit --yes flag.");
  }
  const url = process.env.ADMIN_URL;
  if (!url) {
    throw new Error("wipe-data: ADMIN_URL (database OWNER string) is required — TRUNCATE needs ownership.");
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const { rows: labelRows } = await pool.query<{ db: string; label: string | null }>(
      `SELECT current_database() db,
              shobj_description(d.oid, 'pg_database') label
         FROM pg_database d WHERE d.datname = current_database()`,
    );
    const { db, label } = labelRows[0]!;
    if (label !== `edura-env:${env}`) {
      throw new Error(
        `wipe-data: label mismatch — asked to wipe "${env}" but "${db}" @ ${new URL(url).host} ` +
          `is labelled "${label ?? "(unlabelled)"}". Nothing was touched.`,
      );
    }

    const { rows: before } = await pool.query<{ users: string; centers: string; txns: string }>(
      `SELECT (SELECT count(*) FROM users)        users,
              (SELECT count(*) FROM centers)      centers,
              (SELECT count(*) FROM transactions) txns`,
    );

    const { rows: tables } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        ORDER BY tablename`,
    );
    const list = tables.map((t) => pg.escapeIdentifier(t.tablename)).join(", ");
    await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);

    // Standalone sequences (receipt counters etc.) are not owned by a column,
    // so RESTART IDENTITY does not reach them.
    const { rows: seqs } = await pool.query<{ sequencename: string }>(
      `SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`,
    );
    for (const s of seqs) {
      await pool.query(`ALTER SEQUENCE ${pg.escapeIdentifier(s.sequencename)} RESTART WITH 1`);
    }

    console.log(
      `Wiped "${db}" (${label}) @ ${new URL(url).host}\n` +
        `  tables truncated: ${tables.length}, sequences restarted: ${seqs.length}\n` +
        `  before: users=${before[0]!.users} centers=${before[0]!.centers} transactions=${before[0]!.txns}\n` +
        `  after:  all zero. Run \`bun run seed\` to restore catalog + operator accounts.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
