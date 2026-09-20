// BIZ-03 (SECURITY_AUDIT.md 2026-09-11) — a monthly subscription bought at
// 15:00 must cover THAT day's lesson. Sessions are dated at midnight and
// coverage compares `periodStart <= session.date`, so a window opening at the
// purchase instant missed the purchase day and covered day 30 instead.
import { withPlatformContext } from "@repo/database";
import { createWalkInSubscription, monthlyWindow } from "@repo/server-core/services/subscriptions/subscriptions";
import { coveredStudentIds } from "@repo/server-core/services/subscriptions/coverage";
import { startOfPlatformDay, todayKey } from "@repo/server-core/lib/date-key";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "biz03-monthly-window.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const tag = "b03s-" + rid(); __sweepTag = tag;

  console.log("\n[1] the window itself: opens at the start of the platform day, closes just before day 30's start");
  const at = new Date();
  const w = monthlyWindow(at);
  const dayStart = startOfPlatformDay(todayKey(at));
  assert(w.periodStart.getTime() === dayStart.getTime(), `periodStart is the platform-day start (${w.periodStart.toISOString()})`);
  assert(w.periodEnd.getTime() === dayStart.getTime() + 30 * DAY - 1, "periodEnd is start + 30 days − 1 ms");
  assert(w.periodStart.getTime() <= at.getTime(), "the purchase instant is inside its own window");

  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "10:00", endTime: "11:00", startDate: new Date(Date.now() - 30 * DAY), maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000 } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
    // UTC midnight of the PLATFORM (Cairo) day, not of the UTC day. Between
    // 00:00 and 03:00 Cairo the two are different dates, and `new Date()` with
    // setUTCHours(0) then dates "today's" session on YESTERDAY's Cairo day —
    // which the window correctly refuses, failing this suite for three hours a
    // night. The day boundary for money is Cairo everywhere (see
    // docs/decisions/money-day-boundary.md); the fixture now says so too.
    const today = new Date(`${todayKey()}T00:00:00.000Z`);
    const mk = (d: Date) => tx.session.create({ data: { courseId: course.id, teacherId: teacher.id, originalDate: d, date: d, startTime: "10:00", endTime: "11:00", status: "scheduled" } });
    const sToday = await mk(today);
    const sDay29 = await mk(new Date(today.getTime() + 29 * DAY));
    const sDay30 = await mk(new Date(today.getTime() + 30 * DAY));
    const sYesterday = await mk(new Date(today.getTime() - DAY));
    return { owner: owner.id, center: center.id, course: course.id, student: stu.id, sToday, sDay29, sDay30, sYesterday };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center, locale: "en" } as SessionUser;

  console.log("\n[2] a walk-in month bought now covers today's lesson and 29 more, not yesterday's and not day 30");
  await createWalkInSubscription({ studentId: fx.student, courseId: fx.course, plan: "monthly", paymentMethod: "cash" }, owner);
  const covered = (s: { id: string; courseId: string; date: Date }) =>
    withPlatformContext(async (tx) => (await coveredStudentIds(tx, s, [fx.student])).has(fx.student));
  assert(await covered(fx.sToday), "today's lesson is covered — the purchase day");
  assert(await covered(fx.sDay29), "day 29 is covered");
  assert(!(await covered(fx.sDay30)), "day 30 is not (thirty lessons, not thirty-one)");
  assert(!(await covered(fx.sYesterday)), "yesterday's lesson is not");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
