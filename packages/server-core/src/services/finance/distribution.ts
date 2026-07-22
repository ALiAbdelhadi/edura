import { platformDb, type TenantTx } from "../../db/scope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "../../errors/classes";
import { awardPoints } from "../points/points";
import { nextTxnRefs } from "./ref-numbers";
import type { SessionUser } from "../../auth/types";
import { computeLessonSplit } from "./fees";
import { resolveCommission } from "./commission";

export { computeLessonSplit };

type Distribution = {
  distributed: boolean;
  reason?: string;
  presentCount?: number;
  perSessionPrice?: number;
  centerShare?: number;
  teacherNetTotal?: number;
  centerNetTotal?: number;
  platformEarned?: number;
};

export async function distributeSessionRevenue(
  tx: TenantTx,
  sessionId: string,
  settledBy?: string,
): Promise<Distribution> {
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({ where: { id: session.courseId } });
  if (!course) throw new NotFoundError("Course not found");

  // Teacher-direct courses (NULL centerId): revenue is settled at SUBSCRIPTION
  // PAYMENT time (price − platform commission straight to the teacher wallet,
  // see subscriptions settlement). Skipping here is the double-pay guard —
  // session completion must never pay the teacher a second time.
  if (!course.centerId) {
    return { distributed: false, reason: "teacher_direct_settled_at_payment" };
  }
  const centerId = course.centerId;
  const teacherId = course.teacherId;

  const present = await tx.attendanceRecord.findMany({
    where: { sessionId, status: "present" },
    select: { studentId: true },
  });
  if (present.length === 0) return { distributed: false, reason: "no_present_students" };

  const claim = await tx.session.updateMany({
    where: { id: sessionId, distributedAt: null },
    data: { distributedAt: new Date() },
  });
  if (claim.count === 0) return { distributed: false, reason: "already_distributed" };

  const plannedSessions = await tx.session.count({ where: { courseId: course.id } });
  const perSessionPrice =
    plannedSessions > 0 ? Math.round(course.price / plannedSessions) : course.price;

  // ONE rule per course (never both):
  //  • ROOM-BASED Method 2 (per_attending_student) → the center's share per
  //    PRESENT student is the rate frozen on the course (flat piasters, or bp
  //    of perSessionPrice); the platform keeps its % (splitPlatformBp); the
  //    teacher gets the exact remainder. Same computeLessonSplit expression as
  //    %-mode below.
  //  • ROOM-BASED Method 1 (whole_room_percent) → settle from the 3-way split
  //    SNAPSHOT frozen on the course at creation (superadmin-controlled; never
  //    re-rated). Expressed THROUGH the existing computeLessonSplit by
  //    deriving its inputs: platform fee = platformCut, center fee = 0,
  //    centerShare = centerCut; the teacher gets the remainder
  //    (price − platformCut − centerCut), which is exact — no rounding leak,
  //    shares always conserve to the price.
  //  • NO-ROOM course → legacy Step 4.5 flat fees (commission_settings) +
  //    the flat affiliation.centerShare.
  // All branches then run the IDENTICAL ledger writes, wallet updates, and
  // distributedAt exactly-once claim — no parallel money engine.
  let centerShare: number;
  let fees: { platformTeacherFee: number; platformCenterFee: number };
  if (course.pricingMethod === "per_attending_student") {
    const platformCut = Math.round((perSessionPrice * (course.splitPlatformBp ?? 0)) / 10_000);
    centerShare =
      course.m2CenterFee ?? Math.round((perSessionPrice * (course.m2CenterBp ?? 0)) / 10_000);
    fees = { platformTeacherFee: platformCut, platformCenterFee: 0 };
    // A flat per-student fee can exceed a cheap/unpriced course's lesson price;
    // the teacher's remainder must never go negative (H2 wallet floor). Throw
    // BEFORE anything persists — the whole tx (incl. the status update and the
    // distributedAt claim above) rolls back, the session stays completable.
    if (perSessionPrice - platformCut - centerShare < 0) {
      throw new BusinessRuleError(
        "The hall's per-student fee exceeds this lesson's price — set the course pricing before completing sessions",
      );
    }
  } else if (course.splitPlatformBp != null && course.splitCenterBp != null) {
    const platformCut = Math.round((perSessionPrice * course.splitPlatformBp) / 10_000);
    centerShare = Math.round((perSessionPrice * course.splitCenterBp) / 10_000);
    fees = { platformTeacherFee: platformCut, platformCenterFee: 0 };
  } else {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId, status: "active" },
      select: { centerShare: true },
    });
    centerShare = affiliation?.centerShare ?? 0;
    // Step 4.5: platform fees come from commission_settings (resolved inside
    // the same DB transaction so the split and its ledger rows always agree).
    fees = await resolveCommission(tx, { teacherId, centerId });
  }
  const { teacherNet, centerNet } = computeLessonSplit(perSessionPrice, centerShare, fees);

  // Method 2 stamps the frozen rate into the commission notes (auditability);
  // Method 1 / legacy notes stay byte-identical.
  const noteSuffix =
    course.pricingMethod === "per_attending_student"
      ? course.m2CenterFee != null
        ? ` — per-student method, ${(course.m2CenterFee / 100).toFixed(2)} EGP/student`
        : ` — per-student method, ${(course.m2CenterBp ?? 0) / 100}%/student`
      : "";

  const refs = await nextTxnRefs(tx, present.length * 3);

  const rows: Parameters<TenantTx["transaction"]["createMany"]>[0]["data"] = [];
  for (let i = 0; i < present.length; i++) {
    const { studentId } = present[i];
    const [paymentRef, teacherFeeRef, centerFeeRef] = refs.slice(i * 3, i * 3 + 3);
    rows.push(
      {
        refNumber: paymentRef,
        type: "payment",
        amount: perSessionPrice,
        fromEntityId: studentId,
        toEntityId: centerId,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: "Lesson revenue",
      },
      {
        refNumber: teacherFeeRef,
        type: "commission",
        amount: fees.platformTeacherFee,
        fromEntityId: teacherId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: `Platform fee (teacher side)${noteSuffix}`,
      },
      {
        refNumber: centerFeeRef,
        type: "commission",
        amount: fees.platformCenterFee,
        fromEntityId: centerId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: `Platform fee (center side)${noteSuffix}`,
      },
    );
    await awardPoints(tx, studentId, "attendance", { reason: "Attended a lesson" });
  }

  await tx.transaction.createMany({ data: rows });

  // Per-session settlement record — room-based courses only (both methods).
  // Same tx as the ledger; UNIQUE(session_id) doubles as an exactly-once
  // witness beside the distributedAt claim. present_count freezes the settled
  // attendee set so post-settlement attendance edits are detectable.
  if (course.pricingMethod != null) {
    await tx.sessionSettlement.create({
      data: {
        sessionId,
        courseId: course.id,
        centerId,
        teacherId,
        roomId: session.roomId ?? course.defaultRoomId,
        pricingMethod: course.pricingMethod,
        presentCount: present.length,
        perSessionPrice,
        platformTotal: (fees.platformTeacherFee + fees.platformCenterFee) * present.length,
        centerTotal: centerNet * present.length,
        teacherTotal: teacherNet * present.length,
        m2CenterFee: course.m2CenterFee,
        m2CenterBp: course.m2CenterBp,
        settledBy: settledBy ?? teacherId,
      },
    });
  }

  const teacherNetTotal = teacherNet * present.length;
  const centerNetTotal = centerNet * present.length;
  if (teacherNetTotal !== 0) {
    await tx.teacherProfile.updateMany({
      where: { userId: teacherId },
      data: { walletBalance: { increment: teacherNetTotal } },
    });
  }
  if (centerNetTotal !== 0) {
    await tx.center.update({
      where: { id: centerId },
      data: { walletBalance: { increment: centerNetTotal } },
    });
  }

  return {
    distributed: true,
    presentCount: present.length,
    perSessionPrice,
    centerShare,
    teacherNetTotal,
    centerNetTotal,
    platformEarned: present.length * (fees.platformTeacherFee + fees.platformCenterFee),
  };
}

export async function completeSession(sessionId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError("Session not found");

      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true, teacherId: true },
      });
      if (!course) throw new NotFoundError("Course not found");

      if (user.role === "teacher") {
        if (session.teacherId !== user.id) {
          throw new ForbiddenError("Only the session's teacher can complete it");
        }
      } else if (user.role === "center_admin") {
        if (course.centerId !== user.centerId) {
          throw new ForbiddenError("Session belongs to a different center");
        }
      } else {
        throw new ForbiddenError();
      }

      if (session.status === "cancelled") {
        throw new BusinessRuleError("A cancelled session cannot be completed");
      }

      const wasCompleted = session.status === "completed";
      const updated = wasCompleted
        ? session
        : await tx.session.update({
            where: { id: sessionId },
            data: { status: "completed", editedAt: new Date() },
          });

      const distribution = await distributeSessionRevenue(tx, sessionId, user.id);
      return { session: updated, distribution };
    },
    { actorId: user.id },
  );
}
