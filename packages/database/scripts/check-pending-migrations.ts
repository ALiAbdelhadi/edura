/* eslint-disable no-console */
/**
 * ============================================================================
 * PENDING-MIGRATION GATE — refuse to ship code onto a database it outruns
 * ============================================================================
 * On 2026-08-01 the better-auth branch merged to main and deployed. Its
 * migration was never applied to production, so the live code queried
 * `auth_sessions` on a database that had no such table and EVERY sign-in
 * returned 500. Nobody found out from a failing build — the build was green.
 * They found out from the door being shut.
 *
 * The lesson, written into CLAUDE.md that day: merging a migration to main does
 * NOT apply it anywhere. This script is that lesson expressed as a gate, so it
 * stops being something a person has to remember.
 *
 * WHICH DIRECTION IS FATAL, and why only one of them is:
 *
 *   DB behind the repo  -> FATAL. Prisma names every column explicitly in its
 *     SELECTs, so code that knows about a column the database lacks does not
 *     degrade — it throws on every query touching that table. One missing
 *     migration that adds a column to `courses` takes down classes, money,
 *     attendance and subscriptions together.
 *
 *   DB ahead of the repo -> WARNING ONLY. This is the SAFE ordering and the one
 *     a careful deploy deliberately creates: apply the migration, confirm, then
 *     ship. Additive columns carry defaults, and a client that has never heard
 *     of a column never asks for it. Failing here would punish exactly the
 *     behaviour we want.
 *
 * READ-ONLY. It runs two SELECTs and holds a single connection. It is safe to
 * point at production, which is the whole point of it existing.
 *
 * Usage:
 *   tsx --env-file=.env.production scripts/check-pending-migrations.ts
 *   DIRECT_URL=... tsx scripts/check-pending-migrations.ts    (CI)
 *
 * Exit codes:  0 = safe to deploy   1 = do not deploy
 * ============================================================================
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, "..", "prisma", "migrations");

function migrationsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(path.join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort();
}

async function main() {
  // DIRECT_URL first: this is a plain read and does not need owner rights, so
  // the lower-privilege string is preferred when both are present. ADMIN_URL is
  // accepted so a local `--env-file=.env.production` run works unchanged.
  const url = process.env.DIRECT_URL ?? process.env.ADMIN_URL;
  if (!url) {
    console.error(
      "check-pending-migrations: DIRECT_URL (or ADMIN_URL) is required.\n" +
        "  local:  tsx --env-file=.env.production scripts/check-pending-migrations.ts",
    );
    process.exit(1);
  }

  const onDisk = migrationsOnDisk();
  const pool = new pg.Pool({ connectionString: url, max: 1 });

  try {
    const { rows: dbRows } = await pool.query<{ db: string }>(
      `SELECT current_database() AS db`,
    );
    // The environment label every Edura database carries (see db-guard.ts).
    // Printed, never enforced: this script is meant to run against any of them.
    const { rows: labelRows } = await pool.query<{ label: string | null }>(
      `SELECT shobj_description(oid, 'pg_database') AS label
         FROM pg_database WHERE datname = current_database()`,
    );
    const label = labelRows[0]?.label ?? "(unlabelled)";
    console.log(`target: ${dbRows[0]?.db} — ${label}`);

    const { rows: applied } = await pool.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`,
    );

    const finished = new Set(
      applied.filter((r) => r.finished_at !== null).map((r) => r.migration_name),
    );
    // A row that started and never finished, or was rolled back, blocks every
    // later migration in Prisma's own runner — so it blocks the deploy too.
    // A name can appear twice (one failed attempt, one good), which is why this
    // subtracts the finished set rather than testing rows in isolation.
    const broken = [
      ...new Set(
        applied
          .filter((r) => r.finished_at === null || r.rolled_back_at !== null)
          .map((r) => r.migration_name),
      ),
    ].filter((name) => !finished.has(name));

    const missing = onDisk.filter((name) => !finished.has(name));
    const ahead = [...finished].filter((name) => !onDisk.includes(name)).sort();

    console.log(`migrations: ${onDisk.length} in repo, ${finished.size} applied`);

    if (ahead.length) {
      // The safe direction — see the header.
      console.log(
        `::warning title=Database is ahead of this commit::${ahead.length} migration(s) applied ` +
          `that this commit does not contain: ${ahead.join(", ")}. This is the safe ordering; ` +
          `deploying anyway.`,
      );
    }

    if (broken.length) {
      console.error(
        `::error title=Unfinished migration on the target database::` +
          `${broken.join(", ")} started and never completed, or was rolled back. ` +
          `Prisma will refuse every later migration until this row is resolved.`,
      );
    }

    if (missing.length) {
      console.error(
        `::error title=Do NOT deploy — the database is missing migrations::` +
          `${missing.length} migration(s) in this commit are not applied: ${missing.join(", ")}`,
      );
      console.error("");
      console.error("Apply them FIRST, then re-run this deploy:");
      console.error(
        "    bunx tsx --env-file=.env.production packages/database/scripts/apply-migrations.mjs",
      );
      console.error(
        "    bunx tsx --env-file=.env.production packages/database/scripts/verify-db.ts",
      );
    }

    if (missing.length || broken.length) process.exit(1);
    console.log("OK — the database has every migration this commit needs.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // A connection failure is NOT a pass. The gate exists to answer a question,
  // and "I could not reach the database" is not an answer that permits a deploy.
  console.error("check-pending-migrations failed:", err);
  process.exit(1);
});
