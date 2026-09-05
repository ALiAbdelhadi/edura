import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { listStudents } from "@/lib/services/admin/platform";
import { centerWalletMovements } from "@/lib/services/admin/center-oversight";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}

/**
 * Both reads used to fetch a centre's whole active roster and send the ids
 * back as an `IN` filter. They are `EXISTS` subqueries now, in raw SQL, so
 * every assertion here compares against the derivation that was replaced
 * rather than against a number written by hand.
 */
async function main() {
  const tag = "m16rs-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("M-16 roster-scoped reads —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkCenter = (n: string) =>
      tx.center.create({ data: { name: `${tag}-${n}`, shortId: `${tag}${n}`.slice(0, 14).toUpperCase(), status: "active", walletBalance: 0 } });
    const a = await mkCenter("a");
    const b = await mkCenter("b");

    const students: { userId: string; profileId: string }[] = [];
    for (let i = 0; i < 8; i += 1) {
      const u = await tx.user.create({
        data: { name: `${tag} أحمد ${i}`, role: "student", email: `${tag}-${i}@x.io`, status: "active" },
      });
      const sp = await tx.studentProfile.create({
        data: {
          userId: u.id,
          fullName: `${tag} أحمد ${i}`,
          familyLinkCode: `${tag}-fam-${i}`,
          grade: i < 4 ? "g1" : "g2",
        },
      });
      students.push({ userId: u.id, profileId: sp.id });
    }

    // 5 on centre A (one of them since left), 2 on centre B, 1 on neither.
    for (let i = 0; i < 5; i += 1) {
      await tx.centerStudentRoster.create({
        data: { centerId: a.id, studentId: students[i]!.userId, leftAt: i === 4 ? new Date() : null },
      });
    }
    for (let i = 5; i < 7; i += 1) {
      await tx.centerStudentRoster.create({ data: { centerId: b.id, studentId: students[i]!.userId } });
    }

    const ledger: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const row = await tx.walletLedger.create({
        data: {
          studentId: students[i]!.userId,
          centerId: i % 2 === 0 ? a.id : b.id,
          type: "topup",
          delta: 100 + i,
          balanceAfter: 100 + i,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        },
        select: { id: true },
      });
      ledger.push(row.id);
    }

    return { a: a.id, b: b.id, students, ledger };
  });

  try {
    // ---- the derivation the EXISTS replaced, computed here for comparison ----
    const legacyRosterIds = await withPlatformContext(async (tx) => {
      const roster = await tx.centerStudentRoster.findMany({
        where: { centerId: fx.a, leftAt: null },
        select: { studentId: true },
      });
      return roster.map((r) => r.studentId);
    });
    assert(legacyRosterIds.length === 4,
      `fixture: centre A has 4 active roster rows, the 5th has left (got ${legacyRosterIds.length})`);

    const listed = await listStudents({ centerId: fx.a, limit: "100" });
    const listedUserIds = new Set(listed.data.map((r) => r.userId));
    assert(listed.total === legacyRosterIds.length,
      `EXISTS total equals the legacy roster-IN count (${listed.total} vs ${legacyRosterIds.length})`);
    assert(legacyRosterIds.every((id) => listedUserIds.has(id)),
      "every active roster member is returned, and only those");
    assert(!listedUserIds.has(fx.students[4]!.userId),
      "a student who has left the centre is excluded");
    assert(!listedUserIds.has(fx.students[5]!.userId),
      "a student on another centre's roster is excluded");

    const graded = await listStudents({ centerId: fx.a, grade: "g1", limit: "100" });
    assert(graded.total === 4 && graded.data.every((r) => r.grade === "g1"),
      `the grade filter still narrows within the centre (got ${graded.total})`);

    // The normalizer is shared, not restated in SQL: an unaccented query has
    // to find the accented name.
    const searched = await listStudents({ centerId: fx.a, q: "احمد", limit: "100" });
    assert(searched.total === listed.total,
      `search on the normalized haystack finds the same set (got ${searched.total}, want ${listed.total})`);
    const noHit = await listStudents({ centerId: fx.a, q: "zzzznotpresent", limit: "100" });
    assert(noHit.total === 0, `a term that matches nothing returns nothing (got ${noHit.total})`);

    const paged = await listStudents({ centerId: fx.a, limit: "2" });
    assert(paged.data.length === 2 && paged.total === 4,
      `paging bounds the page but not the total (got ${paged.data.length} of ${paged.total})`);

    // ---- wallet movements ----
    const legacyRosterLedger = await withPlatformContext(async (tx) =>
      tx.walletLedger.count({ where: { studentId: { in: legacyRosterIds } } }),
    );
    const roster = await centerWalletMovements(fx.a, { scope: "roster", limit: "100" });
    assert(roster.total === legacyRosterLedger,
      `roster-scoped ledger total equals the legacy IN derivation (${roster.total} vs ${legacyRosterLedger})`);
    assert(roster.data.every((w) => legacyRosterIds.includes(w.studentId)),
      "every returned movement belongs to an active roster member");

    const byCentre = await centerWalletMovements(fx.a, { scope: "center", limit: "100" });
    const legacyByCentre = await withPlatformContext(async (tx) =>
      tx.walletLedger.count({ where: { centerId: fx.a } }),
    );
    assert(byCentre.total === legacyByCentre,
      `centre scope is unchanged by the rewrite (${byCentre.total} vs ${legacyByCentre})`);
    assert(byCentre.scope === "center" && roster.scope === "roster",
      "each call echoes the scope it served");

    const emptyCentre = await withPlatformContext(async (tx) => {
      const c = await tx.center.create({ data: { name: tag + "-z", shortId: (tag + "z").slice(0, 14).toUpperCase(), status: "active", walletBalance: 0 } });
      return c.id;
    });
    const none = await centerWalletMovements(emptyCentre, { scope: "roster" });
    assert(none.total === 0 && none.data.length === 0,
      "a centre with an empty roster returns nothing rather than every row");
    await withPlatformContext(async (tx) => { await tx.center.delete({ where: { id: emptyCentre } }); });
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM wallet_ledger WHERE id = ANY($1::uuid[])`, [fx.ledger]);
      await c.query(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [[fx.a, fx.b]]);
      await c.query(`DELETE FROM student_profiles WHERE id = ANY($1::uuid[])`, [fx.students.map((s) => s.profileId)]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [fx.students.map((s) => s.userId)]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.a, fx.b]]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite m16-roster-scoped-reads.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
