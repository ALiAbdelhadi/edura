/* eslint-disable no-console */
// READ-ONLY. Counts the duplicate logical rows that MIGRATION_PLAN_C5.md's
// partial unique indexes would reject, plus the totals they sit in. Safe
// against any target; run it as the pre-flight before applying that migration:
//
//   EDURA_ENV=<dev|test|production> npx tsx packages/database/scripts/dedupe-census.ts
//
// Every duplicate count must be 0 before the migration is applied — a non-zero
// count is a judgement call (which entry is the real one), never something
// this script or the migration resolves on its own.
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";

const url = process.env.ADMIN_URL ?? process.env.DIRECT_URL;
if (!url) throw new Error("dedupe-census: ADMIN_URL (or DIRECT_URL) is not set");

const QUERIES: [string, string][] = [
  ["blacklist_entries rows", `SELECT count(*)::int AS n FROM blacklist_entries`],
  ["…active", `SELECT count(*)::int AS n FROM blacklist_entries WHERE is_active`],
  [
    "…duplicate active (target) at level platform",
    `SELECT count(*)::int AS n FROM (
       SELECT target_id FROM blacklist_entries
        WHERE level = 'platform' AND is_active
        GROUP BY target_id HAVING count(*) > 1) d`,
  ],
  [
    "…duplicate active (target, center) at level center",
    `SELECT count(*)::int AS n FROM (
       SELECT target_id, center_id FROM blacklist_entries
        WHERE level = 'center' AND is_active
        GROUP BY target_id, center_id HAVING count(*) > 1) d`,
  ],
  [
    "…duplicate active (target, imposed_by) at level teacher",
    `SELECT count(*)::int AS n FROM (
       SELECT target_id, imposed_by_id FROM blacklist_entries
        WHERE level = 'teacher' AND is_active
        GROUP BY target_id, imposed_by_id HAVING count(*) > 1) d`,
  ],
  [
    "…active center-level rows with NULL center_id",
    `SELECT count(*)::int AS n FROM blacklist_entries
      WHERE level = 'center' AND is_active AND center_id IS NULL`,
  ],
  ["teacher_agreements rows", `SELECT count(*)::int AS n FROM teacher_agreements`],
  ["…proposed", `SELECT count(*)::int AS n FROM teacher_agreements WHERE status = 'proposed'`],
  [
    "…duplicate proposed (center, teacher)",
    `SELECT count(*)::int AS n FROM (
       SELECT center_id, teacher_id FROM teacher_agreements
        WHERE status = 'proposed'
        GROUP BY center_id, teacher_id HAVING count(*) > 1) d`,
  ],
];

async function main() {
  const pool = new pg.Pool({ connectionString: pinSslMode(url as string), max: 1 });
  try {
    const label = (
      await pool.query<{ d: string | null }>(
        `SELECT shobj_description(oid, 'pg_database') AS d FROM pg_database WHERE datname = current_database()`,
      )
    ).rows[0]?.d;
    console.log(`dedupe-census — ${new URL(url as string).host} (${label ?? "UNLABELLED"})`);
    for (const [name, sql] of QUERIES) {
      const n = (await pool.query<{ n: number }>(sql)).rows[0]?.n ?? NaN;
      console.log(`  ${String(n).padStart(4)}  ${name}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
