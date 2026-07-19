import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb, platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
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
    if (body.maxStudents !== undefined) data.maxStudents = body.maxStudents;
    if (body.defaultRoomId !== undefined) data.defaultRoomId = body.defaultRoomId;
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
