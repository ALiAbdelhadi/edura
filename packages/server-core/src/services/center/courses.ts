import { Prisma, type DataSource } from "@repo/database";
import { platformDb, scopedDb } from "../../db/scope";
import { runEffects, type WithEffects } from "../../db/effects";
import type { TenantTx } from "@repo/database";
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
  pricePerMonth?: number | null;
  pricePerSession?: number | null;
  dataSource?: DataSource;
};

export async function createCourse(acting: SessionUser, body: CourseCreateInput) {
  return scopedDb(acting, (tx) => createCourseTx(tx, acting, body));
}

export async function createCourseTx(
  tx: TenantTx,
  acting: SessionUser,
  body: CourseCreateInput,
) {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  const centerId = acting.centerId;

  const { course, sessionIds } = await (async () => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { teacherId: body.teacherId, status: "active", centerId },
    });
    if (!affiliation) {
      throw new BusinessRuleError("Teacher does not have an active affiliation with this center");
    }

    let dataSource = body.dataSource;
    if (!dataSource) {
      const profile = await tx.teacherProfile.findUnique({
        where: { userId: body.teacherId },
        select: { systemStatus: true },
      });
      if (profile?.systemStatus === "external") dataSource = "manual";
    }

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
      ...(created.dataSource ? { dataSource: created.dataSource } : {}),
    });

    return { course: created, sessionIds: ids };
  })();

  return { course: withSchedulePattern(course), sessionsGenerated: sessionIds.length };
}

export type TeacherDirectCourseInput = {
  title: string;
  subject: string;
  description?: string;
  gradeTag?: string;
  location?: string;
  schedulePattern: SchedulePattern;
  maxStudents: number;
  pricePerMonth?: number | null;
  pricePerSession?: number | null;
};

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
  settlementBasis?: "course_price" | "session_price" | "subscription";
  maxStudents?: number;
  defaultRoomId?: string;
  schedulePattern?: SchedulePattern;
};

export async function updateCourse(acting: SessionUser, id: string, body: CoursePatch) {
  return scopedDb(acting, (tx) => updateCourseTx(tx, acting, id, body));
}

export async function updateCourseTx(
  tx: TenantTx,
  acting: SessionUser,
  id: string,
  body: CoursePatch,
) {
  const newPattern = body.schedulePattern;

  const updated = await (async () => {
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
    if (body.settlementBasis !== undefined) data.settlementBasis = body.settlementBasis;
    if (body.maxStudents !== undefined) data.maxStudents = body.maxStudents;
    if (body.defaultRoomId !== undefined && body.defaultRoomId !== course.defaultRoomId) {
      if (course.defaultRoomId) {
        throw new BusinessRuleError(
          "This course's hall is part of its pricing arrangement and cannot be changed — create a new class for a different hall",
        );
      }
      throw new BusinessRuleError(
        "A hall cannot be attached to an existing class — create a new class for the hall",
      );
    }

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
  })();

  return withSchedulePattern(updated);
}

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
  const { value, effects } = await scopedDb(acting, (tx) =>
    cancelCourseTx(tx, acting, id, reason),
  );
  await runEffects(effects);
  return value;
}

export async function cancelCourseTx(
  tx: TenantTx,
  acting: SessionUser,
  id: string,
  reason: string,
): Promise<WithEffects<{ cancelled: true; courseTitle: string; notified: number }>> {
  const { recipients, courseTitle } = await (async () => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(acting, course.centerId);
    if (course.status === "cancelled") throw new BusinessRuleError("Course already cancelled");

    const now = new Date();

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
  })();

  return {
    value: { cancelled: true as const, courseTitle, notified: recipients.length },
    effects: [
      () =>
        notify({
          recipients,
          type: "course_cancelled",
          title: "Course cancelled",
          body: `The course "${courseTitle}" has been cancelled. Reason: ${reason}`,
          data: { courseId: id, reason },
        }),
    ],
  };
}

export async function reassignCourseTeacher(
  acting: SessionUser,
  id: string,
  teacherId: string,
) {
  return scopedDb(acting, (tx) => reassignCourseTeacherTx(tx, acting, id, teacherId));
}

export async function reassignCourseTeacherTx(
  tx: TenantTx,
  acting: SessionUser,
  id: string,
  teacherId: string,
) {
  await (async () => {
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

    await tx.session.updateMany({
      where: {
        courseId: id,
        date: { gte: startOfTodayUTC() },
        status: { in: ["scheduled", "postponed"] },
      },
      data: { teacherId },
    });
  })();

  return { reassigned: true as const, teacherId };
}

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
