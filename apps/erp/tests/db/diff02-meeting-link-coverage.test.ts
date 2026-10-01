// DIFF-02 (SECURITY_AUDIT.md 2026-09-11) — the meeting link is a paid
// credential. It goes to the owning teacher and centre, and to students (or
// their parents) whose PAID coverage includes today — never on the strength of
// an enrollment alone, because a refund cancels the subscription and leaves
// the enrollment in place.
import { withPlatformContext } from "@repo/database";
import { canSeeMeetingLink } from "@repo/server-core/services/discovery/meeting-link";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "diff02-meeting-link-coverage.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const tag = "d02s-" + rid(); __sweepTag = tag;
  const now = new Date();
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(now.getTime() - 30 * DAY), maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000, pricePerSession: 5000, deliveryMode: "online", onlineUrl: `https://meet.example.com/${tag}` } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    const parent = await tx.user.create({ data: { name: `${tag}-par`, role: "parent", email: `${tag}-p@x.io`, status: "active" } });
    await tx.parentProfile.create({ data: { userId: parent.id } });
    await tx.parentStudentLink.create({ data: { parentId: parent.id, studentId: stu.id, status: "approved", initiatedBy: "parent" } });
    const enrollment = await tx.enrollment.create({ data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: owner.id } });
    const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
    const mkSession = (d: Date) => tx.session.create({ data: { courseId: course.id, teacherId: teacher.id, originalDate: d, date: d, startTime: "10:00", endTime: "11:00", status: "scheduled" } });
    const sessionToday = await mkSession(today);
    const sessionPast = await mkSession(new Date(today.getTime() - 3 * DAY));
    return { owner: owner.id, center: center.id, teacher: teacher.id, course, student: stu.id, parent: parent.id, enrollment: enrollment.id, sessionToday: sessionToday.id, sessionPast: sessionPast.id };
  });
  const course = { id: fx.course.id, teacherId: fx.teacher, centerId: fx.center, onlineUrl: fx.course.onlineUrl };
  const student = { id: fx.student, role: "student" };
  const parent = { id: fx.parent, role: "parent" };
  const see = (viewer: { id: string; role: string; centerId?: string } | null) =>
    withPlatformContext((tx) => canSeeMeetingLink(tx, course, viewer, now));

  console.log("\n[1] owners always see the link; nobody and strangers never do");
  assert(await see({ id: fx.teacher, role: "teacher" }), "the owning teacher sees it");
  assert(await see({ id: fx.owner, role: "center_admin", centerId: fx.center }), "the owning centre sees it");
  assert(!(await see(null)), "no session → no link");
  assert(!(await see({ id: fx.owner, role: "center_admin", centerId: "00000000-0000-0000-0000-000000000000" })), "another centre does not");

  console.log("\n[2] an ACTIVE ENROLLMENT alone is not enough — this is the hole");
  assert(!(await see(student)), "enrolled, unpaid student: no link");
  assert(!(await see(parent)), "…nor the parent");

  console.log("\n[3] a monthly subscription covering today opens it; a refund (cancelled) closes it again");
  const sub = await withPlatformContext((tx) => tx.subscription.create({ data: { studentId: fx.student, courseId: fx.course.id, centerId: fx.center, plan: "monthly", targetType: "center", teacherId: fx.teacher, source: "walk_in", price: 30000, status: "active", enrollmentId: fx.enrollment, periodStart: new Date(now.getTime() - DAY), periodEnd: new Date(now.getTime() + 20 * DAY), activatedAt: now } }));
  assert(await see(student), "covered student sees the link");
  assert(await see(parent), "…and so does the linked parent");
  await withPlatformContext((tx) => tx.subscription.update({ where: { id: sub.id }, data: { status: "cancelled", cancelledAt: now } }));
  assert(!(await see(student)), "after the refund cancels coverage the link is gone, enrollment untouched");
  await withPlatformContext((tx) => tx.subscription.update({ where: { id: sub.id }, data: { status: "active", periodEnd: new Date(now.getTime() - 60_000) } }));
  assert(!(await see(student)), "an expired window does not count either");
  await withPlatformContext((tx) => tx.subscription.delete({ where: { id: sub.id } }));

  console.log("\n[4] a per-session pass counts for today's lesson, not for one that has passed");
  const past = await withPlatformContext((tx) => tx.subscription.create({ data: { studentId: fx.student, courseId: fx.course.id, centerId: fx.center, plan: "per_session", targetType: "center", teacherId: fx.teacher, source: "walk_in", sessionId: fx.sessionPast, price: 5000, status: "active", enrollmentId: fx.enrollment, activatedAt: now } }));
  assert(!(await see(student)), "a pass for a lesson three days ago: no link");
  await withPlatformContext((tx) => tx.subscription.delete({ where: { id: past.id } }));
  await withPlatformContext((tx) => tx.subscription.create({ data: { studentId: fx.student, courseId: fx.course.id, centerId: fx.center, plan: "per_session", targetType: "center", teacherId: fx.teacher, source: "walk_in", sessionId: fx.sessionToday, price: 5000, status: "active", enrollmentId: fx.enrollment, activatedAt: now } }));
  assert(await see(student), "a pass for today's lesson: link");

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
