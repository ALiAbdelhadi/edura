/* eslint-disable no-console */
/**
 * ============================================================================
 * VERIFY DATABASE SHAPE — proves the security invariants actually landed
 * ============================================================================
 * The migrations wrap every `edura_app` grant in
 *     IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app')
 * so on a database where the role is missing they NO-OP AND STILL REPORT
 * SUCCESS. "prisma migrate deploy finished without error" therefore proves
 * nothing about whether the ledger is actually append-only.
 *
 * This script asserts the end state directly, by querying the catalog:
 *
 *   1. edura_app exists, can log in, and CANNOT bypass RLS (directly or by
 *      inheriting a BYPASSRLS role — the trap when a role is created through a
 *      provider console rather than SQL).
 *   2. It has USAGE but NOT CREATE on schema public.
 *   3. The append-only tables have EXACTLY the privileges the migrations
 *      intend — no UPDATE/DELETE on the money ledger, no DELETE on invoices
 *      or payouts. This is the check that catches the silent no-op.
 *   4. Every other table is fully reachable (a REVOKE that went too far is as
 *      much a bug as one that never ran).
 *   5. Sequences are usable, and default privileges are in place so the NEXT
 *      migration's tables are reachable without a manual grant.
 *   6. RLS is enabled and policies exist.
 *   7. Every migration is applied, none rolled back.
 *
 * Usage:  tsx --env-file=.env.production scripts/verify-db.ts
 *         tsx --env-file=.env scripts/verify-db.ts --write-baseline
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env";
import pg from "pg";

const ROLE = "edura_app";
const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(here, "expected-db-shape.json");

/**
 * Tables the migrations deliberately restrict, and the EXACT privilege set
 * `edura_app` must end up with. Derived from:
 *   00000000000003_integrity_sequences_indexes  (transactions, points_ledger,
 *                                                audit_logs, invoices, payouts)
 *   20260722100100_session_settlements
 *   20260723120100_blacklist_cascade_journal
 *   20260803100100_external_teachers
 * Money and audit rows are append-only; invoices/payouts legitimately change
 * status, so they keep UPDATE and lose only DELETE.
 */
const APPEND_ONLY: Record<string, string[]> = {
  transactions: ["INSERT", "SELECT"],
  points_ledger: ["INSERT", "SELECT"],
  audit_logs: ["INSERT", "SELECT"],
  session_settlements: ["INSERT", "SELECT"],
  // Off-system teachers. The conversion journal is the EVIDENCE that a status
  // flip moved no data, and the settlement record is a money statement — both
  // are worthless if they can be edited after the fact.
  teacher_system_status_changes: ["INSERT", "SELECT"],
  external_teacher_settlements: ["INSERT", "SELECT"],
  invoices: ["INSERT", "SELECT", "UPDATE"],
  payouts: ["INSERT", "SELECT", "UPDATE"],
  blacklist_cascade_actions: ["INSERT", "SELECT", "UPDATE"],
};

const FULL_CRUD = ["DELETE", "INSERT", "SELECT", "UPDATE"];

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) =>
  checks.push({ name, ok, detail });

async function main() {
  const url = process.env.ADMIN_URL ?? process.env.DIRECT_URL;
  if (!url) {
    throw new Error(
      "verify-db: ADMIN_URL (or DIRECT_URL) must point at the database owner " +
        "connection string. Did you forget --env-file?",
    );
  }
  const writeBaseline = process.argv.includes("--write-baseline");

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const q = async <T extends object>(sql: string, params: unknown[] = []) =>
    (await pool.query<T>(sql, params)).rows;

  try {
    const [ident] = await q<{ db: string; usr: string }>(
      `SELECT current_database() db, current_user usr`,
    );
    const { db, usr } = ident!;
    const [labelRow] = await q<{ label: string | null }>(
      `SELECT shobj_description(d.oid, 'pg_database') label
         FROM pg_database d WHERE d.datname = current_database()`,
    );
    const label = labelRow!.label;
    const host = new URL(url).host;

    console.log("=".repeat(74));
    console.log(`DATABASE VERIFICATION`);
    console.log(`  host:     ${host}`);
    console.log(`  database: ${db}   (connected as ${usr})`);
    console.log(`  label:    ${label ?? "\x1b[31mUNLABELLED\x1b[0m"}`);
    console.log("=".repeat(74));

    // -- 0. environment label ------------------------------------------------
    record(
      "database carries an edura-env label",
      typeof label === "string" && label.startsWith("edura-env:"),
      label ?? "none — db-guard will refuse to run against this database",
    );

    // -- 1. role identity ----------------------------------------------------
    const role = await q<{
      rolcanlogin: boolean;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolcanlogin, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = $1`,
      [ROLE],
    );
    record(`role "${ROLE}" exists`, role.length === 1, `${role.length} row(s)`);

    if (role.length === 1) {
      const r = role[0]!;
      record(`  ${ROLE} can log in`, r.rolcanlogin === true, `LOGIN=${r.rolcanlogin}`);
      record(
        `  ${ROLE} is NOBYPASSRLS  <-- RLS depends on this`,
        r.rolbypassrls === false,
        `BYPASSRLS=${r.rolbypassrls}`,
      );
      record(`  ${ROLE} is not a superuser`, r.rolsuper === false, `SUPERUSER=${r.rolsuper}`);
    }

    // Inherited bypass: a role granted membership in a BYPASSRLS role (which is
    // what provider consoles typically do) defeats RLS without setting the flag
    // on the role itself.
    const inherited = await q<{ granted: string; bypass: boolean }>(
      `SELECT g.rolname granted, g.rolbypassrls bypass
         FROM pg_auth_members m
         JOIN pg_roles r ON r.oid = m.member
         JOIN pg_roles g ON g.oid = m.roleid
        WHERE r.rolname = $1`,
      [ROLE],
    );
    const badMemberships = inherited.filter((m) => m.bypass);
    record(
      `  ${ROLE} inherits no BYPASSRLS role`,
      badMemberships.length === 0,
      inherited.length === 0
        ? "no memberships"
        : inherited.map((m) => `${m.granted}${m.bypass ? " (BYPASSRLS!)" : ""}`).join(", "),
    );

    // -- 2. schema privileges ------------------------------------------------
    const [schema] = await q<{ usage: boolean; create_: boolean }>(
      `SELECT has_schema_privilege($1,'public','USAGE') usage,
              has_schema_privilege($1,'public','CREATE') create_`,
      [ROLE],
    );
    record("schema public: USAGE granted", schema!.usage === true, `USAGE=${schema!.usage}`);
    record(
      "schema public: CREATE withheld",
      schema!.create_ === false,
      `CREATE=${schema!.create_}`,
    );

    // -- 3 & 4. table privileges --------------------------------------------
    const tables = await q<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
          AND table_name <> '_prisma_migrations'
        ORDER BY 1`,
    );
    const grants = await q<{ table_name: string; privs: string }>(
      `SELECT table_name, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) privs
         FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'public'
        GROUP BY table_name`,
      [ROLE],
    );
    const grantMap = new Map(grants.map((g) => [g.table_name, g.privs.split(",")]));

    for (const [table, expected] of Object.entries(APPEND_ONLY)) {
      const actual = grantMap.get(table);
      if (!actual) {
        record(`append-only: ${table}`, false, "table missing or no grants at all");
        continue;
      }
      const same =
        actual.length === expected.length &&
        expected.every((p) => actual.includes(p));
      record(
        `append-only: ${table}`,
        same,
        `expected [${expected.join(",")}]  actual [${actual.join(",")}]`,
      );
    }

    const others = tables
      .map((t) => t.table_name)
      .filter((t) => !(t in APPEND_ONLY));
    const underGranted = others.filter((t) => {
      const a = grantMap.get(t) ?? [];
      return !FULL_CRUD.every((p) => a.includes(p));
    });
    record(
      `all ${others.length} other tables have full CRUD`,
      underGranted.length === 0,
      underGranted.length ? `missing on: ${underGranted.join(", ")}` : "ok",
    );

    // -- 5. sequences + default privileges -----------------------------------
    const seqs = await q<{ relname: string; usage: boolean; sel: boolean }>(
      `SELECT c.relname,
              has_sequence_privilege($1, c.oid, 'USAGE') usage,
              has_sequence_privilege($1, c.oid, 'SELECT') sel
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind='S' AND n.nspname='public' ORDER BY 1`,
      [ROLE],
    );
    const badSeqs = seqs.filter((s) => !s.usage || !s.sel);
    record(
      `all ${seqs.length} sequences usable`,
      seqs.length > 0 && badSeqs.length === 0,
      badSeqs.length ? `missing on: ${badSeqs.map((s) => s.relname).join(", ")}` : "ok",
    );

    const defacl = await q<{ objtype: string; acl: string }>(
      `SELECT defaclobjtype::text objtype, defaclacl::text acl FROM pg_default_acl`,
    );
    const hasDefault = (t: string) =>
      defacl.some((d) => d.objtype === t && d.acl.includes(`${ROLE}=`));
    record(
      "default privileges set for future TABLES",
      hasDefault("r"),
      hasDefault("r") ? "ok" : "missing — the next migration's tables will be unreachable",
    );
    record(
      "default privileges set for future SEQUENCES",
      hasDefault("S"),
      hasDefault("S") ? "ok" : "missing",
    );

    // -- 6. RLS --------------------------------------------------------------
    const [rls] = await q<{ rls_tables: string }>(
      `SELECT count(*) rls_tables FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
    );
    const [pol] = await q<{ n: string }>(
      `SELECT count(*) n FROM pg_policies WHERE schemaname='public'`,
    );

    // -- 7. migrations -------------------------------------------------------
    const [mig] = await q<{ applied: string; failed: string }>(
      `SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) applied,
              count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) failed
         FROM _prisma_migrations`,
    );
    record(
      "no failed / rolled-back migrations",
      Number(mig!.failed) === 0,
      `${mig!.failed} failed, ${mig!.applied} applied`,
    );

    // -- structural comparison against the reference shape -------------------
    const shape = {
      tables: tables.length,
      sequences: seqs.length,
      rlsTables: Number(rls!.rls_tables),
      policies: Number(pol!.n),
      migrations: Number(mig!.applied),
    };

    if (writeBaseline) {
      writeFileSync(BASELINE_PATH, JSON.stringify(shape, null, 2) + "\n");
      console.log(`\nBaseline written to ${BASELINE_PATH}:`);
      console.log(JSON.stringify(shape, null, 2));
    } else {
      let baseline: typeof shape | null = null;
      try {
        baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
      } catch {
        /* no baseline committed yet */
      }
      if (baseline) {
        for (const k of Object.keys(shape) as (keyof typeof shape)[]) {
          record(
            `shape: ${k}`,
            shape[k] === baseline[k],
            `expected ${baseline[k]}, got ${shape[k]}`,
          );
        }
      } else {
        console.log("\n(no baseline file — run with --write-baseline on dev first)");
      }
    }

    // -- data census ---------------------------------------------------------
    const census = await q<{
      users: string;
      demo_users: string;
      centers: string;
      demo_centers: string;
      courses: string;
      txns: string;
      payments: string;
      catalog_subjects: string;
    }>(
      `SELECT (SELECT count(*) FROM users) users,
              (SELECT count(*) FROM users WHERE is_demo) demo_users,
              (SELECT count(*) FROM centers) centers,
              (SELECT count(*) FROM centers WHERE is_demo) demo_centers,
              (SELECT count(*) FROM courses) courses,
              (SELECT count(*) FROM transactions) txns,
              (SELECT count(*) FROM payments) payments,
              (SELECT count(*) FROM subjects) catalog_subjects`,
    );

    // -- report --------------------------------------------------------------
    console.log();
    let failed = 0;
    for (const c of checks) {
      if (!c.ok) failed++;
      const mark = c.ok ? "\x1b[32m PASS \x1b[0m" : "\x1b[31m FAIL \x1b[0m";
      console.log(`${mark} ${c.name.padEnd(46)} ${c.detail}`);
    }

    console.log("\n" + "-".repeat(74));
    console.log("DATA CENSUS");
    console.table(census[0]);

    console.log("-".repeat(74));
    if (failed === 0) {
      console.log(`\x1b[32mALL ${checks.length} CHECKS PASSED\x1b[0m`);
    } else {
      console.log(`\x1b[31m${failed} of ${checks.length} CHECKS FAILED\x1b[0m`);
    }
    console.log("-".repeat(74));

    await pool.end();
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    await pool.end().catch(() => {});
    throw e;
  }
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
