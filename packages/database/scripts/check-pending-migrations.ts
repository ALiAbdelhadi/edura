/* eslint-disable no-console */
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
  console.error("check-pending-migrations failed:", err);
  process.exit(1);
});
