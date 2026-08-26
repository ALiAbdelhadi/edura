/**
 * PRODUCTION PRE-LAUNCH CLEANUP — MVP blocker #7 (docs/reports/
 * mvp-launch-plan.md). Census first, then a targeted wipe of walkthrough
 * residue, leaving exactly what the production seed created:
 *
 *   KEPT — the Egyptian education catalog (education_systems … subject_
 *   offerings), config singletons (wallet_settings, points_rules,
 *   feature_flags, the GLOBAL commission_settings row), the inert chatbot_*
 *   tables, _prisma_migrations, and THE TWO REAL STAFF ACCOUNTS (role
 *   super_admin / accountant) with their auth rows and prefs.
 *
 *   DELETED — every other row in every other table: the manual-walkthrough
 *   centers, courses, students, and anything attached to them. Sequences
 *   (receipt counters etc.) restart at 1 so the first real receipt is 00001.
 *
 * HOW IT DELETES without a hand-maintained FK order: victims = all public
 * tables minus the preserve set; repeated passes of `DELETE FROM t` (special
 * WHERE-clauses for users/auth/prefs/commission) until a full pass deletes
 * nothing — FK-violating deletes simply succeed on a later pass once their
 * children are gone. One transaction: it lands whole or not at all.
 *
 * SAFETY RAILS, in order:
 *   1. db-guard: the reached database must label itself `edura-env:production`
 *      (census mode also accepts dev, for rehearsing the report read-only).
 *   2. Census is READ-ONLY and prints every user/center/course by name.
 *   3. cleanup REFUSES to run unless --confirm=wipe-<N>-users names the exact
 *      count of non-staff users the census showed — a two-man rule between
 *      the read and the write.
 *   4. Staff assertions: exactly the expected staff count, and staff own
 *      NOTHING operational (no center, no teacher/student profile) — any
 *      surprise aborts before a single DELETE.
 *   5. Catalog counts are captured before and asserted identical after,
 *      inside the same transaction — a drifted count rolls everything back.
 *
 * Runs (workflow, where the credential lives):
 *   mode=census   → bunx tsx scripts/production-cleanup.ts census
 *   mode=cleanup  → bunx tsx scripts/production-cleanup.ts cleanup --confirm=wipe-7-users
 */
import pg from "pg";
// Side-effect import: resolves .env.${EDURA_ENV} exactly like the sibling
// scripts (harmless in the workflow, where the URL arrives via env directly).
import "./load-env";

const MODE = process.argv[2];
const CONFIRM = process.argv.find((a) => a.startsWith("--confirm="))?.slice(10) ?? null;

if (MODE !== "census" && MODE !== "cleanup") {
  console.error("Usage: production-cleanup.ts census | cleanup --confirm=wipe-<N>-users");
  process.exit(1);
}

const PRESERVE = new Set([
  "_prisma_migrations",
  // the permanent Egyptian education catalog
  "education_systems",
  "stages",
  "grade_levels",
  "tracks",
  "grade_level_tracks",
  "subjects",
  "subject_offerings",
  // config
  "wallet_settings",
  "points_rules",
  "feature_flags",
  // schema-only, inert by decision (Descoped §1) — empty, never touched
  "chatbot_config",
  "chatbot_faq",
  "chatbot_conversations",
]);

// Tables cleaned with a WHERE instead of wholesale.
const STAFF_ROLES = ["super_admin", "accountant"];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL / DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const c = await pool.connect();
  try {
    // ---- rail 1: the label -------------------------------------------------
    const label = (
      await c.query<{ description: string | null }>(
        `SELECT shobj_description(oid, 'pg_database') AS description
           FROM pg_database WHERE datname = current_database()`,
      )
    ).rows[0]?.description;
    const env = label?.match(/edura-env:(\w+)/)?.[1] ?? "(unlabelled)";
    console.log(`Reached database labels itself: ${env}`);
    if (MODE === "cleanup" && env !== "production") {
      throw new Error(`cleanup only runs against production — reached '${env}'`);
    }
    if (MODE === "census" && !["production", "dev"].includes(env)) {
      throw new Error(`census expects production (or dev for rehearsal) — reached '${env}'`);
    }

    // ---- census (always; it is also cleanup's own pre-read) ---------------
    const users = (
      await c.query<{ id: string; email: string | null; name: string | null; role: string; created_at: Date }>(
        `SELECT id, email, name, role, created_at FROM users ORDER BY created_at`,
      )
    ).rows;
    const staff = users.filter((u) => STAFF_ROLES.includes(u.role));
    const residueUsers = users.filter((u) => !STAFF_ROLES.includes(u.role));

    console.log(`\n=== USERS (${users.length}) ===`);
    for (const u of users) {
      const tag = STAFF_ROLES.includes(u.role) ? "KEEP " : "WIPE ";
      console.log(`  ${tag} ${u.role.padEnd(14)} ${u.email ?? "—"}  (${u.created_at.toISOString().slice(0, 10)})`);
    }

    const centers = (
      await c.query<{ name: string; created_at: Date }>(`SELECT name, created_at FROM centers ORDER BY created_at`)
    ).rows;
    console.log(`\n=== CENTERS (${centers.length}) — all WIPE ===`);
    for (const ct of centers) console.log(`  WIPE  ${ct.name}  (${ct.created_at.toISOString().slice(0, 10)})`);

    const allTables = (
      await c.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      )
    ).rows.map((r) => r.tablename);
    const victims = allTables.filter((t) => !PRESERVE.has(t));

    console.log(`\n=== ROW COUNTS (victim tables with data) ===`);
    const nonEmpty: Record<string, number> = {};
    for (const t of victims) {
      const n = Number((await c.query(`SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(t)}`)).rows[0].n);
      if (n > 0) {
        nonEmpty[t] = n;
        console.log(`  ${t.padEnd(34)} ${n}`);
      }
    }
    const catalogBefore: Record<string, number> = {};
    for (const t of PRESERVE) {
      if (t === "_prisma_migrations") continue;
      catalogBefore[t] = Number(
        (await c.query(`SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(t)}`)).rows[0].n,
      );
    }
    console.log(`\n=== PRESERVED (catalog/config) ===`);
    for (const [t, n] of Object.entries(catalogBefore)) console.log(`  ${t.padEnd(34)} ${n}`);

    console.log(
      `\nSummary: ${staff.length} staff KEPT, ${residueUsers.length} residue users, ` +
        `${centers.length} centers, ${Object.keys(nonEmpty).length} tables holding residue.`,
    );

    if (MODE === "census") {
      console.log(`\nRead-only census complete. To wipe: mode=cleanup confirm=wipe-${residueUsers.length}-users`);
      return;
    }

    // ---- rails 3 + 4 ------------------------------------------------------
    const expected = `wipe-${residueUsers.length}-users`;
    if (CONFIRM !== expected) {
      throw new Error(
        `refusing: --confirm must be exactly '${expected}' (got '${CONFIRM ?? ""}'). ` +
          `Read the census, then re-dispatch with that value.`,
      );
    }
    if (staff.length === 0 || staff.length > 2) {
      throw new Error(`refusing: expected 1-2 staff accounts, found ${staff.length}`);
    }
    const staffIds = staff.map((s) => s.id);
    const owns = await c.query<{ what: string; n: number }>(
      `SELECT 'centers' AS what, count(*)::int AS n FROM centers WHERE owner_user_id = ANY($1)
       UNION ALL SELECT 'teacher_profiles', count(*)::int FROM teacher_profiles WHERE user_id = ANY($1)
       UNION ALL SELECT 'student_profiles', count(*)::int FROM student_profiles WHERE user_id = ANY($1)`,
      [staffIds],
    );
    for (const row of owns.rows) {
      if (Number(row.n) > 0) throw new Error(`refusing: staff own ${row.n} ${row.what} — that is not residue`);
    }

    // ---- the wipe, one transaction ---------------------------------------
    await c.query("BEGIN");
    try {
      const whereClauses: Record<string, { sql: string; params: unknown[] }> = {
        users: { sql: `DELETE FROM users WHERE NOT (id = ANY($1))`, params: [staffIds] },
        auth_sessions: { sql: `DELETE FROM auth_sessions WHERE NOT (user_id = ANY($1))`, params: [staffIds] },
        auth_accounts: { sql: `DELETE FROM auth_accounts WHERE NOT (user_id = ANY($1))`, params: [staffIds] },
        auth_verifications: { sql: `DELETE FROM auth_verifications`, params: [] },
        two_factors: { sql: `DELETE FROM two_factors WHERE NOT (user_id = ANY($1))`, params: [staffIds] },
        user_prefs: { sql: `DELETE FROM user_prefs WHERE NOT (user_id = ANY($1))`, params: [staffIds] },
        commission_settings: {
          sql: `DELETE FROM commission_settings WHERE scope <> 'global'`,
          params: [],
        },
      };
      // commission_settings is in PRESERVE? No — keep it OUT of PRESERVE so
      // override rows die; the WHERE above protects the global row.

      const deleted: Record<string, number> = {};
      let pass = 0;
      for (;;) {
        pass += 1;
        if (pass > 10) throw new Error("FK passes did not converge — aborting (rolled back)");
        let any = false;
        for (const t of victims) {
          const w = whereClauses[t];
          try {
            const res = w
              ? await c.query(w.sql, w.params as never)
              : await c.query(`DELETE FROM ${pg.escapeIdentifier(t)}`);
            if ((res.rowCount ?? 0) > 0) {
              deleted[t] = (deleted[t] ?? 0) + (res.rowCount ?? 0);
              any = true;
            }
          } catch (err) {
            // FK violation this pass — children go first on a later pass.
            if ((err as { code?: string }).code === "23503") {
              await c.query("SAVEPOINT retry"); // keep the tx alive
              continue;
            }
            throw err;
          }
        }
        if (!any) break;
      }

      // rail 5: catalog byte-count identical, inside the same tx
      for (const [t, n] of Object.entries(catalogBefore)) {
        const now = Number(
          (await c.query(`SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(t)}`)).rows[0].n,
        );
        if (now !== n) throw new Error(`catalog drifted: ${t} ${n} -> ${now} — rolled back`);
      }
      const staffNow = Number(
        (await c.query(`SELECT count(*)::int AS n FROM users WHERE role = ANY($1)`, [STAFF_ROLES])).rows[0].n,
      );
      if (staffNow !== staff.length) throw new Error(`staff count drifted — rolled back`);

      await c.query("COMMIT");

      // sequences AFTER commit (not transactional state worth guarding)
      const seqs = (
        await c.query<{ sequencename: string }>(
          `SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`,
        )
      ).rows;
      for (const s of seqs) {
        await c.query(`ALTER SEQUENCE ${pg.escapeIdentifier(s.sequencename)} RESTART WITH 1`);
      }
      await c.query(`UPDATE centers SET receipt_seq = 0`); // none should exist; belt+braces

      console.log(`\n=== WIPED (rows per table) ===`);
      for (const [t, n] of Object.entries(deleted).sort()) console.log(`  ${t.padEnd(34)} ${n}`);
      console.log(
        `\nDone in ${pass} pass(es). Kept: ${staff.length} staff, catalog identical, ` +
          `${seqs.length} sequences restarted. Run verify-db next.`,
      );
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
