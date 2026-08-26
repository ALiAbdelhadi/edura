import { platformDb, scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";
import { notify } from "../../services/notifications/notify";
import { withParentFallback } from "../../services/notifications/fanout";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "../../errors/classes";
import { lockSessionRow } from "./lesson-lock";

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

/**
 * THE ONE LOCK PREDICATE (T-9 decision, 2026-08-21, docs/decisions/
 * attendance-reopen-settlement.md). Before it, the 7-day freeze guarded ONLY
 * `editAttendance` while `bulkMarkAttendance` upserted straight past it — the
 * GET said `locked: true` while the PUT accepted writes, so the lock was
 * neither consistent nor load-bearing.
 *
 *   locked = settled or cancelled (always, no exception),
 *            or completed,
 *            or past the 7-day window,
 *            UNLESS the session was REOPENED and has not yet settled.
 *
 * A reopen grants editing only until settlement runs: `distributedAt` re-arms
 * the lock, because after settlement the attendance facts are what the money
 * was computed from and must not move again.
 *
 * Phase 0 (revenue-operations spec): `completed` locks IMMEDIATELY — "إنهاء
 * الحصة" closes the register at the button, not seven days later. The reopen
 * door now also covers a prematurely completed register (see
 * reopenAttendanceForSettlement), so the repair path is audited instead of
 * being a silent write inside the window.
 */
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

    // Step 4 coverage annotation: staff views see which students hold active
    // payment coverage (monthly window or per-session pass) for this session.
    // DELIBERATELY NON-BLOCKING: attendance can still be marked for uncovered
    // students — enforcement policy (who may pass the counter/door without
    // coverage) belongs to Step 6 attendance modes. Do not read the
    // annotate-only behavior as a bug.
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

  const { absentEntries } = await scopedDb(actor, async (tx) => {
    // Phase 0: serialize against a concurrent settlement BEFORE reading, so
    // the lock state this write acts on is the committed truth, not a stale
    // read from before the money moved.
    await lockSessionRow(tx, sessionId);
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    // T-9: the SAME lock the GET reports and editAttendance enforces. This
    // path used to upsert straight past it — the UI said frozen while the
    // bulk write was open, which made the lock decorative.
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
          // Provenance INHERITED FROM THE SESSION, which inherited it from the
          // group. So an attendance row for an off-system teacher's lesson is
          // labelled `manual` wherever it was entered from, and no caller has to
          // pass anything. `session` is already loaded — this costs no query.
          dataSource: session.dataSource,
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

/**
 * T-9 — the audited way through the stranded-lesson trap (approved decision
 * 2026-08-21, docs/decisions/attendance-reopen-settlement.md).
 *
 * The trap: a lesson older than the 7-day window with NO attendance recorded
 * could never settle — the group list said "not closed", the register said
 * "التعديل مغلق", and the settle card said "record attendance first". Closed
 * loop; the teacher's share of that lesson was stranded forever.
 *
 * The way through: the TEACHER (or their delegated assistant — the register is
 * a delegated surface), OR the CENTER that runs the lesson, reopens attendance
 * editing for a session that is past the window and has NEVER been settled.
 * The center door is not a convenience: an EXTERNAL teacher has no account,
 * and the center is the actor of record for those lessons. The reopen is a fact on the session
 * row (`attendanceReopenedAt/By`) plus an audit row, the lock predicate above
 * honours it, attendance gets recorded, and settlement proceeds normally —
 * `distributedAt` then re-arms the lock for good.
 *
 * Refusals, each with its reason:
 *   - still inside the window → nothing to reopen, edit directly;
 *   - already settled (or completed/cancelled) → the money was computed from
 *     these facts; they never move again. There is deliberately NO force path;
 *   - already reopened and still open → no second audit row for a no-op.
 */
export type ReopenActor =
  | {
      /** The teacher whose lesson it is (assistants act as their teacher). */
      kind: "teacher";
      actingTeacherId: string;
      actorId: string;
      onBehalfOf: string | null;
    }
  | {
      /**
       * The CENTER that runs the lesson. Required, not a convenience: for an
       * EXTERNAL (off-system) teacher there is no teacher account to act with
       * — `docs/decisions/external-teachers.md` builds the whole module on the
       * center entering lessons manually, and `buildGapReport` actively tells
       * a center to go fix "lesson without attendance" and "past lesson never
       * completed". Without this door the lock below would delete a designed
       * capability instead of guarding it.
       */
      kind: "center";
      centerId: string;
      actorId: string;
      onBehalfOf: string | null;
    };

export async function reopenAttendanceForSettlement(
  sessionId: string,
  actor: ReopenActor,
) {
  // platformDb + EXPLICIT ownership below, not scopedDb: the audit row and the
  // session update belong in ONE transaction, and an `audit_logs` insert made
  // inside a tenant context is refused by RLS (measured). Same shape as
  // cancelOwnPayoutRequest and updateTeacherDirectPricing — the reach is
  // enforced by the two checks that follow, which is why they are not
  // optional.
  return platformDb(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (actor.kind === "teacher") {
      if (session.teacherId !== actor.actingTeacherId) throw new NotFoundError("Session not found");
    } else {
      // The lesson must belong to a course of THIS center. RLS already hides
      // other tenants' rows; the explicit check is what makes a teacher-direct
      // course (NULL center_id, bypass-only) refuse rather than slip through.
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      if (!course || course.centerId !== actor.centerId) throw new NotFoundError("Session not found");
    }

    if (session.status === "cancelled" || session.distributedAt) {
      throw new BusinessRuleError("This lesson has already been closed — settled attendance never reopens");
    }
    // Phase 0: a COMPLETED-but-never-distributed lesson (ended with nobody
    // marked, or ended by mistake) is locked immediately now, so this audited
    // door is its sanctioned repair path too. An in-window lesson that was NOT
    // completed still refuses — its register is simply open.
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
    /**
     * §3.3 of docs/decisions/superadmin-center-oversight.md: the BACK OFFICE
     * may correct a record on a settled lesson — the record is the truth about
     * a student — with the divergence from the frozen `present_count` measured
     * and audited by the caller, and the money never recomputed. Phase 0's
     * immediate lock closed every ERP door; this flag is the one sanctioned
     * exception, passed ONLY by `adminEditAttendance`, and it restores that
     * capability exactly as it stood: the 7-day window and cancellation still
     * refuse.
     */
    overrideSettledLock?: boolean;
  },
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

    // Phase 0: same serialization as bulkMarkAttendance — see lesson-lock.ts.
    await lockSessionRow(tx, existing.sessionId);
    const session = await tx.session.findUnique({ where: { id: existing.sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (opts?.overrideSettledLock) {
      // The audited back-office door (see the flag's doc above): settlement and
      // completion do not block, the window and cancellation still do.
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
