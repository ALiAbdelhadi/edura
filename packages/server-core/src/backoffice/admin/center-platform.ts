import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { writeAdminAudit } from "../../audit/admin-audit";
import { superadminAsCenter } from "../center-actor";
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
} from "../../services/reports/reports";

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

      const leftBehind = {
        activeEnrollments: leftEnrollments,
        activeSubscriptions: leftSubscriptions,
        payments: leftPayments,
      };

      for (const centerId of [fromCenterId, toCenterId]) {
        await writeAdminAudit(tx, actor, {
          action: "platform.student_moved_between_centers",
          targetType: "user",
          targetId: studentId,
          centerId,
          before: { rosterCenterId: fromCenterId },
          after: {
            rosterCenterId: toCenterId,
            reason,
            movedRosterOnly: true,
            leftAtOldCenter: leftBehind,
            moneyMoved: false,
          },
        });
      }

      return {
        student,
        from,
        to,
        rosterId: created.id,
        leftBehind,
      };
    },
    { actorId: actor.id },
  );

  return result;
}

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
      const newVersion = updated[0]?.token_version ?? user.tokenVersion + 1;

      await writeAdminAudit(tx, actor, {
        action: "platform.user_force_logged_out",
        targetType: "user",
        targetId: userId,
        centerId,
        before: { tokenVersion: user.tokenVersion, status: user.status },
        after: {
          tokenVersion: newVersion,
          reason: why,
          statusChanged: false,
          canSignInAgain: true,
        },
      });

      return { user, newVersion };
    },
    { actorId: actor.id },
  );

  return { userId, tokenVersion: result.newVersion };
}

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

  const ageMs = Date.now() - dob.getTime();
  const age = Math.floor(ageMs / (365.2425 * 24 * 60 * 60 * 1000));
  const nowAdult = age >= 18;

  await platformDb(
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

      await writeAdminAudit(tx, actor, {
        action: "platform.date_of_birth_verified",
        targetType: "user",
        targetId: studentId,
        centerId,
        before: {
          dateOfBirth: profile.dateOfBirth,
          verifiedAt: profile.dateOfBirthVerifiedAt,
          wasMinor: true,
        },
        after: {
          dateOfBirth: updated.dateOfBirth,
          verifiedAt: updated.dateOfBirthVerifiedAt,
          verifiedBy: actor.id,
          age,
          isNowAdult: nowAdult,
          parentOversightDisabled: nowAdult,
          reason,
        },
      });

      return { profile, updated };
    },
    { actorId: actor.id },
  );

  return { studentId, age, isNowAdult: nowAdult, parentOversightDisabled: nowAdult };
}

export async function moveCourseBetweenCenters(): Promise<never> {
  throw new BusinessRuleError(
    "A course cannot be moved between centers: its pricing snapshot is frozen from its own " +
      "center's configuration and its completed sessions have already settled to that center. " +
      "Cancel it and create the class at the new center instead.",
  );
}
