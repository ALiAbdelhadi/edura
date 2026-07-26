import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  getAdminDashboard,
  getRevenueReport,
  getExpensesReport,
  getRevenueTimeseries,
  getExpensesTimeseries,
  getNetProfitReport,
  getCourseFillRates,
  getAttendanceByCourse,
  getEnrollmentFunnel,
} from "@repo/server-core/services/reports/reports";

// ---------------------------------------------------------------------------
// PHASE 5 — REPORTS (parity) + the PLATFORM-ONLY operations no center has.
//
// The reports half is the center's own reporting, read for any center — pure
// aggregation, no writes.
//
// The platform half is genuinely new capability, so each one is deliberately
// narrow and says what it will not do:
//   • moveStudentBetweenCenters  — roster only. It does NOT move enrollments,
//     subscriptions, payments or wallet history; those belong to the center
//     where they happened and moving them would rewrite settled books.
//   • forceLogout                — bumps the session epoch. No status change,
//     no deletion; the account can sign straight back in.
//   • verifyDateOfBirth          — the child-safety one. Turning a student into
//     a verified adult switches OFF parent oversight of their conversations, so
//     it demands a reason and is audited as a safety decision, not a field edit.
//   • moveCourseBetweenCenters   — REFUSED, on purpose. See the bottom of this
//     file for why it is a function that only ever throws.
// ---------------------------------------------------------------------------

type AuditSpec = {
  action: string;
  targetType: string;
  targetId: string;
  centerId: string | null;
  before?: unknown;
  after?: unknown;
};

async function audit(actor: SessionUser, spec: AuditSpec) {
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId,
          centerId: spec.centerId,
          beforeState: (spec.before ?? undefined) as never,
          afterState: (spec.after ?? undefined) as never,
          onBehalfOf: null,
        },
      }),
    { actorId: actor.id },
  );
}

// ===========================================================================
// Reports — the center's own reporting, for any center
// ===========================================================================

export async function adminCenterDashboard(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return getAdminDashboard(acting);
}

export async function adminCenterReports(
  actor: SessionUser,
  centerId: string,
  report: string,
  range: { from?: string; to?: string } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { from, to } = range;

  switch (report) {
    case "revenue":
      return getRevenueReport(acting, from, to);
    case "revenue-timeseries":
      return getRevenueTimeseries(acting, from, to);
    case "expenses":
      return getExpensesReport(acting, from, to);
    case "expenses-timeseries":
      return getExpensesTimeseries(acting, from, to);
    case "net-profit":
      return getNetProfitReport(acting, from, to);
    case "course-fill-rates":
      return getCourseFillRates(acting);
    case "attendance-by-course":
      return getAttendanceByCourse(acting, from, to);
    case "enrollment-funnel":
      return getEnrollmentFunnel(acting, from, to);
    default:
      throw new NotFoundError(`Unknown report '${report}'`);
  }
}

// ===========================================================================
// Move a student between centers — ROSTER ONLY
// ===========================================================================

/**
 * Move a student from one center's roster to another's.
 *
 * Roster membership only, and that limit is the whole design. The student's
 * enrollments, subscriptions, payments, wallet history and attendance stay
 * exactly where they are, because they are facts about what happened AT the
 * old center — several of them already settled into its books. Moving them
 * would rewrite history that has been paid out.
 *
 * So this leaves the old center's courses behind: the student is re-enrolled at
 * the new center like any other new arrival. The response reports what was left
 * behind rather than hiding it.
 */
export async function moveStudentBetweenCenters(
  actor: SessionUser,
  input: { studentId: string; fromCenterId: string; toCenterId: string; reason: string },
) {
  const { studentId, fromCenterId, toCenterId } = input;
  const reason = input.reason?.trim();
  if (!reason) throw new BusinessRuleError("A reason is required to move a student");
  if (fromCenterId === toCenterId) {
    throw new BusinessRuleError("The source and destination centers are the same");
  }

  const result = await platformDb(
    async (tx) => {
      const student = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, role: true, name: true, deletedAt: true },
      });
      if (!student || student.deletedAt) throw new NotFoundError("Student not found");
      if (student.role !== "student") throw new BusinessRuleError("That user is not a student");

      const [from, to] = await Promise.all([
        tx.center.findUnique({ where: { id: fromCenterId }, select: { id: true, name: true } }),
        tx.center.findUnique({ where: { id: toCenterId }, select: { id: true, name: true, status: true } }),
      ]);
      if (!from) throw new NotFoundError("Source center not found");
      if (!to) throw new NotFoundError("Destination center not found");
      if (to.status !== "active") {
        throw new BusinessRuleError("The destination center is not active");
      }

      const source = await tx.centerStudentRoster.findFirst({
        where: { centerId: fromCenterId, studentId, leftAt: null },
      });
      if (!source) throw new NotFoundError("Student is not on the source center's roster");

      const already = await tx.centerStudentRoster.findFirst({
        where: { centerId: toCenterId, studentId, leftAt: null },
      });
      if (already) throw new BusinessRuleError("Student is already on the destination roster");

      // What is being LEFT BEHIND — counted so the audit row and the response
      // both say it out loud instead of implying a clean move.
      const [leftEnrollments, leftSubscriptions, leftPayments] = await Promise.all([
        tx.enrollment.count({ where: { studentId, centerId: fromCenterId, status: "active" } }),
        tx.subscription.count({ where: { studentId, centerId: fromCenterId, status: "active" } }),
        tx.payment.count({ where: { studentId, centerId: fromCenterId } }),
      ]);

      await tx.centerStudentRoster.update({
        where: { id: source.id },
        data: { leftAt: new Date() },
      });
      const created = await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: toCenterId, studentId } },
        create: { centerId: toCenterId, studentId, addedAt: new Date() },
        update: { leftAt: null, addedAt: new Date() },
      });

      return {
        student,
        from,
        to,
        rosterId: created.id,
        leftBehind: {
          activeEnrollments: leftEnrollments,
          activeSubscriptions: leftSubscriptions,
          payments: leftPayments,
        },
      };
    },
    { actorId: actor.id },
  );

  // Audited against BOTH centers so it shows up in either one's log.
  for (const centerId of [fromCenterId, toCenterId]) {
    await audit(actor, {
      action: "platform.student_moved_between_centers",
      targetType: "user",
      targetId: studentId,
      centerId,
      before: { rosterCenterId: fromCenterId },
      after: {
        rosterCenterId: toCenterId,
        reason,
        // The limit of the operation, recorded rather than assumed.
        movedRosterOnly: true,
        leftAtOldCenter: result.leftBehind,
        moneyMoved: false,
      },
    });
  }

  return result;
}

// ===========================================================================
// Force-logout
// ===========================================================================

/**
 * Invalidate every live session for a user by bumping the L1 session epoch.
 *
 * Deliberately minimal: it changes no status and deletes nothing, so the person
 * can sign straight back in. It is the compromised-credential response, not a
 * punishment — deactivation is a separate, named operation.
 */
export async function forceLogoutUser(
  actor: SessionUser,
  userId: string,
  reason: string,
  centerId: string | null = null,
) {
  const why = reason?.trim();
  if (!why) throw new BusinessRuleError("A reason is required to force a logout");

  const result = await platformDb(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true, status: true, tokenVersion: true },
      });
      if (!user) throw new NotFoundError("User not found");

      const updated = await tx.$queryRaw<{ token_version: number }[]>`
        UPDATE users SET token_version = token_version + 1 WHERE id = ${userId}::uuid
        RETURNING token_version`;

      return { user, newVersion: updated[0]?.token_version ?? user.tokenVersion + 1 };
    },
    { actorId: actor.id },
  );

  await audit(actor, {
    action: "platform.user_force_logged_out",
    targetType: "user",
    targetId: userId,
    centerId,
    before: { tokenVersion: result.user.tokenVersion, status: result.user.status },
    after: {
      tokenVersion: result.newVersion,
      reason: why,
      // Said plainly: this is not a deactivation.
      statusChanged: false,
      canSignInAgain: true,
    },
  });

  return { userId, tokenVersion: result.newVersion };
}

// ===========================================================================
// §3.4 — verify a student's date of birth (CHILD SAFETY)
// ===========================================================================

/**
 * Record that a student's date of birth has been evidenced.
 *
 * This is not a profile field edit, which is why it is its own named operation
 * with a mandatory reason. `isMinor()` treats a student as a MINOR unless there
 * is a VERIFIED date of birth showing 18+, and parent oversight of their
 * conversations is active for every minor. So verifying an adult DOB switches
 * that oversight OFF. The audit row records whether it did.
 */
export async function verifyStudentDateOfBirth(
  actor: SessionUser,
  studentId: string,
  input: { dateOfBirth: string; reason: string },
  centerId: string | null = null,
) {
  if (actor.role !== "super_admin") {
    throw new ForbiddenError("Only a super admin can verify a date of birth");
  }
  const reason = input.reason?.trim();
  if (!reason) throw new BusinessRuleError("A reason is required — what evidence was seen?");

  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) throw new BusinessRuleError("Invalid date of birth");
  if (dob > new Date()) throw new BusinessRuleError("Date of birth cannot be in the future");

  const result = await platformDb(
    async (tx) => {
      const profile = await tx.studentProfile.findFirst({
        where: { userId: studentId },
        select: {
          id: true,
          dateOfBirth: true,
          dateOfBirthVerifiedAt: true,
          dateOfBirthVerifiedBy: true,
        },
      });
      if (!profile) throw new NotFoundError("Student profile not found");

      const updated = await tx.studentProfile.update({
        where: { id: profile.id },
        data: {
          dateOfBirth: dob,
          dateOfBirthVerifiedAt: new Date(),
          dateOfBirthVerifiedBy: actor.id,
        },
        select: { dateOfBirth: true, dateOfBirthVerifiedAt: true },
      });
      return { profile, updated };
    },
    { actorId: actor.id },
  );

  // The consequence, computed the same way isMinor() computes it.
  const ageMs = Date.now() - dob.getTime();
  const age = Math.floor(ageMs / (365.2425 * 24 * 60 * 60 * 1000));
  const nowAdult = age >= 18;

  await audit(actor, {
    action: "platform.date_of_birth_verified",
    targetType: "user",
    targetId: studentId,
    centerId,
    before: {
      dateOfBirth: result.profile.dateOfBirth,
      verifiedAt: result.profile.dateOfBirthVerifiedAt,
      // Default-minor: unverified or under 18 both mean minor.
      wasMinor: true,
    },
    after: {
      dateOfBirth: result.updated.dateOfBirth,
      verifiedAt: result.updated.dateOfBirthVerifiedAt,
      verifiedBy: actor.id,
      age,
      isNowAdult: nowAdult,
      // The safety consequence, recorded explicitly.
      parentOversightDisabled: nowAdult,
      reason,
    },
  });

  return { studentId, age, isNowAdult: nowAdult, parentOversightDisabled: nowAdult };
}

// ===========================================================================
// Moving a course between centers — REFUSED
// ===========================================================================

/**
 * Deliberately not implemented, and present so the refusal is discoverable
 * rather than an absence someone re-adds later.
 *
 * A course carries a pricing snapshot frozen from ITS center's configuration,
 * and its completed sessions have already settled money to that center's
 * wallet. Re-parenting it would leave distributed revenue attributed to a
 * center that no longer owns the course, and would re-rate every future session
 * against a snapshot taken from somewhere else.
 *
 * The supported path is: cancel the course at the old center and create a new
 * one at the new center, which freezes a correct snapshot and leaves the settled
 * history where it belongs.
 */
export async function moveCourseBetweenCenters(): Promise<never> {
  throw new BusinessRuleError(
    "A course cannot be moved between centers: its pricing snapshot is frozen from its own " +
      "center's configuration and its completed sessions have already settled to that center. " +
      "Cancel it and create the class at the new center instead.",
  );
}
