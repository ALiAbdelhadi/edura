import { withPlatformContext } from "@repo/database";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { bulkMarkAttendance } from "@repo/server-core/services/attendance/attendance";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { settleCenterCreditTopUpFromIntentTx } from "@/lib/services/wallet/center-credit-topup";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "center-credit-clearing.test.ts";

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
  const tag = "ccc-" + rid();
  __sweepTag = tag;
  console.log("Center credit clearing DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
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
        maxStudents: 30, status: "active", price: 0, pricePerSession: 5000,
        settlementBasis: "session_price",
      },
    });
    const students: string[] = [];
    for (let i = 0; i < 4; i++) {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      students.push(stu.id);
      await tx.studentProfile.create({
        data: { userId: stu.id, fullName: `${tag}-stu${i}`, familyLinkCode: `${tag.toUpperCase()}F${i}` },
      });
      await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
      await tx.enrollment.create({
        data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
    }
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
    const sOnline = await mkSession();
    const sCash = await mkSession();
    const sMixed = await mkSession();
    const sWalletCov = await mkSession();

    const cover = (studentId: string, sessionId: string, paymentMethod: "cash" | "online_paymob" | "wallet") =>
      tx.subscription.create({
        data: {
          studentId, targetType: "center", teacherId: teacher.id, centerId: center.id,
          courseId: course.id, sessionId, plan: "per_session", price: 5000,
          paymentMethod, status: "active", source: "walk_in", activatedAt: new Date(),
        },
      });
    await cover(students[0], sOnline, "online_paymob");
    await cover(students[1], sOnline, "online_paymob");
    await cover(students[0], sCash, "cash");
    await cover(students[1], sCash, "cash");
    await cover(students[0], sMixed, "online_paymob");
    await cover(students[1], sMixed, "cash");
    await cover(students[3], sWalletCov, "wallet");

    return {
      teacher: teacher.id, owner: owner.id, center: center.id, course: course.id,
      students, sOnline, sCash, sMixed, sWalletCov,
    };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;
  const teacherUser = { id: fx.teacher, role: "teacher" } as unknown as SessionUser;

  const snapshot = () =>
    withPlatformContext(async (tx) => ({
      wallet: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))!.walletBalance,
      credit: (await tx.center.findUnique({ where: { id: fx.center }, select: { creditBalance: true } }))!.creditBalance,
      teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
    }));

  const mark2 = (sessionId: string) =>
    bulkMarkAttendance(
      sessionId,
      [
        { studentId: fx.students[0], status: "present" },
        { studentId: fx.students[1], status: "present" },
      ],
      fx.owner,
      fx.center,
    );

  const settlementOf = (sessionId: string) =>
    withPlatformContext((tx) => tx.sessionSettlement.findUnique({ where: { sessionId } }));

  console.log("\n[1] all-online lesson — byte-identical to pre-Phase-4");
  await mark2(fx.sOnline);
  let before = await snapshot();
  await completeSession(fx.sOnline, teacherUser);
  let after = await snapshot();
  let st = (await settlementOf(fx.sOnline))!;
  assert(st.platformHeldGross === 10000 && st.centerHeldGross === 0, "grosses: platform 100, center 0");
  assert(after.wallet - before.wallet === st.centerTotal, "wallet_balance += centerNet (platform holds the money)");
  assert(after.credit === before.credit, "credit_balance untouched");
  assert(after.teacher - before.teacher === st.teacherTotal, "teacher credited the full net");
  const onlineRows = await withPlatformContext((tx) =>
    tx.transaction.findMany({ where: { lessonId: fx.sOnline, type: "payment" }, select: { funding: true } }),
  );
  assert(
    onlineRows.length === 2 && onlineRows.every((r) => r.funding === "platform_held"),
    "both payment rows stamped funding=platform_held",
  );

  console.log("\n[2] all-cash lesson — the F2 fix");
  await mark2(fx.sCash);
  before = await snapshot();
  await completeSession(fx.sCash, teacherUser);
  after = await snapshot();
  st = (await settlementOf(fx.sCash))!;
  assert(st.platformHeldGross === 0 && st.centerHeldGross === 10000, "grosses: platform 0, center 100");
  assert(after.wallet === before.wallet, "wallet_balance moves NOTHING — the center's net is already in its drawer");
  assert(after.teacher - before.teacher === st.teacherTotal, "the teacher is still credited their full net");
  assert(
    before.credit - after.credit === st.teacherTotal + st.platformTotal,
    `credit_balance debited teacherNet+fees = ${st.teacherTotal + st.platformTotal}`,
  );
  const cashLedger = await withPlatformContext((tx) =>
    tx.centerWalletLedger.findMany({
      where: { centerId: fx.center, sessionId: fx.sCash },
      orderBy: { createdAt: "asc" },
      select: { type: true, delta: true },
    }),
  );
  assert(
    cashLedger.length === 2 &&
      cashLedger.some((r) => r.type === "teacher_debit" && r.delta === -st.teacherTotal) &&
      cashLedger.some((r) => r.type === "commission_debit" && r.delta === -st.platformTotal),
    "two lesson-referenced ledger rows: teacher_debit + commission_debit",
  );
  const cashRows = await withPlatformContext((tx) =>
    tx.transaction.findMany({ where: { lessonId: fx.sCash, type: "payment" }, select: { funding: true } }),
  );
  assert(cashRows.every((r) => r.funding === "center_held"), "payment rows stamped funding=center_held");

  console.log("\n[3] mixed lesson — split exactly by coverage");
  await mark2(fx.sMixed);
  before = await snapshot();
  await completeSession(fx.sMixed, teacherUser);
  after = await snapshot();
  st = (await settlementOf(fx.sMixed))!;
  assert(st.platformHeldGross === 5000 && st.centerHeldGross === 5000, "grosses split 50/50 by student coverage");
  const perStudentCenterNet = st.centerTotal / 2;
  const perStudentTeacherNet = st.teacherTotal / 2;
  const perStudentFees = st.platformTotal / 2;
  assert(
    after.wallet - before.wallet === perStudentCenterNet,
    "wallet gets only the ONLINE student's centerNet",
  );
  assert(
    before.credit - after.credit === perStudentTeacherNet + perStudentFees,
    "credit debited only for the CASH student's teacherNet+fees",
  );

  console.log("\n[4] cash wallet top-up debits the collecting center");
  before = await snapshot();
  await topUpWalletCash({ studentId: fx.students[3], amount: 5000 }, owner);
  after = await snapshot();
  assert(before.credit - after.credit === 5000, "credit_balance -= the collected cash (50 EGP)");
  const collectRow = await withPlatformContext((tx) =>
    tx.centerWalletLedger.findFirst({
      where: { centerId: fx.center, type: "wallet_cash_collection" },
      select: { delta: true, method: true },
    }),
  );
  assert(collectRow?.delta === -5000 && collectRow?.method === "cash", "wallet_cash_collection ledger row");

  await bulkMarkAttendance(fx.sWalletCov, [{ studentId: fx.students[3], status: "present" }], fx.owner, fx.center);
  before = await snapshot();
  await completeSession(fx.sWalletCov, teacherUser);
  after = await snapshot();
  st = (await settlementOf(fx.sWalletCov))!;
  assert(
    st.platformHeldGross === 5000 && after.wallet - before.wallet === st.centerTotal,
    "a wallet-covered student settles platform-held (the platform holds the float)",
  );

  console.log("\n[5] the credit top-up settler");
  const intentId = await withPlatformContext(async (tx) => {
    const intent = await tx.paymentIntent.create({
      data: {
        studentId: null, payerUserId: fx.owner, purpose: "center_credit_topup",
        centerId: fx.center, amount: 100000, method: "card", gateway: "mock",
        idempotencyKey: `${tag}-cctop`, status: "paid", paidAt: new Date(),
        gatewayOrderId: `${tag}-order`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await settleCenterCreditTopUpFromIntentTx(tx, intent.id, { gatewayRef: `${tag}-ref` });
    return intent.id;
  });
  const topped = await snapshot();
  assert(topped.credit - after.credit === 100000, "credit_balance += 1000 EGP");
  const topRow = await withPlatformContext((tx) =>
    tx.centerWalletLedger.findFirst({
      where: { centerId: fx.center, type: "topup", paymentIntentId: intentId },
      select: { delta: true, balanceAfter: true },
    }),
  );
  assert(
    topRow?.delta === 100000 && topRow?.balanceAfter === topped.credit,
    "topup ledger row carries the running balance",
  );
  const topTxn = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { centerId: fx.center, notes: { contains: intentId } },
      select: { funding: true, amount: true },
    }),
  );
  assert(topTxn?.funding === "platform_held" && topTxn?.amount === 100000, "a platform-held Transaction records the move");

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
