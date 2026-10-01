import { platformDb } from "../../db/scope";
import type { Prisma } from "@repo/database";
import { notifyAfterCommit } from "../notifications/notify";
import type { SessionUser } from "../../auth/types";
import { doorTransitionTx, resolveAssistantTeacher } from "./checkin";
import { lessonClosed, lockSessionRow } from "./lesson-lock";

export type OfflineRecord = {
  sessionId: string;
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
  localTimestamp?: Date;
  stage?: "door";
};

type SyncOutcome = {
  sessionId: string;
  studentId: string;
  result: "synced" | "conflict" | "error";
  reason?: string;
};

export async function syncOfflineAttendance(records: OfflineRecord[], caller: SessionUser) {
  const results: SyncOutcome[] = [];
  const absences: { studentId: string; sessionId: string }[] = [];

  await platformDb(
    async (tx) => {
      const teacherId = await resolveAssistantTeacher(tx, caller);
      type SessionMeta = {
        teacherId: string;
        courseId: string;
        centerId: string;
        cancelled: boolean;
        closed: boolean;
      };
      const sessionIds = [...new Set(records.map((r) => r.sessionId))].sort();
      const studentIds = [...new Set(records.map((r) => r.studentId))];
      const sessionCache = new Map<string, SessionMeta | null>();
      const enrolledKeys = new Set<string>();
      const existingKeys = new Set<string>();
      const pendingCreates: Prisma.AttendanceRecordCreateManyInput[] = [];

      if (records.length > 0) {
        for (const id of sessionIds) await lockSessionRow(tx, id);
        const sessions = await tx.session.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, teacherId: true, courseId: true, status: true, distributedAt: true },
        });
        const courseIds = [...new Set(sessions.map((s) => s.courseId))];
        const courses = courseIds.length
          ? await tx.course.findMany({
              where: { id: { in: courseIds } },
              select: { id: true, centerId: true },
            })
          : [];
        const centerByCourse = new Map(courses.map((c) => [c.id, c.centerId]));
        const sessionById = new Map(sessions.map((s) => [s.id, s]));
        for (const id of sessionIds) {
          const session = sessionById.get(id);
          sessionCache.set(
            id,
            session
              ? {
                  teacherId: session.teacherId,
                  courseId: session.courseId,
                  centerId: centerByCourse.get(session.courseId) ?? "",
                  cancelled: session.status === "cancelled",
                  closed: lessonClosed(session),
                }
              : null,
          );
        }

        if (courseIds.length > 0) {
          const enrollments = await tx.enrollment.findMany({
            where: { courseId: { in: courseIds }, studentId: { in: studentIds }, status: "active" },
            select: { courseId: true, studentId: true },
          });
          for (const e of enrollments) enrolledKeys.add(`${e.courseId}:${e.studentId}`);

          const existing = await tx.attendanceRecord.findMany({
            where: { sessionId: { in: sessions.map((s) => s.id) }, studentId: { in: studentIds } },
            select: { sessionId: true, studentId: true },
          });
          for (const r of existing) existingKeys.add(`${r.sessionId}:${r.studentId}`);
        }
      }

      for (const rec of records) {
        const key = { sessionId: rec.sessionId, studentId: rec.studentId };
        const meta = sessionCache.get(rec.sessionId);

        if (!meta) {
          results.push({ ...key, result: "error", reason: "session_not_found" });
          continue;
        }
        if (meta.teacherId !== teacherId) {
          results.push({ ...key, result: "error", reason: "not_your_session" });
          continue;
        }
        if (meta.closed) {
          results.push({
            ...key,
            result: "conflict",
            reason: meta.cancelled ? "session_cancelled" : "session_settled",
          });
          continue;
        }

        if (rec.stage === "door") {
          const res = await doorTransitionTx(tx, {
            studentId: rec.studentId,
            sessionId: rec.sessionId,
            actorId: caller.id,
            teacherId,
            at: rec.localTimestamp ?? undefined,
          });
          if (res.outcome === "present" || res.outcome === "already_present") {
            results.push({ ...key, result: "synced", reason: res.outcome });
          } else if (res.outcome === "settled") {
            results.push({ ...key, result: "conflict", reason: "session_settled" });
          } else if (res.outcome === "no_counter") {
            results.push({ ...key, result: "error", reason: "no_counter_checkin" });
          } else {
            results.push({ ...key, result: "error", reason: res.reason });
          }
          continue;
        }

        if (!enrolledKeys.has(`${meta.courseId}:${rec.studentId}`)) {
          results.push({ ...key, result: "error", reason: "student_not_enrolled" });
          continue;
        }

        const recordKey = `${rec.sessionId}:${rec.studentId}`;
        if (existingKeys.has(recordKey)) {
          results.push({ ...key, result: "conflict", reason: "server_record_kept" });
          continue;
        }

        existingKeys.add(recordKey);
        pendingCreates.push({
          sessionId: rec.sessionId,
          studentId: rec.studentId,
          courseId: meta.courseId,
          centerId: meta.centerId,
          status: rec.status,
          markedBy: caller.id,
          synced: true,
          localTimestamp: rec.localTimestamp ?? null,
        });
        results.push({ ...key, result: "synced" });
        if (rec.status === "absent" || rec.status === "late") {
          absences.push({ studentId: rec.studentId, sessionId: rec.sessionId });
        }
      }

      if (pendingCreates.length > 0) {
        await tx.attendanceRecord.createMany({ data: pendingCreates });
      }
    },
    { actorId: caller.id },
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
    const recipientsBySession = new Map<string, string[]>();
    for (const a of absences) {
      recipientsBySession.set(a.sessionId, [
        ...(recipientsBySession.get(a.sessionId) ?? []),
        a.studentId,
        ...(parentsByStudent.get(a.studentId) ?? []),
      ]);
    }
    for (const [sessionId, recipients] of recipientsBySession) {
      await notifyAfterCommit({
        recipients,
        type: "absence_marked",
        title: "Absence recorded",
        body: "An absence was recorded for a lesson.",
        data: { sessionId, source: "offline_sync" },
      });
    }
  }

  const synced = results.filter((r) => r.result === "synced").length;
  const conflicts = results.filter((r) => r.result === "conflict").length;
  const errors = results.filter((r) => r.result === "error").length;
  return { synced, conflicts, errors, total: records.length, results };
}
