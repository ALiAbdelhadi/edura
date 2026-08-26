import { Prisma, type DataSource } from "@repo/database";
import { platformDb, scopedDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import { requireCenterScope } from "../../authz/center-scope";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { startOfTodayUTC } from "../../validation/common";
import {
  generateSessionsTx,
  regenerateFutureSessionsTx,
} from "../sessions/session-generator";
import { resolveCoursePricingSnapshot } from "../finance/commission";

// ---------------------------------------------------------------------------
// CENTER COURSES — create / edit / cancel / reassign teacher.
//
// Extracted verbatim from the apps/www route handlers (courses/**), so www and
// apps/superadmin run one implementation. `acting` is center_admin-shaped and
// carries the TARGET centerId (see services/center/roster.ts for the contract).
//
// MONEY — the part to not get wrong:
//   The per-course pricing SNAPSHOT (pricingMethod + splitPlatformBp /
//   splitTeacherBp / splitCenterBp / m2CenterFee / m2CenterBp) is frozen at
//   CREATION from the superadmin config, and settlement reads it later. So:
//     • create resolves it once, via resolveCoursePricingSnapshot;
//     • edit CANNOT touch any of those columns — the patch type has no field
//       for them, and the room (which the snapshot was taken from) is refused
//       as an edit for the same reason. A different hall means a new course.
//   This is the M4.5 rule — config changes never re-rate an existing course —
//   and it is why superadmin gets no wider a door here than the center has.
// ---------------------------------------------------------------------------

export type SchedulePattern = {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date;
};

function withSchedulePattern<
  T extends {
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: Date;
    endDate: Date | null;
  },
>(course: T) {
  return {
    ...course,
    schedulePattern: {
      daysOfWeek: course.daysOfWeek,
      startTime: course.startTime,
      endTime: course.endTime,
      startDate: course.startDate,
      endDate: course.endDate,
    },
  };
}

export type CourseCreateInput = {
  teacherId: string;
  defaultRoomId?: string;
  title: string;
  subject: string;
  description?: string;
  gradeTag?: string;
  schedulePattern: SchedulePattern;
  price: number;
  maxStudents: number;
  pricingMethod?: "whole_room_percent" | "per_attending_student" | null;
  // Subscription plan prices. Previously only settable by a follow-up PATCH,
  // which left a freshly-created group unpayable until someone remembered the
  // second step. Optional, so every existing caller is unchanged.
  pricePerMonth?: number | null;
  pricePerSession?: number | null;
  /**
   * Provenance (off-system teachers). Defaults to `system` at the column, so
   * every existing caller writes exactly what it wrote before. The course's
   * generated sessions inherit the same label.
   */
  dataSource?: DataSource;
};

export async function createCourse(acting: SessionUser, body: CourseCreateInput) {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  const centerId = acting.centerId;

  // ONE TRANSACTION — the course row and its sessions commit or roll back
  // together. They used to run in two: `generateSessions` opened its own
  // transaction AFTER the course had committed, so a schedule conflict threw
  // 409 at the caller while leaving a committed course with ZERO sessions
  // behind — a group nobody can attend, nothing can settle, and which still
  // shows up in the center's Classes list. This is the same defect that was
  // already fixed on the EDIT path (see updateCourse / the note on
  // regenerateFutureSessionsTx); create was simply never brought along.
  // Collaboration-request acceptance has always done it this way.
  const { course, sessionIds } = await scopedDb(acting, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { teacherId: body.teacherId, status: "active", centerId },
    });
    if (!affiliation) {
      throw new BusinessRuleError("Teacher does not have an active affiliation with this center");
    }

    // PROVENANCE IS DERIVED, NOT REMEMBERED. A group belonging to an off-system
    // teacher is manual entry by definition — that teacher has no account and
    // could not have created it. Deriving it here means the ordinary Classes
    // screen labels such a group correctly without knowing this feature exists;
    // leaving it to callers would mean the label is right only where someone
    // remembered to pass it, which is the same as not having it. An explicit
    // `body.dataSource` still wins, and a teacher with no profile row (predates
    // this feature) resolves to `enrolled`, so nothing existing changes.
    let dataSource = body.dataSource;
    if (!dataSource) {
      const profile = await tx.teacherProfile.findUnique({
        where: { userId: body.teacherId },
        select: { systemStatus: true },
      });
      if (profile?.systemStatus === "external") dataSource = "manual";
    }

    // The room must be the ACTING center's — an arbitrary roomId would freeze
    // another center's method/rate onto this course (cross-tenant money leak).
    if (body.defaultRoomId) {
      const room = await tx.room.findFirst({
        where: { id: body.defaultRoomId, centerId, isActive: true },
        select: { id: true },
      });
      if (!room) throw new NotFoundError("Hall not found at this center");
    }

    const splitSnapshot = await resolveCoursePricingSnapshot(tx, {
      roomId: body.defaultRoomId ?? null,
      centerId,
      requestedMethod: body.pricingMethod ?? null,
    });

    const created = await tx.course.create({
      data: {
        centerId,
        teacherId: body.teacherId,
        defaultRoomId: body.defaultRoomId ?? null,
        title: body.title,
        subject: body.subject,
        description: body.description,
        gradeTag: body.gradeTag,
        daysOfWeek: body.schedulePattern.daysOfWeek,
        startTime: body.schedulePattern.startTime,
        endTime: body.schedulePattern.endTime,
        startDate: body.schedulePattern.startDate,
        endDate: body.schedulePattern.endDate,
        price: body.price,
        pricePerMonth: body.pricePerMonth ?? null,
        pricePerSession: body.pricePerSession ?? null,
        maxStudents: body.maxStudents,
        status: "active",
        ...(dataSource ? { dataSource } : {}),
        ...splitSnapshot,
      },
    });

    const ids = await generateSessionsTx(tx, {
      id: created.id,
      teacherId: created.teacherId,
      defaultRoomId: created.defaultRoomId,
      schedulePattern: body.schedulePattern,
      // Sessions inherit the group's provenance, derived or explicit.
      ...(created.dataSource ? { dataSource: created.dataSource } : {}),
    });

    return { course: created, sessionIds: ids };
  });

  return { course: withSchedulePattern(course), sessionsGenerated: sessionIds.length };
}

export type TeacherDirectCourseInput = {
  title: string;
  subject: string;
  description?: string;
  gradeTag?: string;
  /** Free-text venue ("قاعتي الخاصة", "أونلاين", …) — decision #2. */
  location?: string;
  schedulePattern: SchedulePattern;
  maxStudents: number;
  pricePerMonth?: number | null;
  pricePerSession?: number | null;
};

/**
 * Teacher-owned group (decision #2): `centerId` stays NULL — no shadow
 * centers. Money deliberately takes the OTHER rail: settlement happens at
 * subscription-payment time (price − platform commission → teacher wallet),
 * and distribution skips NULL-center courses (the double-pay guard), so no
 * center/hall pricing snapshot is resolved here — there is nobody to split
 * with. Teacher only, not delegated to assistants: plan prices are financial
 * settings, which Step 8 excludes from delegation.
 */
export async function createTeacherDirectCourse(
  acting: SessionUser,
  body: TeacherDirectCourseInput,
) {
  if (acting.role !== "teacher") throw new ForbiddenError("Teacher only");
  if ((body.pricePerMonth ?? 0) <= 0 && (body.pricePerSession ?? 0) <= 0) {
    throw new BusinessRuleError(
      "At least one plan price (monthly or per-session) must be set",
    );
  }

  // ONE TRANSACTION, for the same reason as createCourse above: a conflicting
  // schedule must leave no orphan course behind.
  const { course, sessionIds } = await scopedDb(acting, async (tx) => {
    const created = await tx.course.create({
      data: {
        centerId: null,
        teacherId: acting.id,
        defaultRoomId: null,
        title: body.title,
        subject: body.subject,
        description: body.description,
        gradeTag: body.gradeTag,
        location: body.location ?? null,
        daysOfWeek: body.schedulePattern.daysOfWeek,
        startTime: body.schedulePattern.startTime,
        endTime: body.schedulePattern.endTime,
        startDate: body.schedulePattern.startDate,
        endDate: body.schedulePattern.endDate,
        // Legacy full-course price column (NOT NULL): mirror the monthly plan
        // so old readers see a sane figure; coverage checks use the plans.
        price: body.pricePerMonth ?? body.pricePerSession ?? 0,
        pricePerMonth: body.pricePerMonth ?? null,
        pricePerSession: body.pricePerSession ?? null,
        maxStudents: body.maxStudents,
        status: "active",
      },
    });

    const ids = await generateSessionsTx(tx, {
      id: created.id,
      teacherId: created.teacherId,
      defaultRoomId: null,
      schedulePattern: body.schedulePattern,
    });

    return { course: created, sessionIds: ids };
  });

  return { course: withSchedulePattern(course), sessionsGenerated: sessionIds.length };
}

export type CoursePatch = {
  title?: string;
  description?: string;
  gradeTag?: string;
  price?: number;
  pricePerMonth?: number | null;
  pricePerSession?: number | null;
  /** What one lesson is worth for this group — see resolveLessonPrice. */
  settlementBasis?: "course_price" | "session_price" | "subscription";
  maxStudents?: number;
  defaultRoomId?: string;
  schedulePattern?: SchedulePattern;
};

export async function updateCourse(acting: SessionUser, id: string, body: CoursePatch) {
  const newPattern = body.schedulePattern;

  const updated = await scopedDb(acting, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(acting, course.centerId);

    const data: Prisma.CourseUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.gradeTag !== undefined) data.gradeTag = body.gradeTag;
    if (body.price !== undefined) data.price = body.price;
    if (body.pricePerMonth !== undefined) data.pricePerMonth = body.pricePerMonth;
    if (body.pricePerSession !== undefined) data.pricePerSession = body.pricePerSession;
    // Changing the basis re-prices FUTURE lessons only. Lessons already settled
    // are untouched: the ledger is append-only and M4.5 forbids re-rating, so
    // this is a forward-looking decision, never a retroactive correction.
    if (body.settlementBasis !== undefined) data.settlementBasis = body.settlementBasis;
    if (body.maxStudents !== undefined) data.maxStudents = body.maxStudents;
    if (body.defaultRoomId !== undefined && body.defaultRoomId !== course.defaultRoomId) {
      // The room is part of the money arrangement: the pricing method + rate
      // were frozen from it at creation and are never re-snapshotted. Swapping
      // the room would decouple the frozen economics from the actual hall —
      // a different hall means a new course / collaboration request.
      if (course.defaultRoomId) {
        throw new BusinessRuleError(
          "This course's hall is part of its pricing arrangement and cannot be changed — create a new class for a different hall",
        );
      }
      throw new BusinessRuleError(
        "A hall cannot be attached to an existing class — create a new class for the hall",
      );
    }

    // Method-2 flat fee must stay coverable by the per-session price, or
    // session completion will (correctly) refuse to settle. Validate the
    // pricing edit against the frozen snapshot up front.
    if (
      body.price !== undefined &&
      course.pricingMethod === "per_attending_student" &&
      course.m2CenterFee != null
    ) {
      const planned = await tx.session.count({ where: { courseId: id } });
      const perSession = planned > 0 ? Math.round(body.price / planned) : body.price;
      const platformCut = Math.round((perSession * (course.splitPlatformBp ?? 0)) / 10_000);
      if (perSession - platformCut - course.m2CenterFee < 0) {
        throw new BusinessRuleError(
          "Course price is too low for this hall's per-student fee — sessions could not be settled",
        );
      }
    }
    if (newPattern) {
      // A course that already started keeps its (past) startDate on edit —
      // otherwise every historical course is uneditable. What stays refused is
      // MOVING the start into the past: that would ask the generator to plan
      // sessions nobody can attend.
      const sameStart =
        newPattern.startDate.getTime() === course.startDate.getTime();
      if (!sameStart && newPattern.startDate < startOfTodayUTC()) {
        throw new BusinessRuleError("startDate cannot be moved into the past");
      }
      data.daysOfWeek = newPattern.daysOfWeek;
      data.startTime = newPattern.startTime;
      data.endTime = newPattern.endTime;
      data.startDate = newPattern.startDate;
      data.endDate = newPattern.endDate;
    }

    const saved = await tx.course.update({ where: { id }, data });

    // Same transaction as the course-row change, deliberately: regeneration
    // can refuse (schedule conflict with the teacher's other groups), and when
    // it does the course edit must roll back with it — otherwise the course
    // says one schedule while its sessions (what attendance and money run on)
    // still say another.
    if (newPattern) {
      await regenerateFutureSessionsTx(
        tx,
        {
          id: saved.id,
          teacherId: saved.teacherId,
          defaultRoomId: saved.defaultRoomId,
          schedulePattern: newPattern,
          ...(saved.dataSource ? { dataSource: saved.dataSource } : {}),
        },
        newPattern,
      );
    }

    return saved;
  });

  return withSchedulePattern(updated);
}

/**
 * T-1 (TEACHER_IA_AUDIT §7.2 #1, approved 2026-08-21): a teacher edits the
 * PRICING of their own TEACHER-DIRECT group. Before this, plan prices existed
 * only at create time, so an unpriced or mispriced teacher-direct group was
 * unfixable by the person who owns it — while lesson-settlement (correctly)
 * refuses to settle an unpriced lesson, leaving the owner locked out of the
 * refusal with no way through.
 *
 * Scope, exactly as approved:
 *   - `centerId IS NULL` courses the caller teaches — a CENTERED course 404s
 *     for a teacher even if they teach it (its pricing is the center's
 *     arrangement, edited through the center door above).
 *   - PRICING FIELDS ONLY: price, pricePerMonth, pricePerSession,
 *     settlementBasis (the same owner-pricing family `updateCourse` groups
 *     together — "Owner-only, like the prices it chooses between"). No title,
 *     no schedule, no capacity: those stay create-time until decided otherwise.
 *   - `requireRole("teacher")` at the route — deliberately NOT `delegated()`:
 *     plan prices are financial settings, which Step 8 excludes from
 *     delegation (the same reason the assistant's create-group button is
 *     gated).
 *
 * NotFound (never Forbidden) for a course the caller does not own — an id
 * probe learns nothing, same posture as callerOwnsTempStudent (M5).
 *
 * platformDb, not scopedDb: teacher-direct courses have NULL center_id, which
 * tenant RLS deliberately hides ("bypass-only" — see createWalkInSubscription's
 * note); ownership is enforced explicitly here instead.
 */
export type TeacherDirectPricingPatch = {
  price?: number;
  pricePerMonth?: number | null;
  pricePerSession?: number | null;
  settlementBasis?: "course_price" | "session_price" | "subscription";
};

export async function updateTeacherDirectPricing(
  teacher: SessionUser,
  id: string,
  body: TeacherDirectPricingPatch,
) {
  return platformDb(
    async (tx) => {
      const course = await tx.course.findUnique({ where: { id } });
      if (!course || course.teacherId !== teacher.id || course.centerId !== null) {
        throw new NotFoundError("Course not found");
      }

      const data: Prisma.CourseUncheckedUpdateInput = {};
      if (body.price !== undefined) data.price = body.price;
      if (body.pricePerMonth !== undefined) data.pricePerMonth = body.pricePerMonth;
      if (body.pricePerSession !== undefined) data.pricePerSession = body.pricePerSession;
      // Forward-looking only, same as updateCourse: settled lessons are never
      // re-rated (append-only ledger, M4.5).
      if (body.settlementBasis !== undefined) data.settlementBasis = body.settlementBasis;

      if (Object.keys(data).length === 0) {
        throw new BusinessRuleError("Nothing to update");
      }
      return tx.course.update({ where: { id }, data });
    },
    { actorId: teacher.id },
  );
}

export async function cancelCourse(acting: SessionUser, id: string, reason: string) {
  const { recipients, courseTitle } = await scopedDb(acting, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(acting, course.centerId);
    if (course.status === "cancelled") throw new BusinessRuleError("Course already cancelled");

    const now = new Date();

    // Only FUTURE sessions are cancelled. Past ones stay exactly as they are —
    // a completed session may already have settled, and its record must not be
    // rewritten by a cancellation that happens afterwards.
    await tx.session.updateMany({
      where: {
        courseId: id,
        date: { gte: startOfTodayUTC() },
        status: { in: ["scheduled", "postponed"] },
      },
      data: { status: "cancelled", cancellationReason: reason, editedAt: now },
    });

    await tx.course.update({ where: { id }, data: { status: "cancelled" } });

    const enrollments = await tx.enrollment.findMany({
      where: { courseId: id, status: "active" },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const adminProfiles = await tx.centerAdminProfile.findMany({
      where: { centerId: acting.centerId as string },
      select: { userId: true },
    });
    const adminIds = adminProfiles.map((a) => a.userId);

    return {
      recipients: [...new Set([...studentIds, ...adminIds])],
      courseTitle: course.title,
    };
  });

  await notify({
    recipients,
    type: "course_cancelled",
    title: "Course cancelled",
    body: `The course "${courseTitle}" has been cancelled. Reason: ${reason}`,
    data: { courseId: id, reason },
  });

  return { cancelled: true as const, courseTitle, notified: recipients.length };
}

export async function reassignCourseTeacher(
  acting: SessionUser,
  id: string,
  teacherId: string,
) {
  await scopedDb(acting, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(acting, course.centerId);

    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId: acting.centerId as string, teacherId, status: "active" },
    });
    if (!affiliation) {
      throw new BusinessRuleError("Teacher does not have an active affiliation with this center");
    }

    await tx.course.update({ where: { id }, data: { teacherId } });

    // Future sessions only — a past session records who actually taught it.
    await tx.session.updateMany({
      where: {
        courseId: id,
        date: { gte: startOfTodayUTC() },
        status: { in: ["scheduled", "postponed"] },
      },
      data: { teacherId },
    });
  });

  return { reassigned: true as const, teacherId };
}

/** Read one course with its roster counts — used by the back-office detail view. */
export async function getCenterCourse(acting: SessionUser, id: string) {
  return scopedDb(acting, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(acting, course.centerId);

    const [enrolledCount, teacher, room] = await Promise.all([
      tx.enrollment.count({ where: { courseId: id, status: "active" } }),
      tx.user.findUnique({ where: { id: course.teacherId }, select: { id: true, name: true } }),
      course.defaultRoomId
        ? tx.room.findUnique({
            where: { id: course.defaultRoomId },
            select: { id: true, name: true },
          })
        : null,
    ]);

    return {
      ...withSchedulePattern(course),
      enrolledCount,
      remainingSeats: course.maxStudents - enrolledCount,
      teacherName: teacher?.name ?? "",
      roomName: room?.name ?? "",
    };
  });
}
