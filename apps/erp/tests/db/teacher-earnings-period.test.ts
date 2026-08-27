import { withPlatformContext } from "@repo/database";
import { getTeacherWalletTransactions } from "@/lib/services/finance/teacher-wallet";
import { getTeacherDashboard } from "@repo/server-core/services/reports/reports";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "teacher-earnings-period.test.ts";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const su = (id: string): SessionUser => ({ id, role: "teacher" }) as SessionUser;

const OLD_DAY = "2026-07-01";
const OLD_INSTANT = new Date("2026-07-01T12:00:00Z"); // midday, inside the Cairo day
const NEWER_DAY = "2026-07-15";
const NEWER_INSTANT = new Date("2026-07-15T12:00:00Z");

async function main() {
  const tag = "tearn-" + rid();
  __sweepTag = tag;
  console.log("Teacher earnings-by-period DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-student`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });

    await tx.transaction.create({
      data: { refNumber: `TXN-${tag}-1`, type: "payment", amount: 10000, toEntityId: teacher.id,
        status: "completed", notes: `${tag} old credit`, createdAt: OLD_INSTANT },
    });
    await tx.transaction.create({
      data: { refNumber: `TXN-${tag}-2`, type: "commission", amount: 400, fromEntityId: teacher.id,
        status: "completed", notes: `${tag} old commission`, createdAt: OLD_INSTANT },
    });
    await tx.transaction.create({
      data: { refNumber: `TXN-${tag}-3`, type: "payment", amount: 5000, toEntityId: teacher.id,
        status: "completed", notes: `${tag} newer credit`, createdAt: NEWER_INSTANT },
    });

    const course = await tx.course.create({
      data: {
        centerId: null, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-06-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 40000,
      },
    });
    const oldSession = await tx.session.create({
      data: { courseId: course.id, teacherId: teacher.id, originalDate: OLD_INSTANT, date: OLD_INSTANT,
        startTime: "10:00", endTime: "11:00", status: "completed" },
    });
    const newSession = await tx.session.create({
      data: { courseId: course.id, teacherId: teacher.id, originalDate: NEWER_INSTANT, date: NEWER_INSTANT,
        startTime: "10:00", endTime: "11:00", status: "completed" },
    });
    await tx.attendanceRecord.create({
      data: { sessionId: oldSession.id, studentId: student.id, courseId: course.id,
        status: "present", markedBy: teacher.id },
    });
    await tx.attendanceRecord.create({
      data: { sessionId: newSession.id, studentId: student.id, courseId: course.id,
        status: "absent", markedBy: teacher.id },
    });

    return { teacher: teacher.id };
  });

  const t = su(fx.teacher);

  console.log("\n[1] wallet transactions — the period bound");
  const bounded = await getTeacherWalletTransactions(t, { from: OLD_DAY, to: OLD_DAY });
  assert(bounded.data.length === 2, "from=to=OLD_DAY returns exactly the two old-day rows");
  assert(bounded.data.every((r) => r.createdAt >= new Date("2026-06-30T00:00:00Z") && r.createdAt < new Date("2026-07-02T00:00:00Z")),
    "every returned row sits inside the requested Cairo day");

  console.log("\n[2] wallet transactions — server-side period totals");
  assert(bounded.totals?.earned === 10000, "earned = the whole period's credits (10000)");
  assert(bounded.totals?.deducted === 400, "deducted = the whole period's debits (400)");
  assert(bounded.totals?.net === 9600, "net = earned − deducted");
  const wide = await getTeacherWalletTransactions(t, { from: OLD_DAY, to: NEWER_DAY, take: 1 });
  assert(wide.data.length === 1 && wide.totals?.earned === 15000 && wide.totals?.net === 14600,
    "totals cover the WHOLE range even when the page shows one row — never a page sum");

  console.log("\n[3] wallet transactions — no period, unchanged behaviour");
  const all = await getTeacherWalletTransactions(t);
  assert(all.data.length === 3, "no period returns the full history");
  assert(all.totals === null, "and no totals — a lifetime sum is deliberately not offered here");

  console.log("\n[4] dashboard — bounded attendance rate + the period echo");
  const lifetime = await getTeacherDashboard(t);
  assert(lifetime.avgAttendanceRate === 50, `lifetime rate is 50 (got ${lifetime.avgAttendanceRate})`);
  assert(lifetime.period.from === null && lifetime.period.to === null, "omitted period is echoed as null/null — lifetime, said out loud");
  const oldOnly = await getTeacherDashboard(t, { from: OLD_DAY, to: OLD_DAY });
  assert(oldOnly.avgAttendanceRate === 100, `old-day rate is 100 (got ${oldOnly.avgAttendanceRate})`);
  assert(oldOnly.period.from === OLD_DAY && oldOnly.period.to === OLD_DAY, "the answered period is echoed back");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
