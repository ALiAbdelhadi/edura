// SECURITY_AUDIT.md L-02 — a monthly subscription's price is split across the
// period's lessons WITHOUT drift: floor per lesson, remainder on the LAST one,
// so the lesson shares sum to exactly what the family paid.
import { withPlatformContext } from "@repo/database";
import { resolveStudentLessonPrices } from "@repo/server-core/services/finance/distribution";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "l02-" + rid(); __sweepTag = tag;
  const PRICE = 10000; // 100 EGP over 3 lessons: 3333 + 3333 + 3334
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2027-01-01T00:00:00Z"), maxStudents: 30, status: "active", price: PRICE, pricePerMonth: PRICE, settlementBasis: "subscription" } });
    const dates = ["2027-01-04", "2027-01-11", "2027-01-18"].map((d) => new Date(`${d}T00:00:00Z`));
    const sessions = [];
    for (const d of dates) sessions.push(await tx.session.create({ data: { courseId: course.id, teacherId: teacher.id, originalDate: d, date: d, startTime: "10:00", endTime: "11:00", status: "scheduled" } }));
    // a cancelled one inside the period must not count
    await tx.session.create({ data: { courseId: course.id, teacherId: teacher.id, originalDate: dates[1]!, date: dates[1]!, startTime: "12:00", endTime: "13:00", status: "cancelled" } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    await tx.subscription.create({ data: { studentId: stu.id, targetType: "center", teacherId: teacher.id, centerId: center.id, courseId: course.id, plan: "monthly", price: PRICE, source: "walk_in", status: "active", activatedAt: new Date("2027-01-01T00:00:00Z"), paymentMethod: "cash", periodStart: new Date("2027-01-01T00:00:00Z"), periodEnd: new Date("2027-01-31T00:00:00Z") } });
    return { course, sessions, student: stu.id };
  });

  console.log("\n[1] shares across the three lessons of the period");
  const shares: number[] = [];
  for (const s of fx.sessions) {
    const prices = await withPlatformContext((tx) =>
      resolveStudentLessonPrices(tx, { course: { id: fx.course.id, price: fx.course.price, pricePerSession: fx.course.pricePerSession, settlementBasis: "subscription" }, sessionId: s.id, sessionDate: s.date, studentIds: [fx.student], courseLevelPrice: 0 }),
    );
    shares.push(prices.get(fx.student) ?? -1);
  }
  assert(shares[0] === 3333 && shares[1] === 3333, `the first lessons take the floor (${shares.join(",")})`);
  assert(shares[2] === 3334, "the LAST lesson of the period carries the remainder");
  assert(shares.reduce((a, b) => a + b, 0) === PRICE, `Σ shares === price exactly (${shares.reduce((a, b) => a + b, 0)} vs ${PRICE}) — no drift, no over-distribution`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: "suite l02-monthly-remainder.test.ts" });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
