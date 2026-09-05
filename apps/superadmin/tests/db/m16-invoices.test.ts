import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { listInvoices, generateInvoice } from "@/lib/services/finance/invoices";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}

async function main() {
  const tag = "m16inv-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("M-16 invoices DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: tag + "-t", role: "teacher", email: tag + "-t@x.io", status: "active" },
    });
    const center = await tx.center.create({
      data: { name: tag + "-c", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    // 30 rows: more than one page at the default 25, so a missing `take` shows.
    const ids: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber: `${tag}-${String(i).padStart(3, "0")}`,
          type: "teacher_statement",
          issuedToId: teacher.id,
          centerId: center.id,
          subtotal: 100 + i,
          commission: 0,
          netAmount: 100 + i,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        },
        select: { id: true },
      });
      ids.push(inv.id);
    }
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: tag, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"), price: 20000,
        maxStudents: 30, status: "active",
      },
    });
    const mkSession = (day: string) =>
      tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id,
          originalDate: new Date(day), date: new Date(day),
          startTime: "10:00", endTime: "11:00", status: "completed",
        },
      });
    const s1 = await mkSession("2026-02-02T10:00:00Z");
    const s2 = await mkSession("2026-05-02T10:00:00Z");
    await tx.transaction.create({ data: { refNumber: `${tag}-p1`, type: "payment", amount: 10000, lessonId: s1.id, status: "completed" } });
    await tx.transaction.create({ data: { refNumber: `${tag}-p2`, type: "payment", amount: 7000, lessonId: s2.id, status: "completed" } });
    await tx.transaction.create({ data: { refNumber: `${tag}-c1`, type: "commission", amount: 400, lessonId: s1.id, status: "completed" } });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });

    return { teacher: teacher.id, center: center.id, ids, course: course.id, sessions: [s1.id, s2.id] };
  });

  const generated: string[] = [];
  try {
    const scoped = { issuedToId: fx.teacher };

    const first = await listInvoices(scoped);
    assert(first.data.length === 25,
      `default page is bounded at 25, not the whole set (got ${first.data.length})`);
    assert(first.total === 30,
      `total reports the whole set so the screen can say which slice it shows (got ${first.total})`);
    assert(first.page === 1 && first.limit === 25,
      `echoes the page it served (got page ${first.page} limit ${first.limit})`);

    const second = await listInvoices({ ...scoped, page: "2" });
    assert(second.data.length === 5,
      `second page carries the remainder (got ${second.data.length}, want 5)`);

    const firstIds = new Set(first.data.map((r) => r.id));
    assert(second.data.every((r) => !firstIds.has(r.id)),
      "the two pages do not overlap");

    const newestFirst = first.data[0]?.invoiceNumber;
    assert(newestFirst === `${tag}-029`,
      `newest-first ordering survives paging (got ${newestFirst})`);

    const capped = await listInvoices({ ...scoped, limit: "500" });
    assert(capped.limit === 100,
      `an oversized limit clamps to the shared cap rather than being honoured (got ${capped.limit})`);

    const filtered = await listInvoices({ issuedToId: fx.teacher, type: "payment_receipt" });
    assert(filtered.total === 0,
      `the type filter still applies alongside paging (got ${filtered.total})`);

    // The statement's gross moved from "every session id into an IN clause" to
    // one JOIN aggregate. This is a money figure on a document an accountant
    // sends out, so it is compared against the derivation it replaced rather
    // than against a number written here.
    const legacyGross = await withPlatformContext(async (tx) => {
      const sessions = await tx.session.findMany({ where: { teacherId: fx.teacher }, select: { id: true } });
      const agg = await tx.transaction.aggregate({
        where: { lessonId: { in: sessions.map((s) => s.id) }, type: "payment" },
        _sum: { amount: true },
      });
      return agg._sum.amount ?? 0;
    });
    const statement = await generateInvoice({ type: "teacher_statement", issuedToId: fx.teacher });
    generated.push(statement.id);
    assert(statement.subtotal === legacyGross,
      `statement gross equals the legacy session-ids-IN derivation (${statement.subtotal} vs ${legacyGross})`);
    assert(statement.subtotal === 17000,
      `and it is the sum of this teacher's payments only (got ${statement.subtotal}, want 17000)`);

    // A statement is a document an accountant sends out. Aggregating
    // type:"payment" only overstated its gross by the whole refunded total
    // (REFUND_DECISION.md §1.4).
    await withPlatformContext(async (tx) => {
      await tx.transaction.create({ data: { refNumber: `${tag}-r1`, type: "refund", amount: 4000, lessonId: fx.sessions[0], status: "completed" } });
      await tx.transaction.create({ data: { refNumber: `${tag}-cp1`, type: "payment", amount: 9000, centerId: fx.center, status: "completed" } });
      await tx.transaction.create({ data: { refNumber: `${tag}-cr1`, type: "refund", amount: 3000, centerId: fx.center, status: "completed" } });
    });

    const refunded = await generateInvoice({ type: "teacher_statement", issuedToId: fx.teacher });
    generated.push(refunded.id);
    assert(refunded.subtotal === 13000,
      `a teacher statement is NET of refunds (got ${refunded.subtotal}, want 17000 − 4000 = 13000)`);

    const centerDoc = await generateInvoice({ type: "center_statement", centerId: fx.center });
    generated.push(centerDoc.id);
    assert(centerDoc.subtotal === 6000,
      `a centre statement is NET of refunds too (got ${centerDoc.subtotal}, want 9000 − 3000 = 6000)`);
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM invoices WHERE id = ANY($1::uuid[])`, [[...fx.ids, ...generated]]);
      await c.query(`DELETE FROM transactions WHERE ref_number LIKE $1`, [tag + "-%"]);
      await c.query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [fx.sessions]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = $1`, [fx.teacher]);
      await c.query(`DELETE FROM centers WHERE id = $1`, [fx.center]);
      await c.query(`DELETE FROM users WHERE id = $1`, [fx.teacher]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite m16-invoices.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
