import { platformDb } from "@/lib/db/scope";
import { notify } from "@/lib/services/notifications/notify";
import type { SessionUser } from "@/lib/auth/session";


export type OfflineRecord = {
  sessionId: string;
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
  localTimestamp?: Date;
};

type SyncOutcome = {
  sessionId: string;
  studentId: string;
  result: "synced" | "conflict" | "error";
  reason?: string;
};

export async function syncOfflineAttendance(records: OfflineRecord[], teacher: SessionUser) {
  const results: SyncOutcome[] = [];
  const absences: { studentId: string; sessionId: string }[] = [];

  await platformDb(
    async (tx) => {
      const sessionCache = new Map<string, { teacherId: string; courseId: string; centerId: string } | null>();

      for (const rec of records) {
        const key = { sessionId: rec.sessionId, studentId: rec.studentId };

        let meta = sessionCache.get(rec.sessionId);
        if (meta === undefined) {
          const session = await tx.session.findUnique({
            where: { id: rec.sessionId },
            select: { teacherId: true, courseId: true },
          });
          if (!session) {
            meta = null;
          } else {
            const course = await tx.course.findUnique({
              where: { id: session.courseId },
              select: { centerId: true },
            });
            meta = { teacherId: session.teacherId, courseId: session.courseId, centerId: course?.centerId ?? "" };
          }
          sessionCache.set(rec.sessionId, meta);
        }

        if (!meta) {
          results.push({ ...key, result: "error", reason: "session_not_found" });
          continue;
        }
        if (meta.teacherId !== teacher.id) {
          results.push({ ...key, result: "error", reason: "not_your_session" });
          continue;
        }

        const enrolled = await tx.enrollment.findFirst({
          where: { courseId: meta.courseId, studentId: rec.studentId, status: "active" },
          select: { id: true },
        });
        if (!enrolled) {
          results.push({ ...key, result: "error", reason: "student_not_enrolled" });
          continue;
        }

        const existing = await tx.attendanceRecord.findUnique({
          where: { sessionId_studentId: { sessionId: rec.sessionId, studentId: rec.studentId } },
          select: { id: true },
        });
        if (existing) {
          results.push({ ...key, result: "conflict", reason: "server_record_kept" });
          continue;
        }

        await tx.attendanceRecord.create({
          data: {
            sessionId: rec.sessionId,
            studentId: rec.studentId,
            courseId: meta.courseId,
            centerId: meta.centerId,
            status: rec.status,
            markedBy: teacher.id,
            synced: true,
            localTimestamp: rec.localTimestamp ?? null,
          },
        });
        results.push({ ...key, result: "synced" });
        if (rec.status === "absent" || rec.status === "late") {
          absences.push({ studentId: rec.studentId, sessionId: rec.sessionId });
        }
      }
    },
    { actorId: teacher.id },
  );

  if (absences.length > 0) {
    const studentIds = [...new Set(absences.map((a) => a.studentId))];
    const links = await platformDb((tx) =>
      tx.parentStudentLink.findMany({
        where: { studentId: { in: studentIds }, status: "approved" },
        select: { studentId: true, parentId: true },
      }),
    );
    const parentsByStudent = new Map<string, string[]>();
    for (const l of links) {
      parentsByStudent.set(l.studentId, [...(parentsByStudent.get(l.studentId) ?? []), l.parentId]);
    }
    for (const a of absences) {
      const recipients = [a.studentId, ...(parentsByStudent.get(a.studentId) ?? [])];
      await notify({
        recipients,
        type: "absence_marked",
        title: "Absence recorded",
        body: "An absence was recorded for a lesson.",
        data: { sessionId: a.sessionId, source: "offline_sync" },
      });
    }
  }

  const synced = results.filter((r) => r.result === "synced").length;
  const conflicts = results.filter((r) => r.result === "conflict").length;
  const errors = results.filter((r) => r.result === "error").length;
  return { synced, conflicts, errors, total: records.length, results };
}
