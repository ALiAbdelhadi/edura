/* eslint-disable no-console */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";

const ROLE = "edura_app";
const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(here, "expected-db-shape.json");

const APPEND_ONLY: Record<string, string[]> = {
  transactions: ["INSERT", "SELECT"],
  points_ledger: ["INSERT", "SELECT"],
  audit_logs: ["INSERT", "SELECT"],
  session_settlements: ["INSERT", "SELECT"],
  teacher_system_status_changes: ["INSERT", "SELECT"],
  external_teacher_settlements: ["INSERT", "SELECT"],
  invoices: ["INSERT", "SELECT", "UPDATE"],
  payouts: ["INSERT", "SELECT", "UPDATE"],
  blacklist_cascade_actions: ["INSERT", "SELECT", "UPDATE"],
  // migration 20260909120100_money_tables_revoke (SECURITY_AUDIT.md M-04)
  wallet_ledger: ["INSERT", "SELECT"],
  parent_wallet_ledger: ["INSERT", "SELECT"],
  center_wallet_ledger: ["INSERT", "SELECT"],
  payments: ["INSERT", "SELECT", "UPDATE"],
  // migration 20260912120000_users_revoke_delete (SECURITY_AUDIT.md 2026-09-11 DB-04)
  users: ["INSERT", "SELECT", "UPDATE"],
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

  const pool = new pg.Pool({ connectionString: pinSslMode(url), max: 1 });
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

    record(
      "database carries an edura-env label",
      typeof label === "string" && label.startsWith("edura-env:"),
      label ?? "none — db-guard will refuse to run against this database",
    );

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

    const unvalidated = await q<{ conname: string; rel: string }>(
      `SELECT c.conname, c.conrelid::regclass::text AS rel
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'c' AND n.nspname = 'public' AND NOT c.convalidated
        ORDER BY 1`,
    );
    record(
      "every CHECK constraint is VALIDATED",
      unvalidated.length === 0,
      unvalidated.length
        ? `NOT VALID: ${unvalidated.map((u) => `${u.rel}.${u.conname}`).join(", ")}`
        : "ok",
    );

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

    const [rls] = await q<{ rls_tables: string }>(
      `SELECT count(*) rls_tables FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
    );
    const [pol] = await q<{ n: string }>(
      `SELECT count(*) n FROM pg_policies WHERE schemaname='public'`,
    );

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
