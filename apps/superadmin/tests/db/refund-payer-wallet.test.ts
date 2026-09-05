import { withPlatformContext } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "refund-payer-wallet.test.ts";

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

const SESSION_DATE = new Date("2026-02-02T10:00:00Z");

// A distributed lesson, optionally funded by a parent-created subscription.
async function buildLesson(tag: string, opts: { withParent: boolean }) {
  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: tag + "-t", role: "teacher", email: tag + "-t@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: {
        name: tag + "-c",
        shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        status: "active",
        centerShare: 5000,
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        title: tag,
        subject: "Math",
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: 20000,
        maxStudents: 30,
        status: "active",
      },
    });
    const su = await tx.user.create({
      data: { name: tag + "-s", role: "student", email: tag + "-s@x.io", status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: su.id,
        fullName: tag + "-s",
        familyLinkCode: (tag + rid()).slice(0, 18),
        walletBalance: 0,
      },
    });
    await tx.enrollment.create({
      data: {
        studentId: su.id,
        courseId: course.id,
        centerId: center.id,
        status: "active",
        enrolledBy: teacher.id,
      },
    });

    let parent: string | null = null;
    if (opts.withParent) {
      const pu = await tx.user.create({
        data: { name: tag + "-p", role: "parent", email: tag + "-p@x.io", status: "active" },
      });
      await tx.parentProfile.create({ data: { userId: pu.id, walletBalance: 0 } });
      await tx.parentStudentLink.create({
        data: { parentId: pu.id, studentId: su.id, status: "approved", initiatedBy: "parent" },
      });
      const center0 = await tx.center.findUniqueOrThrow({
        where: { id: center.id },
        select: { shortId: true },
      });
      const payment = await tx.payment.create({
        data: {
          centerId: center.id,
          studentId: su.id,
          payerUserId: pu.id,
          courseId: course.id,
          amount: 20000,
          paymentMethod: "cash",
          receiptNumber: `RCP-${center0.shortId}-2026-${rid().slice(0, 5)}`,
          recordedBy: pu.id,
        },
      });
      await tx.subscription.create({
        data: {
          studentId: su.id,
          targetType: "center",
          teacherId: teacher.id,
          centerId: center.id,
          courseId: course.id,
          plan: "monthly",
          price: 20000,
          status: "active",
          source: "online",
          periodStart: new Date("2026-02-01T00:00:00Z"),
          periodEnd: new Date("2026-02-28T00:00:00Z"),
          paymentId: payment.id,
          createdBy: pu.id,
          // subs_active_needs_activation: an active subscription must carry it.
          activatedAt: new Date("2026-02-01T00:00:00Z"),
        },
      });
      parent = pu.id;
    }

    const s1 = await tx.session.create({
      data: {
        courseId: course.id,
        teacherId: teacher.id,
        originalDate: SESSION_DATE,
        date: SESSION_DATE,
        startTime: "10:00",
        endTime: "11:00",
        status: "scheduled",
      },
    });
    await tx.attendanceRecord.create({
      data: {
        sessionId: s1.id,
        studentId: su.id,
        courseId: course.id,
        centerId: center.id,
        status: "present",
        markedBy: teacher.id,
      },
    });
    return { teacher: teacher.id, student: su.id, parent, session: s1.id };
  });
  await completeSession(fx.session, { id: fx.teacher, role: "teacher" } as SessionUser);
  return fx;
}

const studentWallet = (studentId: string) =>
  withPlatformContext(async (tx) => {
    const p = await tx.studentProfile.findUnique({
      where: { userId: studentId },
      select: { walletBalance: true },
    });
    return p!.walletBalance;
  });
const parentWallet = (parentId: string) =>
  withPlatformContext(async (tx) => {
    const p = await tx.parentProfile.findUnique({
      where: { userId: parentId },
      select: { walletBalance: true },
    });
    return p!.walletBalance;
  });

async function main() {
  const tag = "rpay-" + rid();
  __sweepTag = tag;
  console.log("Refund credits the payer —", tag);
  const suId = await withPlatformContext((tx) =>
    tx.user
      .create({
        data: { name: tag + "-su", role: "super_admin", email: tag + "-su@x.io", status: "active" },
      })
      .then((u) => u.id),
  );
  const su = { id: suId, role: "super_admin" } as SessionUser;

  // A — a parent funded the lesson: the PARENT wallet is credited.
  const a = await buildLesson(tag + "a", { withParent: true });
  const outA = (await refundLessonForStudent(a.session, a.student, "parent paid", su)) as {
    creditedTo: string;
    creditedUserId: string;
  };
  assert(outA.creditedTo === "parent", `credited the parent (got '${outA.creditedTo}')`);
  assert(outA.creditedUserId === a.parent, "credited the parent who actually paid");
  assert((await parentWallet(a.parent!)) === 20000, "parent wallet +20000");
  assert(
    (await studentWallet(a.student)) === 0,
    "student wallet untouched — the money went to whoever parted with it",
  );
  const pRows = await withPlatformContext((tx) =>
    tx.parentWalletLedger.findMany({
      where: { parentId: a.parent!, type: "refund" },
      select: { delta: true, balanceAfter: true, beneficiaryStudentId: true },
    }),
  );
  assert(pRows.length === 1, `exactly ONE parent wallet refund ledger row (got ${pRows.length})`);
  assert(
    pRows[0]?.delta === 20000 && pRows[0]?.balanceAfter === 20000,
    "parent ledger row carries the delta and the running balance",
  );
  assert(
    pRows[0]?.beneficiaryStudentId === a.student,
    "parent ledger row names the child it was refunded for",
  );
  const sRowsA = await withPlatformContext((tx) =>
    tx.walletLedger.count({ where: { studentId: a.student, type: "refund" } }),
  );
  assert(sRowsA === 0, "no student wallet ledger row was written");

  // The ledger direction invariant is unchanged: the refund transaction still
  // moves centre -> student regardless of which wallet was credited.
  const txnA = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { lessonId: a.session, type: "refund" },
      select: { toEntityId: true, amount: true },
    }),
  );
  assert(
    txnA?.toEntityId === a.student && txnA?.amount === 20000,
    "transactions row still records centre -> STUDENT (direction invariant held)",
  );

  // B — no parent: the student is credited, exactly as before.
  const b = await buildLesson(tag + "b", { withParent: false });
  const outB = (await refundLessonForStudent(b.session, b.student, "no parent", su)) as {
    creditedTo: string;
  };
  assert(outB.creditedTo === "student", `fell back to the student (got '${outB.creditedTo}')`);
  assert((await studentWallet(b.student)) === 20000, "student wallet +20000");

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
