import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb, platformDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema, isNotPastDate } from "@/lib/validation/common";
import { regenerateFutureSessions } from "@/lib/services/sessions/session-generator";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function schedulePatternOf(course: {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date | null;
}) {
  return {
    daysOfWeek: course.daysOfWeek,
    startTime: course.startTime,
    endTime: course.endTime,
    startDate: course.startDate,
    endDate: course.endDate,
  };
}

export const GET = withErrors(async (_req, ctx) => {
  const { id } = await ctx.params;

  const result = await platformDb(async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");

    const [enrolledCount, teacher, center, reviews] = await Promise.all([
      tx.enrollment.count({ where: { courseId: id, status: "active" } }),
      tx.user.findUnique({ where: { id: course.teacherId }, select: { id: true, name: true } }),
      course.centerId
        ? tx.center.findUnique({ where: { id: course.centerId }, select: { id: true, name: true } })
        : null,
      tx.review.aggregate({
        where: { teacherId: course.teacherId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const avg = reviews._avg.rating;
    return {
      ...course,
      schedulePattern: schedulePatternOf(course),
      remainingSeats: course.maxStudents - enrolledCount,
      enrolledCount,
      teacherName: teacher?.name ?? "",
      centerName: center?.name ?? "",
      centerId: course.centerId,
      teacherRating: avg ? Math.round(avg * 10) / 10 : 0,
      teacherReviewCount: reviews._count ?? 0,
    };
  });

  return ok(result);
});

const schedulePatternSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((p) => isNotPastDate(p.startDate.toISOString().slice(0, 10)), {
    message: "startDate cannot be in the past",
    path: ["startDate"],
  })
  .refine((p) => p.endDate >= p.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  gradeTag: z.string().optional(),
  price: moneySchema.optional(),
  // Step 4/5 plan pricing: null clears (disables) a plan. Courses created from
  // accepted collaboration requests start UNPRICED — the owner sets these so
  // students can subscribe.
  pricePerMonth: moneySchema.positive().nullish(),
  pricePerSession: moneySchema.positive().nullish(),
  maxStudents: z.number().int().positive().max(10000).optional(),
  defaultRoomId: z.string().optional(),
  schedulePattern: schedulePatternSchema.optional(),
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);

  const newPattern = body.schedulePattern;
  const patternChanged = !!newPattern;

  const updated = await scopedDb(user, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(user, course.centerId);

    const data: Prisma.CourseUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.gradeTag !== undefined) data.gradeTag = body.gradeTag;
    if (body.price !== undefined) data.price = body.price;
    if (body.pricePerMonth !== undefined) data.pricePerMonth = body.pricePerMonth;
    if (body.pricePerSession !== undefined) data.pricePerSession = body.pricePerSession;
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
      // No-room course attaching a room for the first time: the course has no
      // pricing snapshot, so attaching a hall here would silently bypass the
      // method/rate snapshot too. Same rule: new hall = new course.
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
      data.daysOfWeek = newPattern.daysOfWeek;
      data.startTime = newPattern.startTime;
      data.endTime = newPattern.endTime;
      data.startDate = newPattern.startDate;
      data.endDate = newPattern.endDate;
    }

    return tx.course.update({ where: { id }, data });
  });

  if (patternChanged && newPattern) {
    await regenerateFutureSessions(
      {
        id: updated.id,
        teacherId: updated.teacherId,
        defaultRoomId: updated.defaultRoomId,
        schedulePattern: newPattern,
      },
      newPattern,
      user,
    );
  }

  return ok({ ...updated, schedulePattern: schedulePatternOf(updated) });
});
