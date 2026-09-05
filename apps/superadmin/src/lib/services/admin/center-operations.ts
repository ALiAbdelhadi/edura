import { platformDb, scopedDb } from "@/lib/db/scope";
import { runEffects } from "@repo/server-core/db/effects";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { recordAdminAudit, type AdminAuditSpec } from "@/lib/services/admin/admin-audit";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  getSessionAttendance,
  bulkMarkAttendanceTx,
  editAttendanceTx,
} from "@repo/server-core/services/attendance/attendance";
import {
  cancelSessionTx,
  postponeSessionTx,
} from "@repo/server-core/services/session-actions/session-actions";
import { completeSessionTx } from "@repo/server-core/services/finance/distribution";
import { resolveLessonPrice } from "@repo/server-core/services/finance/fees";
import {
  listDeletionRequests,
  approveDeletionRequestTx,
  rejectDeletionRequestTx,
} from "@repo/server-core/services/center/deletion-requests";
import {
  listCenterBlacklist,
  centerBlacklistStudentTx,
  removeBlacklistEntryTx,
} from "@/lib/services/blacklist/blacklist";
import { notify } from "@/lib/services/notifications/notify";
import { resolveCourseStudentsAndParents } from "@repo/server-core/services/notifications/fanout";

function audit(actor: SessionUser, centerId: string, spec: AdminAuditSpec) {
  return recordAdminAudit(actor, { ...spec, centerId });
}

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

export async function adminGetSessionAttendance(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
) {
  await sessionInCenter(centerId, sessionId);
  return getSessionAttendance(sessionId, actor.id, "center_admin", centerId);
}

export async function adminEditAttendance(
  actor: SessionUser,
  centerId: string,
  attendanceId: string,
  newStatus: "present" | "absent" | "excused",
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const before = await tx.attendanceRecord.findUnique({
      where: { id: attendanceId },
      select: { id: true, status: true, sessionId: true, studentId: true, centerId: true },
    });
    if (!before) throw new NotFoundError("Attendance record not found");
    if (before.centerId !== centerId) {
      throw new ForbiddenError("Attendance record belongs to a different center");
    }

    const outcome = await editAttendanceTx(tx, attendanceId, newStatus, actor.id, centerId, {
      overrideSettledLock: true,
    });

    const settlement = await tx.sessionSettlement.findUnique({
      where: { sessionId: before.sessionId },
      select: { id: true, presentCount: true },
    });
    let divergence: Record<string, unknown> | null = null;
    if (settlement) {
      const presentNow = await tx.attendanceRecord.count({
        where: { sessionId: before.sessionId, status: "present" },
      });
      divergence = {
        settlementId: settlement.id,
        settledPresentCount: settlement.presentCount,
        presentCountNow: presentNow,
        diverged: presentNow !== settlement.presentCount,
        settlementRecomputed: false,
      };
    }

    await writeAdminAudit(tx, actor, {
      action: "center.attendance_corrected",
      targetType: "attendance_record",
      targetId: attendanceId,
      centerId,
      before: { status: before.status, sessionId: before.sessionId, studentId: before.studentId },
      after: { status: newStatus, settlementDivergence: divergence },
    });

    return {
      value: { ...outcome.value, settlementDivergence: divergence },
      effects: outcome.effects,
    };
  });
  await runEffects(effects);
  return value;
}

export async function adminBulkAttendance(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
  entries: { studentId: string; status: string; notes?: string }[],
) {
  await sessionInCenter(centerId, sessionId);
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const before = await tx.attendanceRecord.count({
      where: { sessionId, status: "present" },
    });
    const outcome = await bulkMarkAttendanceTx(
      tx,
      sessionId,
      entries as never,
      actor.id,
      centerId,
    );
    const after = await tx.attendanceRecord.count({
      where: { sessionId, status: "present" },
    });
    await writeAdminAudit(tx, actor, {
      action: "center.attendance_bulk_marked",
      targetType: "session",
      targetId: sessionId,
      centerId,
      before: { presentCount: before },
      after: { presentCount: after, entries: entries.length },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminCancelSession(
  actor: SessionUser,
  centerId: string,
  sessionId: string,
  reason: string,
) {
  const { session } = await sessionInCenter(centerId, sessionId);
  if (session.distributedAt) {
    throw new BusinessRuleError(
      "This session has already been settled — its revenue is distributed and it cannot be cancelled",
    );
  }
  const { value, effects } = await platformDb(
    async (tx) => {
      const outcome = await cancelSessionTx(tx, sessionId, session.teacherId, reason);
      await writeAdminAudit(tx, actor, {
        action: "center.session_cancelled",
        targetType: "session",
        targetId: sessionId,
        centerId,
        before: { status: session.status, date: session.date },
        after: { status: "cancelled", reason, settledBefore: false },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

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
  const { value, effects } = await platformDb(
    async (tx) => {
      const outcome = await postponeSessionTx(
        tx,
        sessionId,
        session.teacherId,
        input.newDate,
        input.newStartTime,
        input.newEndTime,
        input.reason,
      );
      await writeAdminAudit(tx, actor, {
        action: "center.session_postponed",
        targetType: "session",
        targetId: sessionId,
        centerId,
        before: { date: session.date, startTime: session.startTime, endTime: session.endTime },
        after: {
          date: input.newDate,
          startTime: input.newStartTime,
          endTime: input.newEndTime,
          reason: input.reason,
          settledBefore: false,
        },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

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
      frozenPricing: full,
    };
  });
}

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

  return platformDb(
    async (tx) => {
      const result = await completeSessionTx(tx, sessionId, acting);

      const settlement = await tx.sessionSettlement.findUnique({ where: { sessionId } });
      const ledger = await tx.transaction.findMany({
        where: { lessonId: sessionId },
        select: { refNumber: true, type: true, amount: true },
        orderBy: { createdAt: "asc" },
      });

      await writeAdminAudit(tx, actor, {
        action: "center.session_completed",
        targetType: "session",
        targetId: sessionId,
        centerId,
        before: { status: session.status, distributedAt: null, preview },
        after: {
          status: "completed",
          presentCount: settlement?.presentCount ?? preview.presentCount,
          platformTotal: settlement?.platformTotal ?? null,
          centerTotal: settlement?.centerTotal ?? null,
          teacherTotal: settlement?.teacherTotal ?? null,
          ledgerRows: ledger,
          viaSanctionedFlow: "distributeSessionRevenue",
        },
      });

      return { ...result, settlement, ledger };
    },
    { actorId: actor.id },
  );
}

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
  return scopedDb(acting, async (tx) => {
    const before = await tx.deletionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, userId: true, reason: true },
    });
    const result =
      decision === "approve"
        ? await approveDeletionRequestTx(tx, acting, requestId)
        : await rejectDeletionRequestTx(tx, acting, requestId, note);

    await writeAdminAudit(tx, actor, {
      action:
        decision === "approve"
          ? "center.deletion_request_approved"
          : "center.deletion_request_rejected",
      targetType: "deletion_request",
      targetId: requestId,
      centerId,
      before,
      after: {
        status: decision === "approve" ? "approved" : "rejected",
        note: note ?? null,
        ...(decision === "approve"
          ? { userSoftDeleted: before?.userId ?? null, historyPreserved: true }
          : {}),
      },
    });
    return result;
  });
}

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

export async function adminListCenterBlacklist(_actor: SessionUser, centerId: string) {
  return listCenterBlacklist(centerId);
}

export async function adminAddCenterBlacklist(
  actor: SessionUser,
  centerId: string,
  studentId: string,
  reason: string,
) {
  const { value, effects } = await platformDb(
    async (tx) => {
      const outcome = await centerBlacklistStudentTx(tx, studentId, reason, actor, centerId);
      const entry = outcome.value;
      const journaled = await tx.blacklistCascadeAction.findMany({
        where: { entryId: entry.id },
        select: { entityType: true, entityId: true, prevStatus: true },
      });
      await writeAdminAudit(tx, actor, {
        action: "center.blacklist_added",
        targetType: "user",
        targetId: studentId,
        centerId,
        before: { blacklisted: false },
        after: {
          blacklisted: true,
          reason,
          entryId: entry.id,
          reversible: true,
          cascadeJournal: journaled,
        },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

export async function adminLiftCenterBlacklist(
  actor: SessionUser,
  centerId: string,
  entryId: string,
  reason?: string,
) {
  const { value, effects } = await platformDb(
    async (tx) => {
      const before = await tx.blacklistEntry.findUnique({
        where: { id: entryId },
        select: { id: true, targetId: true, centerId: true, isActive: true },
      });
      if (!before || before.centerId !== centerId) {
        throw new NotFoundError("Blacklist entry not found at this center");
      }
      const outcome = await removeBlacklistEntryTx(tx, entryId, actor, reason);
      const replayed = await tx.blacklistCascadeAction.findMany({
        where: { entryId },
        select: { entityType: true, entityId: true, reversal: true, reversedAt: true },
      });
      await writeAdminAudit(tx, actor, {
        action: "center.blacklist_lifted",
        targetType: "user",
        targetId: before.targetId,
        centerId,
        before: { blacklisted: true, entryId },
        after: { blacklisted: false, reason: reason ?? null, cascadeReplay: replayed },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}
