// BULK STUDENT IMPORT proof — a center migrating off its old system uploads a
// spreadsheet and gets a roster, with ONE record per child.
//
// What this has to prove, in order of what would hurt most if it were wrong:
//   1. REUSE, not duplication. The same child already known to the platform is
//      linked, never re-created — that is the invariant the whole
//      manual-student module exists to protect, and an importer with its own
//      idea of "same child" would break it silently, at scale.
//   2. PER-ROW ISOLATION. One bad row must not cost the other 399. Postgres
//      aborts a whole transaction on a row error, so this is a real risk and
//      the reason each row runs in its own transaction.
//   3. NO MONEY. Importing a name is not a financial event. Asserted by
//      counting, not by reading the code.
//   4. A dry run writes NOTHING — the report a center decides on must not be
//      the thing that already happened.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext, prisma } from "@repo/database";
import {
  importStudentCsv,
  importStudents,
  MAX_IMPORT_ROWS,
} from "@repo/server-core/services/center/bulk-import-students";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "bimp-" + Math.floor(Math.random() * 1e9).toString(36);
const seed = Math.floor(Math.random() * 1e9);
/** Unique-per-run phone / national ID: both are globally UNIQUE columns. */
const phoneOf = (i: number) => `0100${String(seed).padStart(9, "0").slice(0, 6)}${String(i).padStart(2, "0")}`;
const nidOf = (i: number) => String(29000000000000 + seed * 100 + i);

const actorFor = (centerId: string, userId: string) => ({
  acting: { id: userId, role: "center_admin", centerId, locale: "en" } as SessionUser,
  actorId: userId,
  onBehalfOf: null,
});

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

async function expectThrows(fn: () => Promise<unknown>, match: RegExp, label: string) {
  try {
    await fn();
    fail++;
    console.error("  ✗", label, "— expected a rejection, got success");
  } catch (e) {
    const msg = (e as Error).message ?? "";
    ok(match.test(msg), `${label} (got: ${msg.slice(0, 70)})`);
  }
}

async function main() {
  console.log("Bulk student import —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const adminA = await tx.user.create({
      data: { name: tag + "-adminA", role: "center_admin", email: tag + "-a@x.io", status: "active", isDemo: true },
    });
    const adminB = await tx.user.create({
      data: { name: tag + "-adminB", role: "center_admin", email: tag + "-b@x.io", status: "active", isDemo: true },
    });

    // A child who ALREADY exists on center B — the shared-student case.
    const existing = await tx.user.create({
      data: { name: tag + "-existing", phone: phoneOf(90), role: "student", status: "active", isDemo: true },
    });
    await tx.studentProfile.create({
      data: { userId: existing.id, fullName: tag + "-existing", phone: phoneOf(90), entityType: "invited", inviteCode: tag.toUpperCase() + "90", familyLinkCode: tag.toUpperCase() + "F90" },
    });
    await tx.centerStudentRoster.create({ data: { centerId: centerB.id, studentId: existing.id } });

    // A child already known by NATIONAL ID, with no phone on file.
    const byNid = await tx.user.create({
      data: { name: tag + "-bynid", role: "student", status: "active", isDemo: true },
    });
    await tx.studentProfile.create({
      data: { userId: byNid.id, fullName: tag + "-bynid", nationalId: nidOf(91), entityType: "invited", inviteCode: tag.toUpperCase() + "91", familyLinkCode: tag.toUpperCase() + "F91" },
    });

    return { centerA: centerA.id, centerB: centerB.id, adminA: adminA.id, adminB: adminB.id, existing: existing.id, byNid: byNid.id };
  });

  const A = actorFor(fx.centerA, fx.adminA);
  const createdUserIds: string[] = [];

  try {
    // =====================================================================
    console.log("\n[1] A clean file creates shells on the roster");
    // =====================================================================
    const csv1 = [
      "الاسم,رقم الهاتف,الرقم القومي,ولي الأمر,هاتف ولي الأمر",
      `${tag}-s1,${phoneOf(1)},${nidOf(1)},وليّ الأول,${phoneOf(51)}`,
      `${tag}-s2,${phoneOf(2)},,"عبد الله، محمد",${phoneOf(52)}`,
      `${tag}-s3,,${nidOf(3)},,`,
    ].join("\n");
    const r1 = await importStudentCsv(A, csv1);
    ok(r1.total === 3 && r1.created === 3 && r1.reused === 0 && r1.failed === 0, `3 rows -> 3 created (${JSON.stringify({ c: r1.created, r: r1.reused, f: r1.failed })})`);
    ok(r1.rows.every((r) => r.status === "created" && !!r.studentId && !!r.studentCode), "every row reports an id and an issued student code");
    for (const r of r1.rows) if (r.studentId) createdUserIds.push(r.studentId);

    const shells = await q<{ status: string; password_hash: string | null }>(
      `SELECT status, password_hash FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds],
    );
    ok(shells.length === 3 && shells.every((s) => s.status === "shell" && s.password_hash === null),
      "created accounts are shells with no password — no login until they claim an invite");

    const rosterCount = await q<{ n: number }>(
      `SELECT count(*)::int n FROM center_student_rosters WHERE center_id=$1 AND student_id = ANY($2::uuid[]) AND left_at IS NULL`,
      [fx.centerA, createdUserIds],
    );
    ok(rosterCount[0].n === 3, `all 3 are on THIS center's roster (got ${rosterCount[0].n})`);

    const provenance = await q<{ n: number }>(
      `SELECT count(*)::int n FROM center_student_rosters WHERE center_id=$1 AND student_id = ANY($2::uuid[]) AND data_source='manual'`,
      [fx.centerA, createdUserIds],
    );
    ok(provenance[0].n === 3, "roster rows carry data_source='manual' — the ordinary screens label them correctly");

    const quoted = await q<{ operational_parent_name: string | null }>(
      `SELECT operational_parent_name FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`,
      [fx.centerA, r1.rows[1].studentId],
    );
    ok(quoted[0]?.operational_parent_name === "عبد الله، محمد",
      "a quoted guardian name with a comma survives intact");

    // =====================================================================
    console.log("\n[2] REUSE — the same child is linked, never duplicated");
    // =====================================================================
    const csv2 = [
      "name,phone,national id",
      // Same phone as the child already on center B, DIFFERENT name.
      `${tag}-renamed,${phoneOf(90)},${nidOf(80)}`,
      // Known by national ID only.
      `${tag}-renamed2,${phoneOf(81)},${nidOf(91)}`,
    ].join("\n");
    const r2 = await importStudentCsv(A, csv2);
    ok(r2.created === 0 && r2.reused === 2, `both rows reused, none created (${JSON.stringify({ c: r2.created, r: r2.reused })})`);
    ok(r2.rows[0].studentId === fx.existing && r2.rows[0].matchedOn === "phone", "matched the existing child by phone");
    ok(r2.rows[1].studentId === fx.byNid && r2.rows[1].matchedOn === "national_id", "matched the existing child by national ID");

    const names = await q<{ name: string }>(`SELECT name FROM users WHERE id = ANY($1::uuid[])`, [[fx.existing, fx.byNid]]);
    ok(names.every((n) => !n.name.includes("renamed")),
      "a reused child is NOT renamed — the family's own record is not overwritten by another center's typing");

    const sharedRoster = await q<{ n: number }>(
      `SELECT count(*)::int n FROM center_student_rosters WHERE student_id=$1 AND left_at IS NULL`, [fx.existing],
    );
    ok(sharedRoster[0].n === 2, "the shared child is now on BOTH centers' rosters — one user row, two memberships");

    const backfilled = await q<{ national_id: string | null }>(
      `SELECT national_id FROM student_profiles WHERE user_id=$1`, [fx.existing],
    );
    ok(backfilled[0].national_id === nidOf(80), "a MISSING national ID is backfilled — the dedup key gets stronger");

    const notOverwritten = await q<{ national_id: string | null }>(
      `SELECT national_id FROM student_profiles WHERE user_id=$1`, [fx.byNid],
    );
    ok(notOverwritten[0].national_id === nidOf(91), "an EXISTING national ID is never overwritten");

    // =====================================================================
    console.log("\n[3] Duplicates INSIDE the file are reported, not merged");
    // =====================================================================
    const csv3 = [
      "name,phone",
      `${tag}-d1,${phoneOf(10)}`,
      `${tag}-d1-again,${phoneOf(10)}`,
    ].join("\n");
    const r3 = await importStudentCsv(A, csv3);
    ok(r3.created === 1 && r3.duplicatesInFile === 1, `one created, one flagged as an in-file duplicate`);
    ok(r3.rows[1].status === "duplicate_in_file" && r3.rows[1].duplicateOfLine === 2,
      "the duplicate names the earlier LINE it duplicates, so the center can fix their own sheet");
    if (r3.rows[0].studentId) createdUserIds.push(r3.rows[0].studentId);

    // =====================================================================
    console.log("\n[4] One bad row does not cost the good ones");
    // =====================================================================
    const csv4 = [
      "name,phone,national id",
      `${tag}-g1,${phoneOf(20)},`,
      `,${phoneOf(21)},`,                       // no name
      `${tag}-bad,${phoneOf(22)},123`,          // 3-digit national ID
      `${tag}-g2,${phoneOf(23)},`,
    ].join("\n");
    const r4 = await importStudentCsv(A, csv4);
    ok(r4.created === 2 && r4.failed === 2, `2 imported, 2 rejected (${JSON.stringify({ c: r4.created, f: r4.failed })})`);
    ok(r4.rows[1].status === "error" && /name/i.test(r4.rows[1].error ?? ""), "the nameless row reports a name error");
    ok(r4.rows[2].status === "error" && /14 digits/i.test(r4.rows[2].error ?? ""), "the bad national ID reports the digit rule");
    ok(r4.rows[0].line === 2 && r4.rows[3].line === 5, "each result carries its ORIGINAL file line, so the center can find the row");
    for (const r of r4.rows) if (r.studentId) createdUserIds.push(r.studentId);

    const badLanded = await q<{ n: number }>(
      `SELECT count(*)::int n FROM users WHERE phone = ANY($1::text[])`, [[phoneOf(21), phoneOf(22)]],
    );
    ok(badLanded[0].n === 0, "neither rejected row left a partial record behind");

    // =====================================================================
    console.log("\n[5] A dry run writes NOTHING");
    // =====================================================================
    const auditBefore = await q<{ n: number }>(
      `SELECT count(*)::int n FROM audit_logs WHERE center_id=$1 AND action='center.students_imported'`, [fx.centerA],
    );
    const csv5 = [
      "name,phone",
      `${tag}-dry1,${phoneOf(30)}`,
      `${tag}-dry2,${phoneOf(90)}`, // an existing child
    ].join("\n");
    const r5 = await importStudentCsv(A, csv5, { dryRun: true });
    ok(r5.dryRun === true && r5.created === 1 && r5.reused === 1, "the dry run REPORTS 1 new + 1 known");
    ok(r5.rows[0].status === "would_create" && r5.rows[1].status === "would_reuse", "dry-run statuses say 'would', not 'did'");

    const dryLanded = await q<{ n: number }>(`SELECT count(*)::int n FROM users WHERE phone=$1`, [phoneOf(30)]);
    ok(dryLanded[0].n === 0, "the dry run created NO user");
    const auditAfterDry = await q<{ n: number }>(
      `SELECT count(*)::int n FROM audit_logs WHERE center_id=$1 AND action='center.students_imported'`, [fx.centerA],
    );
    ok(auditAfterDry[0].n === auditBefore[0].n, "the dry run wrote no audit row either");

    // =====================================================================
    console.log("\n[6] Re-importing the same file is idempotent");
    // =====================================================================
    const rosterBefore = await q<{ n: number }>(
      `SELECT count(*)::int n FROM center_student_rosters WHERE center_id=$1`, [fx.centerA],
    );
    const r6 = await importStudentCsv(A, csv1);
    ok(r6.created === 0 && r6.reused === 3, "the second run of the same file reuses all 3, creates none");
    const rosterAfter = await q<{ n: number }>(
      `SELECT count(*)::int n FROM center_student_rosters WHERE center_id=$1`, [fx.centerA],
    );
    ok(rosterBefore[0].n === rosterAfter[0].n, "no second roster row for anyone");

    // A child who LEFT rejoins on the same row rather than getting a new one.
    const leaver = r1.rows[0].studentId!;
    const rosterRowId = (await q<{ id: string }>(
      `SELECT id FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`, [fx.centerA, leaver],
    ))[0].id;
    await q(`UPDATE center_student_rosters SET left_at=now() WHERE id=$1`, [rosterRowId]);
    await importStudentCsv(A, csv1);
    const rejoined = await q<{ id: string; left_at: string | null }>(
      `SELECT id, left_at FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`, [fx.centerA, leaver],
    );
    ok(rejoined.length === 1 && rejoined[0].id === rosterRowId && rejoined[0].left_at === null,
      "a student who left rejoins on the SAME roster row, not a second one");

    // =====================================================================
    console.log("\n[7] MONEY IS UNTOUCHED — asserted by counting");
    // =====================================================================
    const ids = [...new Set([...createdUserIds, fx.existing, fx.byNid])];
    for (const [table, col] of [
      ["enrollments", "student_id"],
      ["subscriptions", "student_id"],
      ["payments", "student_id"],
      ["wallet_ledger", "student_id"],
    ] as const) {
      const n = await q<{ n: number }>(`SELECT count(*)::int n FROM ${table} WHERE ${col} = ANY($1::uuid[])`, [ids]);
      ok(n[0].n === 0, `${table}: 0 rows for every imported student`);
    }
    const txs = await q<{ n: number }>(
      `SELECT count(*)::int n FROM transactions WHERE from_entity_id = ANY($1::uuid[]) OR to_entity_id = ANY($1::uuid[])`, [ids],
    );
    ok(txs[0].n === 0, "transactions: 0 ledger rows — importing a name is not a financial event");

    // =====================================================================
    console.log("\n[8] Audit: ONE row per import, not one per student");
    // =====================================================================
    const audits = await q<{ n: number; after_state: { total: number; created: number } }>(
      `SELECT count(*)::int n FROM audit_logs WHERE center_id=$1 AND action='center.students_imported'`, [fx.centerA],
    );
    // Runs so far that actually wrote: csv1, csv2, csv3, csv4, csv1 again, csv1 rejoin = 6.
    ok(audits[0].n === 6, `6 imports -> 6 audit rows, not one per student (got ${audits[0].n})`);
    const lastAudit = await q<{ actor_id: string; after_state: { total: number } }>(
      `SELECT actor_id, after_state FROM audit_logs WHERE center_id=$1 AND action='center.students_imported' ORDER BY created_at DESC LIMIT 1`,
      [fx.centerA],
    );
    ok(lastAudit[0].actor_id === fx.adminA, "the audit row names the real actor");
    ok(typeof lastAudit[0].after_state.total === "number", "the audit row carries the run's counts");

    // =====================================================================
    console.log("\n[9] Guards");
    // =====================================================================
    await expectThrows(() => importStudentCsv(A, "phone,section\n0100,3A\n"), /name column/i,
      "a file with no name column is refused whole — nothing is guessed");
    await expectThrows(() => importStudentCsv(A, "name,phone\n"), /no student rows/i,
      "a header with no rows is refused with a message that says so");
    await expectThrows(
      () => importStudents(A, Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({
        line: i + 2, name: `x${i}`, phone: null, nationalId: null, guardianName: null, guardianPhone: null, guardianEmail: null,
      }))),
      /limit is 1000/i,
      `over ${MAX_IMPORT_ROWS} rows is refused before any write`,
    );
    await expectThrows(
      () => importStudentCsv({ acting: { id: "x", role: "center_admin", locale: "en" } as SessionUser, actorId: "x" }, csv1),
      /center scope/i,
      "an actor with no center scope is refused (default-closed)",
    );

    // =====================================================================
    console.log("\n[10] Chunked upload — lineOffset keeps ORIGINAL line numbers");
    // =====================================================================
    // A real file is uploaded in chunks; each chunk is a standalone CSV whose
    // own numbering restarts at 2. Without the offset, row 250 of the center's
    // spreadsheet is reported as "line 4" and nobody can find it.
    const chunk2 = `name,phone\n${tag}-c1,${phoneOf(60)}\n${tag}-bad-nid,${phoneOf(61)},\n`;
    const r10 = await importStudentCsv(A, chunk2, { lineOffset: 20, dryRun: true });
    ok(
      r10.rows[0].line === 22 && r10.rows[1].line === 23,
      `chunk rows report lines 22,23 — not 2,3 (got ${r10.rows.map((x) => x.line).join(",")})`,
    );
    const r10b = await importStudentCsv(A, chunk2, { dryRun: true });
    ok(r10b.rows[0].line === 2, "with no offset the same chunk numbers from 2 — the offset is purely presentational");

    // =====================================================================
    console.log("\n[11] Cross-center isolation");
    // =====================================================================
    const B = actorFor(fx.centerB, fx.adminB);
    const r11 = await importStudentCsv(B, `name,phone\n${tag}-bonly,${phoneOf(40)}\n`);
    const bStudent = r11.rows[0].studentId!;
    createdUserIds.push(bStudent);
    const onA = await q<{ n: number }>(
      `SELECT count(*)::int n FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`, [fx.centerA, bStudent],
    );
    ok(onA[0].n === 0, "a student imported by center B does not appear on center A's roster");
  } finally {
    const all = [...new Set(createdUserIds)];
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM audit_logs WHERE center_id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
      await c.query(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [[...all, fx.existing, fx.byNid]]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[...all, fx.existing, fx.byNid, fx.adminA, fx.adminB]]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
      const left = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite bulk-import-students.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
