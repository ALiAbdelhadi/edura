import { withPlatformContext } from "@repo/database";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { bulkMarkAttendance } from "@repo/server-core/services/attendance/attendance";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "center-held-refund.test.ts";

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

async function main() {
  const tag = "chr-" + rid();
  __sweepTag = tag;
  console.log("Center-held refund DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const admin = await tx.user.create({
      data: { name: `${tag}-admin`, role: "super_admin", email: `${tag}-a@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18),
        status: "active", ownerUserId: owner.id, walletBalance: 0, creditBalance: 0,
      },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 1000,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date(Date.now() - 30 * DAY),
        maxStudents: 30, status: "active", price: 0, pricePerSession: 20000,
        settlementBasis: "session_price",
      },
    });
    const mkStudent = async (i: number) => {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      await tx.studentProfile.create({
        data: { userId: stu.id, fullName: `${tag}-stu${i}`, familyLinkCode: `${tag.toUpperCase()}F${i}` },
      });
      await tx.enrollment.create({
        data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
      return stu.id;
    };
    const sCash = await mkStudent(0);
    const sOnline = await mkStudent(1);
    const mkSession = async () =>
      (
        await tx.session.create({
          data: {
            courseId: course.id, teacherId: teacher.id,
            originalDate: new Date(), date: new Date(),
            startTime: "10:00", endTime: "11:00", status: "scheduled",
          },
        })
      ).id;
    const lessonCash = await mkSession();
    const lessonOnline = await mkSession();
    const cover = (studentId: string, sessionId: string, paymentMethod: "cash" | "online_paymob") =>
      tx.subscription.create({
        data: {
          studentId, targetType: "center", teacherId: teacher.id, centerId: center.id,
          courseId: course.id, sessionId, plan: "per_session", price: 20000,
          paymentMethod, status: "active", source: "walk_in", activatedAt: new Date(),
        },
      });
    await cover(sCash, lessonCash, "cash");
    await cover(sOnline, lessonOnline, "online_paymob");
    return {
      teacher: teacher.id, owner: owner.id, admin: admin.id, center: center.id,
      sCash, sOnline, lessonCash, lessonOnline,
    };
  });

  const teacherUser = { id: fx.teacher, role: "teacher" } as unknown as SessionUser;
  const accountant = { id: fx.admin, role: "accountant" } as unknown as SessionUser;
  const snapshot = () =>
    withPlatformContext(async (tx) => ({
      wallet: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))!.walletBalance,
      credit: (await tx.center.findUnique({ where: { id: fx.center }, select: { creditBalance: true } }))!.creditBalance,
      teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
    }));

  console.log("\n[1] platform-held refund — byte-identical to pre-Phase-4");
  await bulkMarkAttendance(fx.lessonOnline, [{ studentId: fx.sOnline, status: "present" }], fx.owner, fx.center);
  await completeSession(fx.lessonOnline, teacherUser);
  const afterOnlineSettle = await snapshot();
  const stOnline = (await withPlatformContext((tx) =>
    tx.sessionSettlement.findUnique({ where: { sessionId: fx.lessonOnline } }),
  ))!;
  assert(afterOnlineSettle.wallet === stOnline.centerTotal, "settlement credited the center wallet (platform-held)");
  await refundLessonForStudent(fx.lessonOnline, fx.sOnline, "duplicate charge", accountant);
  const afterOnlineRefund = await snapshot();
  assert(afterOnlineRefund.wallet === 0 && afterOnlineRefund.teacher === 0, "both wallets reversed to 0");
  assert(afterOnlineRefund.credit === 0, "credit_balance never moved");

  console.log("\n[2] center-held refund — the clearing model, no special case");
  await bulkMarkAttendance(fx.lessonCash, [{ studentId: fx.sCash, status: "present" }], fx.owner, fx.center);
  await completeSession(fx.lessonCash, teacherUser);
  const st = (await withPlatformContext((tx) =>
    tx.sessionSettlement.findUnique({ where: { sessionId: fx.lessonCash } }),
  ))!;
  const afterSettle = await snapshot();
  assert(afterSettle.wallet === 0, "settlement moved NO center wallet (center-held)");
  assert(
    afterSettle.credit === -(st.teacherTotal + st.platformTotal),
    `settlement position: −(teacherNet+fees) = ${-(st.teacherTotal + st.platformTotal)}`,
  );
  assert(afterSettle.teacher === st.teacherTotal, "teacher credited the full net");

  await refundLessonForStudent(fx.lessonCash, fx.sCash, "student withdrew", accountant);
  const afterRefund = await snapshot();
  assert(afterRefund.teacher === 0, "teacher wallet reversed to 0");
  assert(afterRefund.wallet === 0, "center wallet STILL untouched — nothing was there to reverse");
  assert(
    afterRefund.credit === -20000,
    `total position = −price (−200 EGP): the center holds the gross the platform just refunded (got ${afterRefund.credit})`,
  );
  const reversalRow = await withPlatformContext((tx) =>
    tx.centerWalletLedger.findFirst({
      where: { centerId: fx.center, type: "refund_reversal", sessionId: fx.lessonCash },
      select: { delta: true },
    }),
  );
  assert(reversalRow?.delta === -st.centerTotal, "refund_reversal ledger row carries −centerNet");
  const studentWallet = await withPlatformContext((tx) =>
    tx.studentProfile.findUnique({ where: { userId: fx.sCash }, select: { walletBalance: true } }),
  );
  assert(studentWallet?.walletBalance === 20000, "the student was made whole (full price to their wallet)");

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
