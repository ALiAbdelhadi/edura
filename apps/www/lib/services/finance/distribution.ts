import { platformDb, type TenantTx } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { awardPoints } from "@/lib/services/points/points";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Money-distribution engine (PRD §5.1), reconciled to Edura's Course→Session model.
 *
 * PRD is a per-lesson marketplace; Edura prices per COURSE and runs recurring
 * SESSIONS. Reconciliation decisions (flagged for business confirmation in
 * docs/API_Audit_Changelog — money logic is owner-owned):
 *   - A "booked lesson" = one PRESENT student in a completed Session.
 *   - lessonPrice (per present student) = round(course.price / plannedSessions).
 *   - centerShare (per lesson) = the active CenterTeacherAffiliation.centerShare
 *     for (center, teacher), default 0.
 *   - Platform earns EGP 2 from teacher + EGP 2 from center per booked lesson
 *     (200 + 200 piasters), EXACTLY per PRD §5.1 — not "fixed".
 *
 * All amounts are integer piasters. Transactions are append-only (immutable
 * ledger); corrections happen via reversal inserts, never edits.
 */
export const PLATFORM_TEACHER_FEE = 200; // 2 EGP
export const PLATFORM_CENTER_FEE = 200; // 2 EGP

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

/**
 * Distribute revenue for a session already known to be completed. MUST run
 * inside a platform-context transaction. Idempotent: if commission transactions
 * already exist for this session, it does nothing.
 */
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

  // Idempotency guard — never distribute the same session twice.
  const already = await tx.transaction.findFirst({
    where: { lessonId: sessionId, type: "commission" },
    select: { id: true },
  });
  if (already) return { distributed: false, reason: "already_distributed" };

  const plannedSessions = await tx.session.count({ where: { courseId: course.id } });
  const perSessionPrice =
    plannedSessions > 0 ? Math.round(course.price / plannedSessions) : course.price;

  const affiliation = await tx.centerTeacherAffiliation.findFirst({
    where: { centerId, teacherId, status: "active" },
    select: { centerShare: true },
  });
  const centerShare = affiliation?.centerShare ?? 0;

  const present = await tx.attendanceRecord.findMany({
    where: { sessionId, status: "present" },
    select: { studentId: true },
  });
  if (present.length === 0) return { distributed: false, reason: "no_present_students" };

  // Ref-number sequence (TXN-YYYY-NNNNN). Counted once, incremented locally —
  // safe because this whole function runs in a single transaction.
  const year = new Date().getFullYear();
  let seq = await tx.transaction.count();
  const mkRef = () => `TXN-${year}-${String(++seq).padStart(5, "0")}`;

  const teacherNet = perSessionPrice - PLATFORM_TEACHER_FEE - centerShare;
  const centerNet = centerShare - PLATFORM_CENTER_FEE;

  const rows: Parameters<TenantTx["transaction"]["createMany"]>[0]["data"] = [];
  for (const { studentId } of present) {
    rows.push(
      {
        refNumber: mkRef(),
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
        refNumber: mkRef(),
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
        refNumber: mkRef(),
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
    // Engagement points for attending (PRD §5.7).
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

/**
 * Mark a session completed and distribute its revenue. Authorized for the
 * session's own teacher or a center_admin of the session's center.
 */
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

      // Distribute (idempotent — safe even if the session was already completed).
      const distribution = await distributeSessionRevenue(tx, sessionId);
      return { session: updated, distribution };
    },
    { actorId: user.id },
  );
}
