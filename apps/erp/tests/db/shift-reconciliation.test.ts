import { withPlatformContext } from "@repo/database";
import {
  openShift,
  closeShift,
  myOpenShift,
  getShiftSummary,
  listShiftReconciliation,
} from "@repo/server-core/services/center/shifts";
import { createWalkInSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { recordPayment } from "@repo/server-core/services/payments/payments";
import { refundPayment } from "@repo/server-core/services/payments/refund-payment";
import { REPORT_EXPORTS } from "@repo/server-core/services/reports/report-export";
import { BusinessRuleError, ForbiddenError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "shift-reconciliation.test.ts";

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
const DAY = 24 * 60 * 60 * 1000;

async function caught(fn: () => Promise<unknown>): Promise<unknown | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  const tag = "shf-" + rid();
  __sweepTag = tag;
  console.log("Shift reconciliation DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const colleague = await tx.user.create({
      data: { name: `${tag}-colleague`, role: "center_admin", email: `${tag}-c@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18),
        status: "active", ownerUserId: owner.id,
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 0,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date(Date.now() - 30 * DAY),
        maxStudents: 30, status: "active", price: 40000, pricePerSession: 5000,
      },
    });
    const students: string[] = [];
    for (let i = 0; i < 3; i++) {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      students.push(stu.id);
      await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
      await tx.enrollment.create({
        data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
    }
    const sessions: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sess = await tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id,
          originalDate: new Date(Date.now() + (i + 1) * DAY), date: new Date(Date.now() + (i + 1) * DAY),
          startTime: "10:00", endTime: "11:00", status: "scheduled",
        },
      });
      sessions.push(sess.id);
    }
    return { owner: owner.id, colleague: colleague.id, center: center.id, course: course.id, students, sessions };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;
  const colleague = { id: fx.colleague, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  console.log("\n[1] the stamp is derived from the recorder's open shift");
  const before = await recordPayment({ studentId: fx.students[0], amount: 3000 }, owner);
  assert(before.shiftId === null, "money recorded BEFORE any shift opens carries shiftId NULL");

  const shift = await openShift(owner, { openingFloat: 10000 });
  assert(shift.status === "open" && shift.openingFloat === 10000, "shift opens with a 100 EGP float");

  const dupErr = await caught(() => openShift(owner, {}));
  assert(dupErr instanceof BusinessRuleError, "[5] a second open for the same staff member refuses");
  const colleagueShift = await openShift(colleague, { openingFloat: 0 });
  assert(colleagueShift.status === "open", "…but a COLLEAGUE's own drawer opens fine (per-staff, not per-center)");

  const cashSub = await createWalkInSubscription(
    { studentId: fx.students[0], courseId: fx.course, plan: "per_session", sessionId: fx.sessions[0] },
    owner,
  );
  const instapaySub = await createWalkInSubscription(
    { studentId: fx.students[1], courseId: fx.course, plan: "per_session", sessionId: fx.sessions[1], paymentMethod: "instapay" },
    owner,
  );
  const manual = await recordPayment({ studentId: fx.students[2], amount: 7000 }, owner);
  const refund = await refundPayment(
    { paymentId: manual.id, amount: 2000, reason: "refund test", refundChannel: "cash_drawer" },
    owner,
  );
  const stamped = await withPlatformContext((tx) =>
    tx.payment.findMany({
      where: { id: { in: [manual.id, refund.id] } },
      select: { shiftId: true },
    }),
  );
  assert(
    stamped.every((p) => p.shiftId === shift.id),
    "walk-in + manual + refund rows all carry THIS shift's id",
  );

  console.log("\n[2] buckets + the drawer expectation");
  const live = await myOpenShift(owner);
  const cashB = live?.buckets.find((b) => b.method === "cash");
  const instaB = live?.buckets.find((b) => b.method === "instapay");
  assert(
    cashB?.received === 12000 && cashB?.refunded === 2000 && cashB?.net === 10000,
    "cash bucket: received 120, refunded 20, net 100 EGP (walk-in 50 + manual 70 − refund 20)",
  );
  assert(instaB?.net === 5000, "instapay bucket: net 50 EGP — its own bucket, bank-side");
  assert(
    live?.expectedCashNow === 20000,
    "[3] expected = float 100 + cash net 100 = 200 EGP — instapay absent, the refund already subtracted",
  );

  console.log("\n[4] a short count freezes a negative variance");
  const wrongOwnerErr = await caught(() => closeShift(colleague, shift.id, { countedCash: 19000 }));
  assert(wrongOwnerErr instanceof ForbiddenError, "[5] a colleague cannot close somebody else's drawer");

  const closed = await closeShift(owner, shift.id, { countedCash: 19000, note: "short 10" });
  assert(
    closed.status === "closed" && closed.expectedCash === 20000 &&
      closed.countedCash === 19000 && closed.variance === -1000,
    "close freezes expected 200, counted 190, variance −10 EGP",
  );
  const reclose = await caught(() => closeShift(owner, shift.id, { countedCash: 20000 }));
  assert(reclose instanceof BusinessRuleError, "[5] a second close refuses — frozen means frozen");

  const after = await recordPayment({ studentId: fx.students[0], amount: 1000 }, owner);
  assert(after.shiftId === null, "[1] money recorded AFTER close carries shiftId NULL again");

  const frozen = await getShiftSummary(owner, shift.id);
  assert(
    frozen.expectedCashNow === 20000 && frozen.variance === -1000,
    "the summary of a closed shift returns the FROZEN figures (the post-close payment moved nothing)",
  );

  console.log("\n[6] the export is the screen");
  const screen = await listShiftReconciliation(owner, {});
  const mine = screen.find((r) => r.id === shift.id);
  assert(
    mine?.expectedCash === 20000 && mine?.countedCash === 19000 &&
      mine?.variance === -1000 && mine?.bankNet === 5000,
    "screen row: expected 200 / counted 190 / variance −10 / bank 50 EGP",
  );
  const exported = await REPORT_EXPORTS["shift-reconciliation"].load({ user: owner });
  const exportRow = exported.rows.find(
    (r) => (r as { expectedCash?: number }).expectedCash === 20000,
  ) as Record<string, unknown> | undefined;
  assert(
    exported.rows.length === screen.length &&
      exportRow?.countedCash === mine?.countedCash &&
      exportRow?.variance === mine?.variance &&
      exportRow?.bankNet === mine?.bankNet,
    "export rows equal the screen's — one service function, two renderings",
  );

  await closeShift(colleague, colleagueShift.id, { countedCash: 0 });

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
