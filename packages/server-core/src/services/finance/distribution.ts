import { platformDb, type TenantTx } from "../../db/scope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "../../errors/classes";
import { awardPoints } from "../points/points";
import { nextTxnRefs } from "./ref-numbers";
import type { SessionUser } from "../../auth/types";
import {
  PLATFORM_TEACHER_FEE,
  PLATFORM_CENTER_FEE,
  computeLessonSplit,
} from "./fees";

export { PLATFORM_TEACHER_FEE, PLATFORM_CENTER_FEE, computeLessonSplit };

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
): Promise<Distribution> {
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({ where: { id: session.courseId } });
  if (!course) throw new NotFoundError("Course not found");
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

  const affiliation = await tx.centerTeacherAffiliation.findFirst({
    where: { centerId, teacherId, status: "active" },
    select: { centerShare: true },
  });
  const centerShare = affiliation?.centerShare ?? 0;

  const { teacherNet, centerNet } = computeLessonSplit(perSessionPrice, centerShare);

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
        amount: PLATFORM_TEACHER_FEE,
        fromEntityId: teacherId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: "Platform fee (teacher side)",
      },
      {
        refNumber: centerFeeRef,
        type: "commission",
        amount: PLATFORM_CENTER_FEE,
        fromEntityId: centerId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: "Platform fee (center side)",
      },
    );
    await awardPoints(tx, studentId, "attendance", { reason: "Attended a lesson" });
  }

  await tx.transaction.createMany({ data: rows });

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
    platformEarned: present.length * (PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE),
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

      const distribution = await distributeSessionRevenue(tx, sessionId);
      return { session: updated, distribution };
    },
    { actorId: user.id },
  );
}
