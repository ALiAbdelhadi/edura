/**
 * B.1#12 — subscription renewal reminders (API session 2).
 *
 * Monthly coverage is manual-renewal (decision #2 — no auto-charge) and used
 * to expire silently. `runSubscriptionRenewalReminders` sweeps the
 * [status, periodEnd] index at T-5/T-2/T-0 Cairo days and tells the student
 * AND their linked parents through the existing notify path.
 *
 * What is proven here, against the real job:
 *   1. A subscription ending at T-2 produces `subscription_expiring` rows for
 *      the student and the approved parent, carrying daysLeft + the ids.
 *   2. A subscription outside every bucket produces nothing.
 *   3. An EXPIRED subscription at T-2 produces nothing — reminders are for
 *      windows still alive.
 *   4. IDEMPOTENT: a second run skips the already-reminded pair — no
 *      duplicate rows for the same (subscription, bucket).
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only renewal-reminders
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { runSubscriptionRenewalReminders } from "@/lib/services/cron/jobs";
import { shiftDayKey, todayKey } from "@repo/server-core/lib/date-key";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "renewal-reminders.test.ts";

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
/** Midday UTC inside the Cairo day `key` — safely inside dayRange(key, key). */
const middayOf = (key: string) => new Date(`${key}T12:00:00Z`);

async function main() {
  const tag = "rnwl-" + rid();
  __sweepTag = tag;
  console.log("Renewal-reminders DB tests —", tag);

  const now = new Date();
  const t2 = middayOf(shiftDayKey(todayKey(now), 2));
  const t9 = middayOf(shiftDayKey(todayKey(now), 9));

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-student`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    const parent = await tx.user.create({
      data: { name: `${tag}-parent`, role: "parent", email: `${tag}-p@x.io`, status: "active" },
    });
    await tx.parentStudentLink.create({
      data: { parentId: parent.id, studentId: student.id, status: "approved", initiatedBy: "parent" },
    });
    const course = await tx.course.create({
      data: {
        centerId: null, teacherId: teacher.id, title: `${tag}-course`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000,
      },
    });
    // A second course for the far-out subscription: one ACTIVE monthly per
    // (student, course) is a partial unique, so two live windows need two
    // groups — which is also the realistic shape.
    const course2 = await tx.course.create({
      data: {
        centerId: null, teacherId: teacher.id, title: `${tag}-course2`, subject: "Math",
        daysOfWeek: [2], startTime: "12:00", endTime: "13:00", startDate: new Date("2026-01-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000,
      },
    });
    const subBase = {
      targetType: "teacher" as const, teacherId: teacher.id, centerId: null,
      plan: "monthly" as const, price: 30000, source: "online" as const,
    };
    const ending = await tx.subscription.create({
      data: { ...subBase, courseId: course.id, studentId: student.id, status: "active",
        activatedAt: new Date(now.getTime() - 28 * 86400_000), periodStart: new Date(now.getTime() - 28 * 86400_000),
        periodEnd: t2 },
    });
    const far = await tx.subscription.create({
      data: { ...subBase, courseId: course2.id, studentId: student.id, status: "active",
        activatedAt: now, periodStart: now, periodEnd: t9 },
    });
    // Same T-2 end date but already EXPIRED — a dead window gets no reminder.
    const dead = await tx.user.create({
      data: { name: `${tag}-student2`, role: "student", email: `${tag}-s2@x.io`, status: "active" },
    });
    const expired = await tx.subscription.create({
      data: { ...subBase, courseId: course.id, studentId: dead.id, status: "expired",
        activatedAt: new Date(now.getTime() - 60 * 86400_000), periodStart: new Date(now.getTime() - 60 * 86400_000),
        periodEnd: t2 },
    });
    return { student: student.id, parent: parent.id, ending: ending.id, far: far.id, expired: expired.id };
  });

  const rowsFor = (subId: string) =>
    withPlatformContext((tx) =>
      tx.notification.findMany({
        where: { type: "subscription_expiring", data: { path: ["subscriptionId"], equals: subId } },
        select: { userId: true, data: true },
      }),
    );

  console.log("\n[1] the T-2 subscription reminds student AND parent");
  const first = await runSubscriptionRenewalReminders(now);
  assert(first.notified >= 1, `the sweep sent at least one reminder (notified=${first.notified})`);
  const rows = await rowsFor(fx.ending);
  const recipients = new Set(rows.map((r) => r.userId));
  assert(recipients.has(fx.student) && recipients.has(fx.parent),
    "one row each for the student and the approved parent");
  assert(rows.every((r) => (r.data as { daysLeft?: number }).daysLeft === 2),
    "the rows carry daysLeft: 2 — the bucket that fired");

  console.log("\n[2] outside the buckets, and dead windows");
  assert((await rowsFor(fx.far)).length === 0, "a subscription ending in 9 days gets nothing — not a bucket");
  assert((await rowsFor(fx.expired)).length === 0, "an EXPIRED subscription at T-2 gets nothing — reminders are for live windows");

  console.log("\n[3] idempotence per (subscription, bucket)");
  const countBefore = rows.length;
  const second = await runSubscriptionRenewalReminders(now);
  assert(second.skipped >= 1, `a second run skips the already-reminded pair (skipped=${second.skipped})`);
  assert((await rowsFor(fx.ending)).length === countBefore, "no duplicate rows — the double-fired schedule costs a no-op");

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
