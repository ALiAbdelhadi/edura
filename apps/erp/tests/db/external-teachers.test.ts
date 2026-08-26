// Off-system ("external") teachers — proofs against the LIVE test DB, driving
// the REAL authorization surface (center-actor), the REAL services, and the
// REAL money engine. No mocks, no stubbed splits.
//
// The two scenarios the plan called out by name are proofs 2 and 3.
//
//   1. THE RECORD. An external teacher is a shell `users` row with no password,
//      an `external` profile owned by ONE center, and an active affiliation.
//      The DB CHECK refuses an external teacher with no managing center.
//
//   2. THE SHARED STUDENT. The same child studying with an on-platform teacher
//      AND an off-system one stays ONE user row: dedup by phone, dedup by
//      national ID, two enrollments, and the UNIQUE index refuses a duplicate
//      national ID even if the lookup were bypassed.
//
//   3. THE CONVERSION. external -> enrolled preserves EVERY record, proven by
//      counting courses / sessions / enrollments / attendance / grades /
//      payments / transactions / subscriptions before and after and asserting
//      equality — against the counts the journal itself froze in the same
//      transaction. The teacher's user id never changes, which is why.
//
//   4. THE REVERSE. enrolled -> external closes the login through the platform's
//      ONE account gate (status + token_version bump), and is refused when the
//      teacher also works with another center.
//
//   5. MONEY. A manual cash payment runs down the SAME rails (Payment +
//      Transaction + receipt) and every row is labelled `manual` by inheritance
//      from the group. Settlement debits the wallet with the H2 conditional
//      decrement, refuses to over-pay, writes a `payout` ledger row, and the
//      settlement record is append-only at the DB level.
//
//   6. ISOLATION. Another center cannot read, edit or settle this teacher.
//
//   7. SOFT DELETE ONLY. Removal is refused while groups are active; once
//      removed the records survive and restore returns to the same numbers.
//
//   8. THE GAPS REPORT finds the absences manual entry creates silently.
//
//   9. REPORTS combine both kinds by default and narrow only when asked.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors/classes";
import { platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { authorizeCenterActor, RECEPTION, ACCOUNTANT, MANAGER } from "@/lib/authz/center-actor";
import { canSignIn } from "@repo/server-core/auth/login-policy";
import {
  createExternalTeacher,
  listCenterTeachers,
  getExternalTeacher,
  updateExternalTeacher,
  removeExternalTeacher,
  restoreExternalTeacher,
  convertToEnrolled,
  convertToExternal,
  countTeacherRecords,
  createManualStudent,
  enrollManualStudent,
  lookupStudentForManualEntry,
  listTeacherStudents,
  createManualGrade,
  setManualGradeScores,
  buildStatement,
  settleWithTeacher,
  listOutstandingBalances,
  buildGapReport,
} from "@/lib/services/external-teachers";
import { createCourse } from "@repo/server-core/services/center/courses";
import { createWalkInSubscription } from "@/lib/services/subscriptions/subscriptions";
import { bulkMarkAttendance,
  reopenAttendanceForSettlement } from "@/lib/services/attendance/attendance";
import { completeSession } from "@/lib/services/finance/distribution";
import {
  getRevenueReport,
  getAdminDashboard,
} from "@repo/server-core/services/reports/reports";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const STAFF_ALL = [...RECEPTION, ...ACCOUNTANT, ...MANAGER];

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
async function expectError(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
  label: string,
) {
  try {
    await fn();
    assert(false, `${label} — expected ${cls.name} but call RESOLVED`);
  } catch (e) {
    assert(
      e instanceof cls,
      `${label} -> ${cls.name}${e instanceof cls ? "" : ` (got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message})`}`,
    );
  }
}

const su = (u: { id: string; role: string; centerId?: string; name?: string }): SessionUser =>
  ({
    id: u.id,
    role: u.role,
    centerId: u.centerId,
    locale: "ar",
    name: u.name ?? "test",
    email: null,
  }) as unknown as SessionUser;

/** 14 digits, unique per run so parallel runs cannot collide on the index. */
function nationalId(seed: number): string {
  return String(29900000000000 + seed).slice(0, 14);
}

async function main() {
  const tag = "ext-" + Math.floor(Math.random() * 1e9).toString(36);
  const seed = Math.floor(Math.random() * 1e8);
  console.log("Off-system teachers DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string, extra: Record<string, unknown> = {}) =>
      tx.user.create({
        data: {
          name: `${tag}-${key}`,
          role: role as never,
          email: `${tag}-${key}@x.io`,
          status: "active",
          ...extra,
        },
      });

    const ownerA = await mkUser("ownerA", "center_admin");
    const recA = await mkUser("recA", "center_staff");
    const ownerB = await mkUser("ownerB", "center_admin");
    // An ON-PLATFORM teacher at center A — the other half of the shared-student
    // scenario, and the control group for every "combined by default" claim.
    const enrolledTeacher = await mkUser("enrolledT", "teacher");
    await tx.teacherProfile.create({
      data: { userId: enrolledTeacher.id, walletBalance: 0 },
    });

    const centerA = await tx.center.create({
      data: {
        name: tag + "-A",
        shortId: (tag + "AAAA").slice(0, 12).toUpperCase(),
        status: "active",
        ownerUserId: ownerA.id,
      },
    });
    const centerB = await tx.center.create({
      data: {
        name: tag + "-B",
        shortId: (tag + "BBBB").slice(0, 12).toUpperCase(),
        status: "active",
        ownerUserId: ownerB.id,
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: ownerA.id, centerId: centerA.id } });
    await tx.centerAdminProfile.create({ data: { userId: ownerB.id, centerId: centerB.id } });
    await tx.centerStaff.create({
      data: { centerId: centerA.id, staffUserId: recA.id, role: "receptionist" },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: centerA.id,
        teacherId: enrolledTeacher.id,
        status: "active",
        centerShare: 0,
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      },
    });

    return { ownerA, recA, ownerB, enrolledTeacher, centerA: centerA.id, centerB: centerB.id };
  });

  const ownerActorA = await authorizeCenterActor(
    su({ id: fx.ownerA.id, role: "center_admin", centerId: fx.centerA, name: "OwnerA" }),
    { allow: STAFF_ALL },
  );
  const recActorA = await authorizeCenterActor(
    su({ id: fx.recA.id, role: "center_staff", name: "RecA" }),
    { allow: STAFF_ALL },
  );
  const ownerActorB = await authorizeCenterActor(
    su({ id: fx.ownerB.id, role: "center_admin", centerId: fx.centerB, name: "OwnerB" }),
    { allow: STAFF_ALL },
  );

  const createdUserIds: string[] = [
    fx.ownerA.id,
    fx.recA.id,
    fx.ownerB.id,
    fx.enrolledTeacher.id,
  ];
  const centers = [fx.centerA, fx.centerB];

  try {
    // ================= 1. THE RECORD =================
    console.log("\n-- 1. the record --");

    const created = await createExternalTeacher(ownerActorA, {
      fullName: tag + " Mr Hassan",
      phone: "0100" + String(seed).slice(0, 7),
      subjects: ["Physics"],
      // Flat piasters the center takes per LESSON (the legacy no-room split).
      // Kept well under the per-lesson price so the split leaves the teacher a
      // real balance — the engine clamps a share that exceeds the lesson's
      // value, which would make the settlement proof below vacuous.
      centerShare: 1000,
    });
    createdUserIds.push(created.teacherId);

    assert(created.systemStatus === "external", "created teacher is system_status=external");
    assert(created.dataSource === "manual", "the teacher record itself is labelled manual");

    const row = await withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { id: created.teacherId },
        select: { status: true, passwordHash: true, role: true },
      }),
    );
    assert(row?.role === "teacher", "it IS a teacher user row (not a new entity type)");
    assert(row?.status === "shell", "account is `shell` — the existing no-login state");
    assert(row?.passwordHash === null, "no password hash exists");
    // No new login gate was added: the EXISTING partition still classifies them
    // as a www role, and the EXISTING door refuses them on status + no hash.
    assert(canSignIn("www", "teacher"), "teacher is still a www role (no allowlist change)");
    assert(
      row?.status !== "active" && row?.passwordHash === null,
      "so both existing sign-in conditions fail — no second gate was invented",
    );

    const auditCreate = await withPlatformContext((tx) =>
      tx.auditLog.findFirst({
        where: { action: "external_teacher.created", targetId: created.teacherId },
      }),
    );
    assert(auditCreate?.actorId === fx.ownerA.id, "creation writes an audit row naming the actor");

    // The DB CHECK, not just the service: an external teacher with no managing
    // center is the orphan this feature exists to prevent.
    let checkRejected = false;
    try {
      await admin.query(
        `UPDATE teacher_profiles SET managed_by_center_id = NULL WHERE user_id = $1`,
        [created.teacherId],
      );
    } catch {
      checkRejected = true;
    }
    assert(checkRejected, "DB CHECK refuses system_status=external with no managing center");

    // An active account on the same phone must not be forked into a shell.
    await expectError(
      () =>
        createExternalTeacher(ownerActorA, {
          fullName: "dup",
          email: fx.enrolledTeacher.email!,
        }),
      ConflictError,
      "an ACTIVE account on the same email is refused (use a collaboration request)",
    );

    // ================= 2. THE SHARED STUDENT =================
    console.log("\n-- 2. the shared student (one child, two teachers) --");

    // A group for each teacher at the SAME center.
    const extGroup = await createCourse(ownerActorA.acting, {
      teacherId: created.teacherId,
      title: tag + " Physics (off-system)",
      subject: "Physics",
      // PAST dates on purpose: the gaps report only reports on lessons that
      // have already happened, so a future-dated fixture would prove nothing.
      schedulePattern: {
        daysOfWeek: [1, 3],
        startTime: "16:00",
        endTime: "17:30",
        startDate: new Date("2026-07-06T00:00:00Z"),
        endDate: new Date("2026-07-29T00:00:00Z"),
      },
      price: 40000,
      pricePerSession: 5000,
      pricePerMonth: 40000,
      maxStudents: 30,
      // NO dataSource passed, deliberately. It must be DERIVED from the
      // teacher being off-system — a label that is only right where somebody
      // remembered to pass it is the same as no label at all.
    });
    const extCourseId = extGroup.course.id;
    assert(
      extGroup.course.dataSource === "manual",
      "a group for an OFF-SYSTEM teacher is labelled manual with no caller passing it",
    );

    const enrolledGroup = await createCourse(ownerActorA.acting, {
      teacherId: fx.enrolledTeacher.id,
      title: tag + " Maths (on-platform)",
      subject: "Maths",
      schedulePattern: {
        daysOfWeek: [2],
        startTime: "16:00",
        endTime: "17:30",
        startDate: new Date("2026-07-07T00:00:00Z"),
        endDate: new Date("2026-07-28T00:00:00Z"),
      },
      price: 30000,
      pricePerSession: 4000,
      maxStudents: 30,
    });
    const enrolledCourseId = enrolledGroup.course.id;
    assert(
      enrolledGroup.course.dataSource === "system",
      "and the SAME call for an on-platform teacher stays `system` — the derivation reads the teacher, not the caller",
    );

    assert(
      extGroup.sessionsGenerated > 0 && enrolledGroup.sessionsGenerated > 0,
      "both groups generated their sessions",
    );
    const extSessionSource = await withPlatformContext((tx) =>
      tx.session.findFirst({ where: { courseId: extCourseId }, select: { dataSource: true } }),
    );
    assert(
      extSessionSource?.dataSource === "manual",
      "sessions INHERIT the group's provenance (nobody had to pass it twice)",
    );

    const sharedPhone = "0111" + String(seed).slice(0, 7);
    const sharedNid = nationalId(seed);

    // The child is registered FIRST for the off-system teacher, by hand.
    const s1 = await createManualStudent(recActorA, created.teacherId, {
      fullName: tag + " Youssef",
      phone: sharedPhone,
      nationalId: sharedNid,
      guardianPhone: "0122" + String(seed).slice(0, 7),
      courseId: extCourseId,
    });
    createdUserIds.push(s1.studentId);
    assert(s1.created === true, "first registration creates the child");
    assert(s1.enrolledInCourseId === extCourseId, "and enrols them in the group in one step");

    // The SAME child is now typed in again — different spelling of the name,
    // same phone. This is the duplicate the feature exists to prevent.
    const s1again = await createManualStudent(recActorA, created.teacherId, {
      fullName: tag + " Youssef Ahmed",
      phone: sharedPhone,
      courseId: extCourseId,
    });
    assert(s1again.created === false, "re-typing the same phone REUSES the child");
    assert(s1again.studentId === s1.studentId, "and it is the very same user id");
    assert(s1again.reusedBecause === "phone", "the reason is reported, not silent");

    // And by national ID alone, with no phone at all.
    const s1byNid = await createManualStudent(recActorA, created.teacherId, {
      fullName: "totally different spelling",
      nationalId: sharedNid,
    });
    assert(
      s1byNid.created === false && s1byNid.studentId === s1.studentId,
      "the national ID alone also re-finds the same child",
    );
    assert(s1byNid.reusedBecause === "national_id", "matched on national_id");

    const userCount = await withPlatformContext((tx) =>
      tx.user.count({ where: { phone: sharedPhone } }),
    );
    assert(userCount === 1, "exactly ONE user row exists for this child");

    // The hard backstop under the lookup: even a direct insert cannot duplicate
    // the dedup key.
    let nidUniqueHeld = false;
    try {
      await admin.query(
        `INSERT INTO student_profiles (user_id, full_name, family_link_code, national_id)
         VALUES (NULL, $1, $2, $3)`,
        [tag + "-clone", tag + "-clone-code", sharedNid],
      );
    } catch {
      nidUniqueHeld = true;
    }
    assert(nidUniqueHeld, "UNIQUE(national_id) refuses a second row with the same ID");

    // Now the same child ALSO joins the on-platform teacher's group.
    await withPlatformContext((tx) =>
      tx.enrollment.create({
        data: {
          studentId: s1.studentId,
          courseId: enrolledCourseId,
          centerId: fx.centerA,
          status: "active",
          enrolledBy: fx.ownerA.id,
        },
      }),
    );

    const extStudents = await listTeacherStudents(ownerActorA.acting, created.teacherId);
    const sharedRow = extStudents.find((r) => r.studentId === s1.studentId);
    assert(!!sharedRow, "the child appears under the off-system teacher");
    assert(
      sharedRow?.alsoWithEnrolledTeacher === true,
      "and is FLAGGED as also studying with an on-platform teacher — the shared case is visible",
    );

    const enrollmentsForChild = await withPlatformContext((tx) =>
      tx.enrollment.count({ where: { studentId: s1.studentId, status: "active" } }),
    );
    assert(
      enrollmentsForChild === 2,
      "one child, TWO enrollments — the relation is many-to-many through courses, not a duplicated student",
    );

    // The lookup discloses in tiers: on-roster is full, elsewhere is masked.
    const found = await lookupStudentForManualEntry(ownerActorA.acting, { phone: sharedPhone });
    assert(found.found && found.onThisCenterRoster, "lookup finds the child on this roster");
    assert(found.studentId === s1.studentId, "and returns the id, because this center holds them");
    assert(found.existingGroups.length === 2, "showing both groups they already attend");

    const foundElsewhere = await lookupStudentForManualEntry(ownerActorB.acting, {
      phone: sharedPhone,
    });
    assert(foundElsewhere.found === true, "another center learns the child exists");
    assert(foundElsewhere.studentId === null, "but gets NO id");
    assert(
      !!foundElsewhere.name && !foundElsewhere.name.includes("Youssef"),
      "and only a masked name",
    );

    // A malformed national ID is refused BEFORE it can reach the unique index —
    // a mistyped one would permanently block its real owner.
    await expectError(
      () =>
        createManualStudent(recActorA, created.teacherId, {
          fullName: "bad nid",
          nationalId: "123",
        }),
      BusinessRuleError,
      "a national ID that is not 14 digits is refused",
    );

    // A second child, for the money and gaps proofs.
    const s2 = await createManualStudent(recActorA, created.teacherId, {
      fullName: tag + " Mariam",
      phone: "0155" + String(seed).slice(0, 7),
      courseId: extCourseId,
    });
    createdUserIds.push(s2.studentId);

    // ================= 5. MONEY (before the conversion, so it is history) ===
    console.log("\n-- 5. money on the same rails --");

    const firstSession = await withPlatformContext((tx) =>
      tx.session.findFirst({ where: { courseId: extCourseId }, orderBy: { date: "asc" } }),
    );

    const walkIn = await createWalkInSubscription(
      { studentId: s1.studentId, courseId: extCourseId, plan: "monthly" },
      ownerActorA.acting,
    );
    assert(!!walkIn.receiptNumber, "a cash payment at the counter issues a receipt");

    const payment = await withPlatformContext((tx) =>
      tx.payment.findFirst({ where: { receiptNumber: walkIn.receiptNumber } }),
    );
    assert(payment?.dataSource === "manual", "the Payment row is labelled manual");
    assert(payment?.amount === 40000, "and carries the group's monthly price");

    const paySub = await withPlatformContext((tx) =>
      tx.subscription.findUnique({ where: { id: walkIn.id } }),
    );
    assert(paySub?.dataSource === "manual", "the Subscription inherited the label from the group");

    const payTxn = await withPlatformContext((tx) =>
      tx.transaction.findFirst({
        where: { centerId: fx.centerA, type: "payment", fromEntityId: s1.studentId },
        orderBy: { createdAt: "desc" },
      }),
    );
    assert(payTxn?.dataSource === "manual", "and so did the ledger row");
    assert(
      payTxn?.toEntityId === fx.centerA,
      "money direction is unchanged: student -> center, exactly as for an on-platform teacher",
    );

    // Attendance for the first lesson, then complete it so the engine settles.
    //
    // T-9 (2026-08-21): the 7-day edit window now binds `bulkMarkAttendance`
    // too, and this fixture's lessons are deliberately dated in the past. That
    // is not an obstacle to work around — it is THIS module's own workflow:
    // an external teacher has no account, the centre enters lessons manually,
    // and `buildGapReport` prompts exactly this catch-up. So the centre opens
    // the audited door first, which is what a real centre now does.
    // docs/decisions/attendance-reopen-settlement.md
    await reopenAttendanceForSettlement(firstSession!.id, {
      kind: "center",
      centerId: fx.centerA,
      actorId: fx.ownerA.id,
      onBehalfOf: null,
    });
    await bulkMarkAttendance(
      firstSession!.id,
      [{ studentId: s1.studentId, status: "present" }],
      fx.ownerA.id,
      fx.centerA,
    );
    const attRow = await withPlatformContext((tx) =>
      tx.attendanceRecord.findFirst({ where: { sessionId: firstSession!.id } }),
    );
    assert(attRow?.dataSource === "manual", "attendance inherits the label from its session");

    const completion = await completeSession(firstSession!.id, ownerActorA.acting);
    assert(
      completion.distribution.distributed === true,
      "completing the lesson runs the SAME distribution engine",
    );

    const teacherWallet = await withPlatformContext((tx) =>
      tx.teacherProfile.findUnique({
        where: { userId: created.teacherId },
        select: { walletBalance: true },
      }),
    );
    assert(
      (teacherWallet?.walletBalance ?? 0) > 0,
      "the off-system teacher accrued a balance — that IS what the center owes",
    );

    // The window spans the lessons (July) AND today's cash payment.
    const statement = await buildStatement(ownerActorA.acting, created.teacherId, {
      from: new Date("2026-07-01T00:00:00Z"),
      to: new Date("2026-09-01T00:00:00Z"),
    });
    assert(statement.grossCollected === 40000, "statement: what students paid");
    assert(
      statement.walletBalance === teacherWallet?.walletBalance,
      "statement: owed == the live wallet balance, not a recomputation",
    );
    assert(statement.alreadySettled === 0, "statement: nothing settled yet");

    const owedBefore = teacherWallet!.walletBalance;

    // Over-settling is refused by the H2 conditional decrement, not by a
    // read-then-write that a second staff member could race.
    await expectError(
      () =>
        settleWithTeacher(ownerActorA, created.teacherId, {
          amount: owedBefore + 1,
          period: { from: new Date("2026-07-01"), to: new Date("2026-09-01") },
        }),
      BusinessRuleError,
      "settling MORE than is owed is refused (H2 floor)",
    );

    const settled = await settleWithTeacher(ownerActorA, created.teacherId, {
      amount: owedBefore,
      period: { from: new Date("2026-07-01"), to: new Date("2026-09-01") },
      note: "July cash",
    });
    assert(settled.amountPaid === owedBefore, "the full amount was settled");
    assert(settled.remainingOwed === 0, "nothing is owed afterwards");

    const afterWallet = await withPlatformContext((tx) =>
      tx.teacherProfile.findUnique({
        where: { userId: created.teacherId },
        select: { walletBalance: true },
      }),
    );
    assert(afterWallet?.walletBalance === 0, "the wallet was actually debited");

    const payoutTxn = await withPlatformContext((tx) =>
      tx.transaction.findFirst({ where: { refNumber: settled.txnRef } }),
    );
    assert(payoutTxn?.type === "payout", "a `payout` row went into the SAME ledger");
    assert(
      payoutTxn?.fromEntityId === fx.centerA && payoutTxn?.toEntityId === created.teacherId,
      "center -> teacher, the direction the cash physically moved",
    );

    // The statement is evidence, so it must not be editable after the fact.
    let settlementImmutable = false;
    try {
      await withPlatformContext((tx) =>
        tx.externalTeacherSettlement.update({
          where: { id: settled.settlementId },
          data: { amountPaid: 1 },
        }),
      );
    } catch {
      settlementImmutable = true;
    }
    assert(settlementImmutable, "the settlement record is append-only (UPDATE denied)");

    const balances = await listOutstandingBalances(ownerActorA.acting);
    assert(
      balances.some((b) => b.teacherId === created.teacherId && b.owed === 0),
      "the outstanding-balances list reports the teacher at zero",
    );

    // A grade, entered center-side because the teacher cannot sign in.
    const grade = await createManualGrade(recActorA, created.teacherId, {
      courseId: extCourseId,
      name: "Quiz 1",
      maxScore: 20,
      date: "2026-07-10",
    });
    assert(grade.dataSource === "manual", "the assessment is labelled manual");
    assert(
      grade.teacherId === created.teacherId,
      "and is owned by the TEACHER, not by the staff member who typed it",
    );
    const scored = await setManualGradeScores(recActorA, created.teacherId, grade.id, [
      { studentId: s1.studentId, score: 18 },
    ]);
    assert(scored.updated === 1, "scores are entered");
    const gradeNotif = await withPlatformContext((tx) =>
      tx.notification.findFirst({
        where: { userId: s1.studentId, type: "grade_entered" },
      }),
    );
    assert(
      !!gradeNotif,
      "the SAME grade_entered notification fires — a family cannot tell the teacher is off-system",
    );

    // ================= 6. ISOLATION =================
    console.log("\n-- 6. isolation --");

    await expectError(
      () => getExternalTeacher(ownerActorB.acting, created.teacherId),
      NotFoundError,
      "another center cannot READ this teacher (and learns nothing about existence)",
    );
    await expectError(
      () => updateExternalTeacher(ownerActorB, created.teacherId, { fullName: "hijack" }),
      NotFoundError,
      "another center cannot EDIT this teacher",
    );
    await expectError(
      () =>
        settleWithTeacher(ownerActorB, created.teacherId, {
          amount: 100,
          period: { from: new Date("2026-07-01"), to: new Date("2026-09-01") },
        }),
      NotFoundError,
      "another center cannot SETTLE with this teacher",
    );
    await expectError(
      () =>
        createManualStudent(ownerActorB, created.teacherId, {
          fullName: "hijack student",
          phone: "0199" + String(seed).slice(0, 7),
        }),
      NotFoundError,
      "another center cannot register students under this teacher",
    );

    // ================= 8. THE GAPS REPORT =================
    console.log("\n-- 8. the gaps report --");

    const gapReport = await buildGapReport(ownerActorA.acting, {
      teacherId: created.teacherId,
      from: new Date("2026-07-01T00:00:00Z"),
      to: new Date("2026-12-31T00:00:00Z"),
    });
    const kinds = new Set(gapReport.gaps.map((g) => g.kind));
    assert(
      kinds.has("lesson_without_attendance"),
      "it finds lessons nobody marked attendance for",
    );
    assert(
      kinds.has("session_not_completed"),
      "and lessons never completed — the silent reason a teacher is under-paid",
    );
    assert(kinds.has("enrolled_unpaid"), "and students enrolled without coverage");
    assert(
      gapReport.gaps.every((g) => !!g.targetId),
      "every finding names the exact row to open",
    );
    assert(gapReport.blocking > 0, "and separates blocking findings from warnings");

    // ================= 9. REPORTS =================
    console.log("\n-- 9. reports combine by default --");

    const revAll = await getRevenueReport(ownerActorA.acting, undefined, undefined);
    const revManual = await getRevenueReport(ownerActorA.acting, undefined, undefined, {
      dataSource: "manual",
    });
    const revExternal = await getRevenueReport(ownerActorA.acting, undefined, undefined, {
      systemStatus: "external",
    });
    const revEnrolled = await getRevenueReport(ownerActorA.acting, undefined, undefined, {
      systemStatus: "enrolled",
    });
    assert(revAll.total === 40000, "unfiltered revenue includes the off-system teacher's money");
    assert(revManual.total === 40000, "?dataSource=manual isolates the hand-entered money");
    assert(revExternal.total === 40000, "?systemStatus=external isolates the off-system teacher");
    assert(
      revEnrolled.total === 0,
      "?systemStatus=enrolled shows only on-platform teachers (0 here) — the two filters are independent",
    );

    const dash = await getAdminDashboard(ownerActorA.acting);
    assert(
      dash.totals.revenue === 40000,
      "the center home counts both kinds together by default",
    );
    assert(
      dash.external.teachers === 1 && dash.external.revenue === 40000,
      "and ALWAYS reports how much of that is off-system, without a filter being set",
    );

    const combined = await listCenterTeachers(ownerActorA.acting);
    assert(combined.length === 2, "the teachers list shows both kinds together");
    assert(
      combined.filter((t) => t.systemStatus === "external").length === 1,
      "one of them is off-system",
    );

    // ================= 3. THE CONVERSION =================
    console.log("\n-- 3. conversion external -> enrolled preserves everything --");

    const before = await platformDb((tx) => countTeacherRecords(tx, created.teacherId));
    assert(before.courses > 0 && before.sessions > 0, "there is real history to preserve");
    assert(
      before.payments > 0 && before.transactions > 0,
      "including money — the hardest thing to lose quietly",
    );

    const conversion = await convertToEnrolled(ownerActorA, created.teacherId, {
      email: `${tag}-hassan@x.io`,
      reason: "Teacher agreed to join the platform",
    });
    assert(conversion.toStatus === "enrolled", "the flip happened");

    const after = await platformDb((tx) => countTeacherRecords(tx, created.teacherId));
    assert(
      JSON.stringify(after) === JSON.stringify(before),
      `EVERY record survived the conversion (${JSON.stringify(after)})`,
    );
    assert(
      JSON.stringify(conversion.recordsPreserved) === JSON.stringify(before),
      "and the journal froze those same counts inside the transaction",
    );

    const journal = await withPlatformContext((tx) =>
      tx.teacherSystemStatusChange.findFirst({
        where: { teacherId: created.teacherId, toStatus: "enrolled" },
      }),
    );
    assert(!!journal, "an append-only journal row records the transition");
    assert(journal?.reason === "Teacher agreed to join the platform", "with the reason given");
    assert(journal?.actorId === fx.ownerA.id, "and who did it");

    let journalImmutable = false;
    try {
      await withPlatformContext((tx) =>
        tx.teacherSystemStatusChange.update({
          where: { id: journal!.id },
          data: { reason: "rewritten" },
        }),
      );
    } catch {
      journalImmutable = true;
    }
    assert(journalImmutable, "the journal cannot be edited afterwards (UPDATE denied)");

    const stillTheSameGroup = await withPlatformContext((tx) =>
      tx.course.findUnique({ where: { id: extCourseId }, select: { teacherId: true, dataSource: true } }),
    );
    assert(
      stillTheSameGroup?.teacherId === created.teacherId,
      "the group still points at the SAME user id — nothing was re-parented",
    );
    assert(
      stillTheSameGroup?.dataSource === "manual",
      "and the group stays labelled manual: provenance is history, not current status",
    );

    const invite = await withPlatformContext((tx) =>
      tx.inviteToken.findFirst({
        where: { userId: created.teacherId, purpose: "teacher_invite" },
      }),
    );
    assert(!!invite, "a claim invite was issued through the existing invite kernel");
    assert(invite?.usedAt === null, "unused");
    assert(!!conversion.invite?.link, "and the link is handed back for in-person delivery");

    const afterConvertUser = await withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { id: created.teacherId },
        select: { status: true, passwordHash: true, email: true },
      }),
    );
    assert(
      afterConvertUser?.status === "shell" && afterConvertUser.passwordHash === null,
      "the account stays shell until they claim — `enrolled` describes the arrangement, not the door",
    );

    // ================= 4. THE REVERSE =================
    console.log("\n-- 4. conversion enrolled -> external --");

    // Give them a password + active account, so the login-closing is observable.
    await withPlatformContext((tx) =>
      tx.user.update({
        where: { id: created.teacherId },
        data: { status: "active", passwordHash: "$2b$10$notarealhashnotarealhashnotarealhashnotare" },
      }),
    );
    const versionBefore = await withPlatformContext((tx) =>
      tx.user.findUnique({ where: { id: created.teacherId }, select: { tokenVersion: true } }),
    );

    const back = await convertToExternal(ownerActorA, created.teacherId, {
      reason: "Teacher stopped using the app",
    });
    assert(back.toStatus === "external", "the teacher is off-system again");

    const afterBack = await withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { id: created.teacherId },
        select: { status: true, tokenVersion: true },
      }),
    );
    assert(
      afterBack?.status === "suspended",
      "the login is closed through users.status — the platform's ONE account gate",
    );
    assert(
      (afterBack?.tokenVersion ?? 0) > (versionBefore?.tokenVersion ?? 0),
      "which bumped token_version, so live sessions are revoked (C-03, reused not reinvented)",
    );

    const backRecords = await platformDb((tx) => countTeacherRecords(tx, created.teacherId));
    assert(
      JSON.stringify(backRecords) === JSON.stringify(before),
      "and the reverse conversion lost nothing either",
    );

    // A teacher working with a second center cannot be taken off-system by one
    // of them — the others would silently lose their record-keeper.
    await withPlatformContext((tx) =>
      tx.centerTeacherAffiliation.create({
        data: {
          centerId: fx.centerB,
          teacherId: fx.enrolledTeacher.id,
          status: "active",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      }),
    );
    await expectError(
      () =>
        convertToExternal(ownerActorA, fx.enrolledTeacher.id, {
          reason: "trying it on",
        }),
      BusinessRuleError,
      "a teacher shared with another center cannot be taken off-system unilaterally",
    );

    // ================= 7. SOFT DELETE ONLY =================
    console.log("\n-- 7. soft delete only --");

    await expectError(
      () => removeExternalTeacher(ownerActorA, created.teacherId, "leaving"),
      BusinessRuleError,
      "removal is refused while the teacher still has active groups",
    );

    await withPlatformContext((tx) =>
      tx.course.update({ where: { id: extCourseId }, data: { status: "ended" } }),
    );
    const removal = await removeExternalTeacher(ownerActorA, created.teacherId, "left the center");
    assert(removal.removed === true, "once the groups are ended the teacher can be removed");
    assert(
      removal.recordsKept.payments === before.payments,
      "and every financial record is KEPT — the removal is soft",
    );

    const removedUser = await withPlatformContext((tx) =>
      tx.user.findFirst({ where: { id: created.teacherId }, select: { deletedAt: true } }),
    );
    assert(removedUser?.deletedAt !== null, "the row still exists, marked deleted");

    // The removal ALSO soft-deletes the user row, and softDeleteExtension
    // hides those from every user.findMany — so the list has to ask for them
    // explicitly. Without this the `includeRemoved` flag returns nothing and
    // Restore below is unreachable from the UI, which can only offer it on a
    // row it managed to list.
    const listedLive = await listCenterTeachers(ownerActorA.acting);
    const listedAll = await listCenterTeachers(ownerActorA.acting, { includeRemoved: true });
    assert(
      !listedLive.some((r) => r.teacherId === created.teacherId),
      "a removed teacher is gone from the default list",
    );
    assert(
      listedAll.some((r) => r.teacherId === created.teacherId && r.removed),
      "…but includeRemoved SHOWS them, flagged — the row Restore is offered on",
    );

    const restored = await restoreExternalTeacher(ownerActorA, created.teacherId);
    assert(restored.restored === true, "and restore brings them back");
    const restoredRecords = await platformDb((tx) => countTeacherRecords(tx, created.teacherId));
    assert(
      restoredRecords.payments === before.payments &&
        restoredRecords.transactions === before.transactions,
      "to exactly the same records",
    );

    // A student enrolled by an off-system teacher's counter also reaches the
    // second group via the shared path — one more check that enrolment is
    // idempotent rather than duplicating.
    const reEnrol = await enrollManualStudent(recActorA, created.teacherId, {
      studentId: s2.studentId,
      courseId: extCourseId,
    });
    assert(reEnrol.enrolled === true, "re-enrolling an already-enrolled student is idempotent");
    const s2Enrollments = await withPlatformContext((tx) =>
      tx.enrollment.count({
        where: { studentId: s2.studentId, courseId: extCourseId, status: "active" },
      }),
    );
    assert(s2Enrollments === 1, "and did not create a second active enrollment row");
  } finally {
    // ---- cleanup (owner pool: the append-only tables are REVOKEd for the app
    // role, so only the owner can clear them) --------------------------------
    const U = createdUserIds;
    const C = centers;
    const courseRows = await admin.query(
      `SELECT id FROM courses WHERE center_id = ANY($1::uuid[])`,
      [C],
    );
    const courseIds = courseRows.rows.map((r: { id: string }) => r.id);
    const sessionRows = courseIds.length
      ? await admin.query(`SELECT id FROM sessions WHERE course_id = ANY($1::uuid[])`, [courseIds])
      : { rows: [] as { id: string }[] };
    const sessionIds = sessionRows.rows.map((r: { id: string }) => r.id);

    const q = (sql: string, params: unknown[]) => admin.query(sql, params).catch(() => {});

    await q(`DELETE FROM external_teacher_settlements WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM teacher_system_status_changes WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM session_settlements WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM points_ledger WHERE student_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM transactions WHERE center_id = ANY($1::uuid[]) OR from_entity_id = ANY($2::uuid[]) OR to_entity_id = ANY($2::uuid[])`, [C, U]);
    await q(`DELETE FROM subscriptions WHERE center_id = ANY($1::uuid[]) OR student_id = ANY($2::uuid[])`, [C, U]);
    await q(`DELETE FROM payments WHERE center_id = ANY($1::uuid[]) OR student_id = ANY($2::uuid[])`, [C, U]);
    await q(`DELETE FROM grade_scores WHERE student_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM grades WHERE center_id = ANY($1::uuid[])`, [C]);
    if (sessionIds.length) {
      await q(`DELETE FROM attendance_records WHERE session_id = ANY($1::uuid[])`, [sessionIds]);
    }
    await q(`DELETE FROM attendance_records WHERE center_id = ANY($1::uuid[])`, [C]);
    if (courseIds.length) {
      await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courseIds]);
      await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courseIds]);
    }
    await q(`DELETE FROM enrollments WHERE student_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM courses WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM invite_tokens WHERE user_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [U, C]);
    await q(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[]) OR full_name LIKE $2`, [U, tag + "%"]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [C]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite external-teachers.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
