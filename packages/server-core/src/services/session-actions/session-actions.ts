import { platformDb, type TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";
import { checkConflicts } from "../../services/sessions/conflict-detector";
import { notify } from "../../services/notifications/notify";
import {
  ForbiddenError,
  NotFoundError,
  BusinessRuleError,
  ConflictError,
} from "../../errors/classes";

async function resolveSessionAudience(
  tx: TenantTx,
  courseId: string,
  centerId: string,
): Promise<string[]> {
  const enrollments = await tx.enrollment.findMany({
    where: { courseId, centerId, status: "active" },
    select: { studentId: true },
  });
  const studentIds = enrollments.map((e) => e.studentId);

  const admins = await tx.centerAdminProfile.findMany({
    where: { centerId },
    select: { userId: true },
  });
  const adminIds = admins.map((a) => a.userId);

  return [...new Set([...studentIds, ...adminIds])];
}

export async function cancelSession(sessionId: string, teacherId: string, reason: string) {
  const { session, recipients } = await platformDb(
    async (tx) => {
      const existing = await tx.session.findUnique({ where: { id: sessionId } });
      if (!existing) throw new NotFoundError("Session not found");
      if (existing.teacherId !== teacherId) {
        throw new ForbiddenError("Only the assigned teacher can cancel this session");
      }
      if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
      if (existing.status === "completed" || existing.distributedAt) {
        throw new BusinessRuleError("A completed session cannot be cancelled; its revenue is already distributed");
      }

      const session = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: "cancelled",
          cancellationReason: reason,
          editedAt: new Date(),
        },
      });

      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      const centerId = course?.centerId ?? "";
      const recipients = centerId
        ? await resolveSessionAudience(tx, session.courseId, centerId)
        : [];

      return { session, recipients };
    },
    { actorId: teacherId },
  );

  if (recipients.length > 0) {
    await notify({
      recipients,
      type: "session_cancelled",
      title: "Session cancelled",
      body: `A session has been cancelled. Reason: ${reason}`,
      data: { sessionId, reason },
    });
  }

  return session;
}

export async function postponeSession(
  sessionId: string,
  teacherId: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  reason: string,
) {
  const { session, recipients, oldDate, oldStartTime, oldEndTime } = await platformDb(
    async (tx) => {
      const existing = await tx.session.findUnique({ where: { id: sessionId } });
      if (!existing) throw new NotFoundError("Session not found");
      if (existing.teacherId !== teacherId) {
        throw new ForbiddenError("Only the assigned teacher can postpone this session");
      }
      if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
      if (existing.status === "completed" || existing.distributedAt) {
        throw new BusinessRuleError(
          "A completed session cannot be postponed; its revenue is already distributed",
        );
      }

      const newDateObj = new Date(newDate);
      newDateObj.setUTCHours(0, 0, 0, 0);

      const conflicts = await checkConflicts(tx, {
        teacherId,
        roomId: existing.roomId ?? undefined,
        date: newDateObj,
        startTime: newStartTime,
        endTime: newEndTime,
        excludeSessionId: sessionId,
      });

      if (conflicts.length > 0) {
        throw new ConflictError("New time slot conflicts with existing sessions", { conflicts });
      }

      const oldDate = existing.date;
      const oldStartTime = existing.startTime;
      const oldEndTime = existing.endTime;

      const session = await tx.session.update({
        where: { id: sessionId },
        data: {
          postponedFromDate: oldDate,
          date: newDateObj,
          startTime: newStartTime,
          endTime: newEndTime,
          status: "postponed",
          cancellationReason: reason,
          editedAt: new Date(),
        },
      });

      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      const centerId = course?.centerId ?? "";
      const recipients = centerId
        ? await resolveSessionAudience(tx, session.courseId, centerId)
        : [];

      return { session, recipients, oldDate, oldStartTime, oldEndTime };
    },
    { actorId: teacherId },
  );

  if (recipients.length > 0) {
    await notify({
      recipients,
      type: "session_postponed",
      title: "Session postponed",
      body: `A session has been postponed to ${newDate} ${newStartTime}–${newEndTime}. Reason: ${reason}`,
      data: {
        sessionId,
        reason,
        oldDate: toDateKey(oldDate),
        oldStartTime,
        oldEndTime,
        newDate,
        newStartTime,
        newEndTime,
      },
    });
  }

  return session;
}
