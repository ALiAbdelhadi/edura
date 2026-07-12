import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { TenantTx } from "@/lib/db/scope";
import { notify } from "@/lib/services/notifications/notify";
import { withParentFallback } from "@/lib/services/notifications/fanout";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "@/lib/errors/classes";

const EDIT_WINDOW_DAYS = 7;

function isLocked(sessionDate: Date): boolean {
  const diffMs = Date.now() - sessionDate.getTime();
  return diffMs > EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
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
      return { locked: isLocked(session.date), records: record ? [record] : [] };
    }

    if (callerRole === "parent") {
      const linkedStudentId = await resolveLinkedStudent(tx, callerId);
      if (!linkedStudentId) return { locked: isLocked(session.date), records: [] };
      const record = await tx.attendanceRecord.findFirst({
        where: { sessionId, studentId: linkedStudentId },
      });
      return { locked: isLocked(session.date), records: record ? [record] : [] };
    }

    // teacher or center_admin — full roster
    const records = await tx.attendanceRecord.findMany({ where: { sessionId } });
    return { locked: isLocked(session.date), records };
  });
}

export async function bulkMarkAttendance(
  sessionId: string,
  entries: AttendanceEntry[],
  adminId: string,
  adminCenterId: string,
) {
  const actor = {
    id: adminId,
    role: "center_admin",
    centerId: adminCenterId,
  } as unknown as SessionUser;

  const { absentEntries } = await scopedDb(actor, async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    // Validate all submitted studentIds are actively enrolled
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
    for (const entry of entries) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: entry.studentId } },
        create: {
          sessionId,
          studentId: entry.studentId,
          courseId: session.courseId,
          centerId: adminCenterId,
          status: entry.status,
          markedBy: adminId,
          editedAt: now,
        },
        update: {
          status: entry.status,
          markedBy: adminId,
          editedAt: now,
        },
      });
    }

    return { absentEntries: entries.filter((e) => e.status === "absent") };
  });

  // Emit absence notifications (side effects AFTER the tx closes). PRD §6:
  // student absence goes to the Parent (falling back to the student).
  for (const entry of absentEntries) {
    await notify({
      recipients: await withParentFallback(entry.studentId),
      type: "absence_marked",
      title: "Absence recorded",
      body: "Your child was marked absent for a session.",
      data: { sessionId, studentId: entry.studentId },
    });
  }

  return { updated: entries.length, count: entries.length };
}

export async function editAttendance(
  attendanceId: string,
  newStatus: "present" | "absent" | "excused",
  adminId: string,
  adminCenterId: string,
) {
  const actor = {
    id: adminId,
    role: "center_admin",
    centerId: adminCenterId,
  } as unknown as SessionUser;

  const { record, prevStatus } = await scopedDb(actor, async (tx) => {
    const existing = await tx.attendanceRecord.findUnique({ where: { id: attendanceId } });
    if (!existing) throw new NotFoundError("Attendance record not found");
    if (existing.centerId !== adminCenterId) throw new ForbiddenError();

    const session = await tx.session.findUnique({ where: { id: existing.sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (isLocked(session.date)) {
      throw new ForbiddenError("Attendance edit window has passed (locked=true)");
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
  });

  if (prevStatus === "absent" && newStatus === "present") {
    await notify({
      recipients: await withParentFallback(record.studentId),
      type: "attendance_corrected",
      title: "Attendance corrected",
      body: "Attendance was updated from absent to present.",
      data: { sessionId: record.sessionId, attendanceId, studentId: record.studentId },
    });
  } else if (newStatus === "absent" && prevStatus !== "absent") {
    await notify({
      recipients: await withParentFallback(record.studentId),
      type: "absence_marked",
      title: "Absence recorded",
      body: "Your child was marked absent for a session.",
      data: { sessionId: record.sessionId, attendanceId, studentId: record.studentId },
    });
  }

  return record;
}
