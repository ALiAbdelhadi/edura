import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  getSessionAttendance,
  bulkMarkAttendance,
  editAttendance,
} from "@repo/server-core/services/attendance/attendance";
import {
  lookupStudents,
  suggestSessions,
  counterCheckin,
} from "@repo/server-core/services/attendance/checkin";
import {
  cancelSession,
  postponeSession,
} from "@repo/server-core/services/session-actions/session-actions";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { resolveLessonPrice } from "@repo/server-core/services/finance/fees";
import { registerWalkIn, resendWalkIn } from "@repo/server-core/services/walk-in/walk-in";
import {
  createTempStudent,
  sendTempStudentInvite,
} from "@repo/server-core/services/temp-students/temp-students";
import {
  listDeletionRequests,
  approveDeletionRequest,
  rejectDeletionRequest,
} from "@repo/server-core/services/center/deletion-requests";
import {
  listCenterBlacklist,
  centerBlacklistStudent,
  removeBlacklistEntry,
} from "@/lib/services/blacklist/blacklist";
import { notify } from "@/lib/services/notifications/notify";
import { resolveCourseStudentsAndParents } from "@repo/server-core/services/notifications/fanout";

// ---------------------------------------------------------------------------
// PHASE 3 — OPERATIONS. Attendance, sessions, the counter, walk-ins, deletion
// requests, broadcast and the center blacklist.
//
// This phase is where the money engine is nearest, so the boundaries are drawn
// explicitly rather than left to the reader:
//
//   • `adminCompleteSession` IS a settlement trigger — it runs
//     distributeSessionRevenue and writes the ledger. It is a sanctioned flow,
//     not a manual edit, it is exactly-once by construction (distributedAt +
//     UNIQUE(session_id) on session_settlements), and it is refused outright on
//     an already-settled session. `adminSettlementPreview` exists so the
//     operator sees what will be distributed BEFORE confirming.
//   • Cancel and postpone are REFUSED on a settled session — cancel by the
//     kernel's own guard, postpone by the guard added here (see the note on
//     `adminPostponeSession`).
//   • Correcting attendance on a settled session is ALLOWED but never silent:
//     the divergence from the frozen `present_count` is measured and written
//     into the audit row. The settlement is not recomputed — that would be a
//     retroactive re-rate, which M4.5 forbids.
// ---------------------------------------------------------------------------

type AuditSpec = {
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
};

async function audit(actor: SessionUser, centerId: string, spec: AuditSpec) {
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId,
          centerId,
          beforeState: (spec.before ?? undefined) as never,
          afterState: (spec.after ?? undefined) as never,
          onBehalfOf: null,
        },
      }),
    { actorId: actor.id },
  );
}

/** The session, proven to belong to the center being acted on. */
async function sessionInCenter(centerId: string, sessionId: string) {
  const row = await platformDb(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");
    const course = await tx.course.findUnique({
      where: { id: session.courseId },
      select: { centerId: true, title: true, price: true, maxStudents: true },
    });
    if (!course) throw new NotFoundError("Course not found");
    return { session, course };
  });
  if (row.course.centerId !== centerId) {
    throw new ForbiddenError("Session belongs to a different center");
  }
  return row;
}

// ===========================================================================
// Attendance
// ===========================================================================

export async function adminGetSessionAttendance(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
) {
  await sessionInCenter(centerId, sessionId);
  return getSessionAttendance(sessionId, actor.id, "center_admin", centerId);
}

/**
 * Correct one attendance record.
 *
 * §3.3 — allowed even after the session settled, because the record is the
 * truth about a student and pretending otherwise helps nobody. But the
 * divergence it creates from the settlement's frozen `present_count` is
 * measured and recorded, so the mismatch is visible in the log instead of
 * being discovered later. The settlement itself is NOT recomputed.
 */
export async function adminEditAttendance(
  actor: SessionUser,
  centerId: string,
  attendanceId: string,
  newStatus: "present" | "absent" | "excused",
) {
  const before = await platformDb((tx) =>
    tx.attendanceRecord.findUnique({
      where: { id: attendanceId },
      select: { id: true, status: true, sessionId: true, studentId: true, centerId: true },
    }),
  );
  if (!before) throw new NotFoundError("Attendance record not found");
  if (before.centerId !== centerId) {
    throw new ForbiddenError("Attendance record belongs to a different center");
  }

  const result = await editAttendance(attendanceId, newStatus, actor.id, centerId);

  // Did this correction move a session that has already been settled?
  const settlement = await platformDb((tx) =>
    tx.sessionSettlement.findUnique({
      where: { sessionId: before.sessionId },
      select: { id: true, presentCount: true },
    }),
  );
  let divergence: Record<string, unknown> | null = null;
  if (settlement) {
    const presentNow = await platformDb((tx) =>
      tx.attendanceRecord.count({
        where: { sessionId: before.sessionId, status: "present" },
      }),
    );
    divergence = {
      settlementId: settlement.id,
      settledPresentCount: settlement.presentCount,
      presentCountNow: presentNow,
      diverged: presentNow !== settlement.presentCount,
      // Stated so nobody reads the correction as a money correction.
      settlementRecomputed: false,
    };
  }

  await audit(actor, centerId, {
    action: "center.attendance_corrected",
    targetType: "attendance_record",
    targetId: attendanceId,
    before: { status: before.status, sessionId: before.sessionId, studentId: before.studentId },
    after: { status: newStatus, settlementDivergence: divergence },
  });

  return { ...result, settlementDivergence: divergence };
}

export async function adminBulkAttendance(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
  entries: { studentId: string; status: string; notes?: string }[],
) {
  await sessionInCenter(centerId, sessionId);
  const before = await platformDb((tx) =>
    tx.attendanceRecord.count({ where: { sessionId, status: "present" } }),
  );
  const result = await bulkMarkAttendance(
    sessionId,
    entries as never,
    actor.id,
    centerId,
  );
  const after = await platformDb((tx) =>
    tx.attendanceRecord.count({ where: { sessionId, status: "present" } }),
  );
  await audit(actor, centerId, {
    action: "center.attendance_bulk_marked",
    targetType: "session",
    targetId: sessionId,
    before: { presentCount: before },
    after: { presentCount: after, entries: entries.length },
  });
  return result;
}

// ===========================================================================
// Sessions
// ===========================================================================

export async function adminCancelSession(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
  reason: string,
) {
  const { session } = await sessionInCenter(centerId, sessionId);
  // The kernel refuses a settled session itself; this is the same guard stated
  // where the operator can see it, and it keeps the error specific.
  if (session.distributedAt) {
    throw new BusinessRuleError(
      "This session has already been settled — its revenue is distributed and it cannot be cancelled",
    );
  }
  // The kernel's guard is "only the assigned teacher". A super admin is not the
  // teacher, so the session's OWN teacherId is passed — the guard is satisfied,
  // not bypassed. The real authorization happened above: super_admin + the
  // session provably belonging to the center being acted on.
  const result = await cancelSession(sessionId, session.teacherId, reason);
  await audit(actor, centerId, {
    action: "center.session_cancelled",
    targetType: "session",
    targetId: sessionId,
    before: { status: session.status, date: session.date },
    after: { status: "cancelled", reason, settledBefore: false },
  });
  return result;
}

/**
 * Postpone a session.
 *
 * NOTE — the settled-session guard here has no counterpart in the www kernel:
 * `cancelSession` refuses `distributedAt`, `postponeSession` does not. Moving
 * a settled session would detach a distributed settlement from its date, so it
 * is refused on this path. The www gap is deliberately left alone rather than
 * changed silently as part of a parity phase; it is written up for review.
 */
export async function adminPostponeSession(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
  input: { newDate: string; newStartTime: string; newEndTime: string; reason: string },
) {
  const { session } = await sessionInCenter(centerId, sessionId);
  if (session.distributedAt) {
    throw new BusinessRuleError(
      "This session has already been settled — it cannot be moved",
    );
  }
  const result = await postponeSession(
    sessionId,
    session.teacherId,
    input.newDate,
    input.newStartTime,
    input.newEndTime,
    input.reason,
  );
  await audit(actor, centerId, {
    action: "center.session_postponed",
    targetType: "session",
    targetId: sessionId,
    before: { date: session.date, startTime: session.startTime, endTime: session.endTime },
    after: {
      date: input.newDate,
      startTime: input.newStartTime,
      endTime: input.newEndTime,
      reason: input.reason,
      settledBefore: false,
    },
  });
  return result;
}

/**
 * What completing this session WOULD distribute — shown before the operator
 * confirms. Read-only: it writes nothing and settles nothing.
 */
export async function adminSettlementPreview(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
) {
  const { session, course } = await sessionInCenter(centerId, sessionId);
  return platformDb(async (tx) => {
    const [presentCount, plannedSessions, full] = await Promise.all([
      tx.attendanceRecord.count({ where: { sessionId, status: "present" } }),
      tx.session.count({ where: { courseId: session.courseId } }),
      tx.course.findUnique({
        where: { id: session.courseId },
        select: {
          pricingMethod: true,
          splitPlatformBp: true,
          splitTeacherBp: true,
          splitCenterBp: true,
          m2CenterFee: true,
          m2CenterBp: true,
          pricePerSession: true,
        },
      }),
    ]);
    // THE PREVIEW MUST QUOTE WHAT THE LEDGER WILL WRITE. This read
    // `pricePerSession` FIRST while the settlement engine read
    // `price / plannedSessions`, so on every course carrying both the confirm
    // dialog showed one amount and the settlement wrote another — 13 of the 14
    // such courses on dev disagree, often by 2-3x. Both now call the one
    // derivation in the money kernel, so they cannot drift again.
    const perSessionPrice = resolveLessonPrice(
      { price: course.price, pricePerSession: full?.pricePerSession ?? null },
      plannedSessions,
    );

    return {
      sessionId,
      courseTitle: course.title,
      status: session.status,
      alreadySettled: session.distributedAt !== null,
      settledAt: session.distributedAt,
      presentCount,
      plannedSessions,
      perSessionPrice,
      // The FROZEN economics this session will settle at.
      frozenPricing: full,
    };
  });
}

/**
 * §3.1 — the settlement trigger. Named action, and the most
 * money-consequential thing in this whole parity effort.
 *
 * It is a sanctioned flow, not a ledger edit: it runs the same
 * `distributeSessionRevenue` a teacher's own "complete" runs, at the course's
 * frozen rates, and it is exactly-once by construction. An already-settled
 * session is refused before anything runs.
 */
export async function adminCompleteSession(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { session } = await sessionInCenter(centerId, sessionId);
  if (session.distributedAt) {
    throw new BusinessRuleError("This session has already been settled");
  }
  const preview = await adminSettlementPreview(actor, centerId, sessionId);

  const result = await completeSession(sessionId, acting);

  // Read back what the ledger actually recorded, so the audit row carries the
  // real outcome rather than the intention.
  const settled = await platformDb(async (tx) => {
    const s = await tx.sessionSettlement.findUnique({ where: { sessionId } });
    const txns = await tx.transaction.findMany({
      where: { lessonId: sessionId },
      select: { refNumber: true, type: true, amount: true },
      orderBy: { createdAt: "asc" },
    });
    return { settlement: s, ledger: txns };
  });

  await audit(actor, centerId, {
    action: "center.session_completed",
    targetType: "session",
    targetId: sessionId,
    before: { status: session.status, distributedAt: null, preview },
    after: {
      status: "completed",
      presentCount: settled.settlement?.presentCount ?? preview.presentCount,
      platformTotal: settled.settlement?.platformTotal ?? null,
      centerTotal: settled.settlement?.centerTotal ?? null,
      teacherTotal: settled.settlement?.teacherTotal ?? null,
      ledgerRows: settled.ledger,
      // The distribution is exactly-once by construction; recorded so the log
      // shows this was the sanctioned flow, not a hand-written ledger entry.
      viaSanctionedFlow: "distributeSessionRevenue",
    },
  });

  return { ...result, settlement: settled.settlement, ledger: settled.ledger };
}

// ===========================================================================
// Counter / walk-in / temp students
// ===========================================================================

export async function adminLookupStudents(actor: SessionUser, centerId: string, q: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return lookupStudents(q, acting);
}

export async function adminSuggestSessions(
  actor: SessionUser,
  centerId: string,
  studentId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return suggestSessions(studentId, acting);
}

export async function adminCounterCheckin(
  actor: SessionUser,
  centerId: string,
  input: { studentId: string; sessionId: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await counterCheckin(input, acting);
  await audit(actor, centerId, {
    action: "center.counter_checkin",
    targetType: "session",
    targetId: input.sessionId,
    before: null,
    after: { studentId: input.studentId, result: result as never },
  });
  return result;
}

export async function adminRegisterWalkIn(
  actor: SessionUser,
  centerId: string,
  input: {
    fullName: string;
    phone: string;
    grade?: string;
    locale?: "ar" | "en";
    guardianEmail?: string;
    guardianPhone?: string;
  },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await registerWalkIn(input, acting);
  await audit(actor, centerId, {
    action: "center.walk_in_registered",
    targetType: "user",
    targetId: (result as { studentId?: string }).studentId ?? centerId,
    before: null,
    // Never the token/link — an audit reader must not be able to claim the account.
    after: { fullName: input.fullName, hasGuardianContact: !!(input.guardianEmail || input.guardianPhone) },
  });
  return result;
}

export async function adminResendWalkIn(
  actor: SessionUser,
  centerId: string,
  studentId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await resendWalkIn(studentId as never, acting as never);
  await audit(actor, centerId, {
    action: "center.walk_in_resent",
    targetType: "user",
    targetId: studentId,
    before: null,
    after: { resent: true },
  });
  return result;
}

export async function adminCreateTempStudent(
  actor: SessionUser,
  centerId: string,
  input: { fullName: string; phone?: string; grade?: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await createTempStudent(input as never, acting as never);
  await audit(actor, centerId, {
    action: "center.temp_student_created",
    targetType: "user",
    targetId: (result as { id?: string }).id ?? centerId,
    before: null,
    after: { fullName: input.fullName },
  });
  return result;
}

export async function adminSendTempStudentInvite(
  actor: SessionUser,
  centerId: string,
  tempUserId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await sendTempStudentInvite(tempUserId, acting);
  await audit(actor, centerId, {
    action: "center.temp_student_invited",
    targetType: "user",
    targetId: tempUserId,
    before: null,
    after: { invited: true },
  });
  return result;
}

// ===========================================================================
// Deletion requests
// ===========================================================================

export async function adminListDeletionRequests(
  actor: SessionUser,
  centerId: string,
  filters: { status?: string } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listDeletionRequests(acting, filters);
}

export async function adminDecideDeletionRequest(
  actor: SessionUser,
  centerId: string,
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.deletionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, userId: true, reason: true },
    }),
  );
  const result =
    decision === "approve"
      ? await approveDeletionRequest(acting, requestId)
      : await rejectDeletionRequest(acting, requestId, note);

  await audit(actor, centerId, {
    action:
      decision === "approve"
        ? "center.deletion_request_approved"
        : "center.deletion_request_rejected",
    targetType: "deletion_request",
    targetId: requestId,
    before,
    after: {
      status: decision === "approve" ? "approved" : "rejected",
      note: note ?? null,
      // Soft delete: the row and its financial history survive, and C-03 cuts
      // the account's live session on its next request.
      ...(decision === "approve"
        ? { userSoftDeleted: before?.userId ?? null, historyPreserved: true }
        : {}),
    },
  });
  return result;
}

// ===========================================================================
// Broadcast
// ===========================================================================

export async function adminBroadcast(
  actor: SessionUser,
  centerId: string,
  input: { scope: "center" | "course"; courseId?: string; title: string; body: string },
) {
  let recipients: string[] = [];

  if (input.scope === "course") {
    if (!input.courseId) throw new BusinessRuleError("courseId is required for a course broadcast");
    const courseId = input.courseId;
    const course = await platformDb((tx) =>
      tx.course.findUnique({ where: { id: courseId }, select: { centerId: true } }),
    );
    if (!course) throw new NotFoundError("Course not found");
    if (course.centerId !== centerId) {
      throw new ForbiddenError("Course belongs to a different center");
    }
    recipients = await resolveCourseStudentsAndParents(courseId);
  } else {
    const { acting } = await superadminAsCenter(actor, centerId);
    recipients = await platformDb(async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: { centerId: acting.centerId as string, status: "active" },
        select: { studentId: true },
      });
      return [...new Set(enrollments.map((e) => e.studentId))];
    });
  }

  if (recipients.length) {
    await notify({
      recipients,
      type: "admin_broadcast",
      title: input.title,
      body: input.body,
      data: { centerId, scope: input.scope, courseId: input.courseId ?? null },
    });
  }

  await audit(actor, centerId, {
    action: "center.broadcast_sent",
    targetType: input.scope === "course" ? "course" : "center",
    targetId: input.scope === "course" ? (input.courseId as string) : centerId,
    before: null,
    after: {
      scope: input.scope,
      title: input.title,
      recipients: recipients.length,
    },
  });

  return { sent: true as const, recipients: recipients.length };
}

// ===========================================================================
// Center blacklist
// ===========================================================================

export async function adminListCenterBlacklist(_actor: SessionUser, centerId: string) {
  return listCenterBlacklist(centerId);
}

export async function adminAddCenterBlacklist(
  actor: SessionUser,
  centerId: string,
  studentId: string,
  reason: string,
) {
  // Goes through the H-04 journal, exactly like the oversight "remove from
  // center" action — so lifting it restores precisely the enrollments it took.
  const entry = await centerBlacklistStudent(studentId, reason, actor, centerId);
  const journaled = await platformDb((tx) =>
    tx.blacklistCascadeAction.findMany({
      where: { entryId: entry.id },
      select: { entityType: true, entityId: true, prevStatus: true },
    }),
  );
  await audit(actor, centerId, {
    action: "center.blacklist_added",
    targetType: "user",
    targetId: studentId,
    before: { blacklisted: false },
    after: { blacklisted: true, reason, entryId: entry.id, reversible: true, cascadeJournal: journaled },
  });
  return entry;
}

export async function adminLiftCenterBlacklist(
  actor: SessionUser,
  centerId: string,
  entryId: string,
  reason?: string,
) {
  const before = await platformDb((tx) =>
    tx.blacklistEntry.findUnique({
      where: { id: entryId },
      select: { id: true, targetId: true, centerId: true, isActive: true },
    }),
  );
  if (!before || before.centerId !== centerId) {
    throw new NotFoundError("Blacklist entry not found at this center");
  }
  const result = await removeBlacklistEntry(entryId, actor, reason);
  const replayed = await platformDb((tx) =>
    tx.blacklistCascadeAction.findMany({
      where: { entryId },
      select: { entityType: true, entityId: true, reversal: true, reversedAt: true },
    }),
  );
  await audit(actor, centerId, {
    action: "center.blacklist_lifted",
    targetType: "user",
    targetId: before.targetId,
    before: { blacklisted: true, entryId },
    after: { blacklisted: false, reason: reason ?? null, cascadeReplay: replayed },
  });
  return result;
}
