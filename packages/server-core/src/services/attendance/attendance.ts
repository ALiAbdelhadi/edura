import { platformDb, scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";
import { notify } from "../../services/notifications/notify";
import { withParentFallback } from "../../services/notifications/fanout";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "../../errors/classes";
import { lockSessionRow } from "./lesson-lock";
import { runEffects, type WithEffects } from "../../db/effects";

const EDIT_WINDOW_DAYS = 7;

function pastEditWindow(sessionDate: Date): boolean {
  const diffMs = Date.now() - sessionDate.getTime();
  return diffMs > EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

type LockShape = {
  date: Date;
  status: string;
  attendanceReopenedAt: Date | null;
  distributedAt: Date | null;
};

function isLocked(session: LockShape): boolean {
  if (session.status === "cancelled" || session.distributedAt) return true;
  if (session.attendanceReopenedAt) return false;
  if (session.status === "completed") return true;
  return pastEditWindow(session.date);
}

async function resolveLinkedStudent(tx: TenantTx, parentId: string): Promise<string | null> {
  const link = await tx.parentStudentLink.findFirst({
    where: { parentId, status: "approved" },
  });
  return link ? link.studentId : null;
}

type AttendanceEntry = { studentId: string; status: "present" | "absent" | "excused" };

export async function getSessionAttendance(
  sessionId: string,
  callerId: string,
  callerRole: string,
  callerCenterId?: string,
) {
  const actor = {
    id: callerId,
    role: callerRole,
    centerId: callerCenterId,
  } as unknown as SessionUser;

  return scopedDb(actor, async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (callerRole === "student") {
      const record = await tx.attendanceRecord.findFirst({
        where: { sessionId, studentId: callerId },
      });
      return { locked: isLocked(session), records: record ? [record] : [] };
    }

    if (callerRole === "parent") {
      const linkedStudentId = await resolveLinkedStudent(tx, callerId);
      if (!linkedStudentId) return { locked: isLocked(session), records: [] };
      const record = await tx.attendanceRecord.findFirst({
        where: { sessionId, studentId: linkedStudentId },
      });
      return { locked: isLocked(session), records: record ? [record] : [] };
    }

    const records = await tx.attendanceRecord.findMany({ where: { sessionId } });

    const enrolled = await tx.enrollment.findMany({
      where: { courseId: session.courseId, status: "active" },
      select: { studentId: true },
    });
    const allStudentIds = [
      ...new Set([...enrolled.map((e) => e.studentId), ...records.map((r) => r.studentId)]),
    ];
    const { coveredStudentIds } = await import(
      "../../services/subscriptions/coverage"
    );
    const covered = await coveredStudentIds(tx, session, allStudentIds);

    return {
      locked: isLocked(session),
      records: records.map((r) => ({ ...r, covered: covered.has(r.studentId) })),
      coverage: allStudentIds.map((id) => ({ studentId: id, covered: covered.has(id) })),
    };
  });
}

export async function bulkMarkAttendance(
  sessionId: string,
  entries: AttendanceEntry[],
  adminId: string,
  adminCenterId: string | null, // NULL for teacher-direct sessions (marked by the teacher, platform-scoped)
) {
  const actor = {
    id: adminId,
    role: adminCenterId ? "center_admin" : "teacher",
    centerId: adminCenterId ?? undefined,
  } as unknown as SessionUser;

  const { value, effects } = await scopedDb(actor, (tx) =>
    bulkMarkAttendanceTx(tx, sessionId, entries, adminId, adminCenterId),
  );
  await runEffects(effects);
  return value;
}

export async function bulkMarkAttendanceTx(
  tx: TenantTx,
  sessionId: string,
  entries: AttendanceEntry[],
  adminId: string,
  adminCenterId: string | null,
): Promise<WithEffects<{ updated: number; count: number }>> {
  const { absentEntries } = await (async () => {
    await lockSessionRow(tx, sessionId);
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (isLocked(session)) {
      throw new ForbiddenError(
        session.distributedAt
          ? "This lesson has settled — attendance is frozen once revenue is distributed"
          : session.status === "completed"
            ? "This lesson was closed — reopen it to correct attendance"
            : "Attendance edit window has passed (locked=true)",
      );
    }

    const enrollments = await tx.enrollment.findMany({
      where: {
        courseId: session.courseId,
        centerId: adminCenterId,
        status: "active",
      },
      select: { studentId: true },
    });
    const enrolledSet = new Set(enrollments.map((e) => e.studentId));

    const invalidIds = entries.filter((e) => !enrolledSet.has(e.studentId));
    if (invalidIds.length > 0) {
      throw new BusinessRuleError("Some students are not actively enrolled in this course", {
        invalidStudentIds: invalidIds.map((e) => e.studentId),
      });
    }

    const now = new Date();
    const finalStatus = new Map<string, AttendanceEntry["status"]>();
    for (const entry of entries) finalStatus.set(entry.studentId, entry.status);
    const studentIds = [...finalStatus.keys()];

    const upsertOne = (studentId: string, status: AttendanceEntry["status"]) =>
      tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: {
          sessionId,
          studentId,
          courseId: session.courseId,
          centerId: adminCenterId,
          status,
          markedBy: adminId,
          editedAt: now,
          dataSource: session.dataSource,
        },
        update: { status, markedBy: adminId, editedAt: now },
      });

    const existing = studentIds.length
      ? await tx.attendanceRecord.findMany({
          where: { sessionId, studentId: { in: studentIds } },
          select: { studentId: true },
        })
      : [];
    const existingSet = new Set(existing.map((r) => r.studentId));

    const toCreate = studentIds.filter((id) => !existingSet.has(id));
    if (toCreate.length > 0) {
      const created = await tx.attendanceRecord.createMany({
        data: toCreate.map((studentId) => ({
          sessionId,
          studentId,
          courseId: session.courseId,
          centerId: adminCenterId,
          status: finalStatus.get(studentId)!,
          markedBy: adminId,
          editedAt: now,
          dataSource: session.dataSource,
        })),
        skipDuplicates: true,
      });
      // A row inserted by a writer that does not take the session lock loses
      // the race silently under skipDuplicates; upsert settles those exactly.
      if (created.count !== toCreate.length) {
        for (const id of toCreate) await upsertOne(id, finalStatus.get(id)!);
      }
    }

    const byStatus = new Map<AttendanceEntry["status"], string[]>();
    for (const id of studentIds) {
      if (!existingSet.has(id)) continue;
      const status = finalStatus.get(id)!;
      byStatus.set(status, [...(byStatus.get(status) ?? []), id]);
    }
    for (const [status, ids] of byStatus) {
      const res = await tx.attendanceRecord.updateMany({
        where: { sessionId, studentId: { in: ids } },
        data: { status, markedBy: adminId, editedAt: now },
      });
      if (res.count !== ids.length) {
        for (const id of ids) await upsertOne(id, status);
      }
    }

    return { absentEntries: entries.filter((e) => e.status === "absent") };
  })();

  return {
    value: { updated: entries.length, count: entries.length },
    effects: absentEntries.map((entry) => async () => {
      await notify({
        recipients: await withParentFallback(entry.studentId),
        type: "absence_marked",
        title: "Absence recorded",
        body: "Your child was marked absent for a session.",
        data: { sessionId, studentId: entry.studentId },
      });
    }),
  };
}

export type ReopenActor =
  | {
      kind: "teacher";
      actingTeacherId: string;
      actorId: string;
      onBehalfOf: string | null;
    }
  | {
      kind: "center";
      centerId: string;
      actorId: string;
      onBehalfOf: string | null;
    };

export async function reopenAttendanceForSettlement(
  sessionId: string,
  actor: ReopenActor,
) {
  return platformDb(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (actor.kind === "teacher") {
      if (session.teacherId !== actor.actingTeacherId) throw new NotFoundError("Session not found");
    } else {
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      if (!course || course.centerId !== actor.centerId) throw new NotFoundError("Session not found");
    }

    if (session.status === "cancelled" || session.distributedAt) {
      throw new BusinessRuleError("This lesson has already been closed — settled attendance never reopens");
    }
    if (session.status !== "completed" && !pastEditWindow(session.date)) {
      throw new BusinessRuleError("The register is still open for this lesson — no reopen needed");
    }
    if (session.attendanceReopenedAt) {
      throw new BusinessRuleError("Already reopened — record the attendance and close the lesson");
    }

    const reopenedAt = new Date();
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { attendanceReopenedAt: reopenedAt, attendanceReopenedBy: actor.actorId },
      select: { id: true, attendanceReopenedAt: true, attendanceReopenedBy: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.actorId,
        action: "attendance.reopen",
        targetType: "session",
        targetId: sessionId,
        onBehalfOf: actor.onBehalfOf,
        afterState: {
          reason: "reopen-for-settlement (T-9)",
          by: actor.kind,
          sessionDate: session.date.toISOString(),
          reopenedAt: reopenedAt.toISOString(),
        },
      },
    });

    return { ...updated, locked: false };
  }, { actorId: actor.actorId });
}

export async function editAttendance(
  attendanceId: string,
  newStatus: "present" | "absent" | "excused",
  adminId: string,
  adminCenterId: string,
  opts?: {
    overrideSettledLock?: boolean;
  },
) {
  const actor = {
    id: adminId,
    role: "center_admin",
    centerId: adminCenterId,
  } as unknown as SessionUser;

  const { value, effects } = await scopedDb(actor, (tx) =>
    editAttendanceTx(tx, attendanceId, newStatus, adminId, adminCenterId, opts),
  );
  await runEffects(effects);
  return value;
}

export async function editAttendanceTx(
  tx: TenantTx,
  attendanceId: string,
  newStatus: "present" | "absent" | "excused",
  adminId: string,
  adminCenterId: string,
  opts?: { overrideSettledLock?: boolean },
) {
  const { record, prevStatus } = await (async () => {
    const existing = await tx.attendanceRecord.findUnique({ where: { id: attendanceId } });
    if (!existing) throw new NotFoundError("Attendance record not found");
    if (existing.centerId !== adminCenterId) throw new ForbiddenError();

    await lockSessionRow(tx, existing.sessionId);
    const session = await tx.session.findUnique({ where: { id: existing.sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (opts?.overrideSettledLock) {
      if (session.status === "cancelled") {
        throw new ForbiddenError("A cancelled lesson's attendance cannot be corrected");
      }
      if (pastEditWindow(session.date) && !session.attendanceReopenedAt) {
        throw new ForbiddenError("Attendance edit window has passed (locked=true)");
      }
    } else if (isLocked(session)) {
      throw new ForbiddenError(
        session.distributedAt
          ? "This lesson has settled — attendance is frozen once revenue is distributed"
          : session.status === "completed"
            ? "This lesson was closed — reopen it to correct attendance"
            : "Attendance edit window has passed (locked=true)",
      );
    }

    const prev = existing.status;
    const updated = await tx.attendanceRecord.update({
      where: { id: attendanceId },
      data: {
        status: newStatus,
        markedBy: adminId,
        editedAt: new Date(),
      },
    });
    return { record: updated, prevStatus: prev };
  })();

  const effects = [];
  if (prevStatus === "absent" && newStatus === "present") {
    effects.push(async () => {
      await notify({
        recipients: await withParentFallback(record.studentId),
        type: "attendance_corrected",
        title: "Attendance corrected",
        body: "Attendance was updated from absent to present.",
        data: { sessionId: record.sessionId, attendanceId, studentId: record.studentId },
      });
    });
  } else if (newStatus === "absent" && prevStatus !== "absent") {
    effects.push(async () => {
      await notify({
        recipients: await withParentFallback(record.studentId),
        type: "absence_marked",
        title: "Absence recorded",
        body: "Your child was marked absent for a session.",
        data: { sessionId: record.sessionId, attendanceId, studentId: record.studentId },
      });
    });
  }

  return { value: record, effects };
}
