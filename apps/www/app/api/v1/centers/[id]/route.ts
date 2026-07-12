import { withErrors } from "@/lib/errors/http";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const id = (await ctx.params).id;

  const result = await platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id } });
    if (!center) throw new NotFoundError("Center not found");

    const courses = await tx.course.findMany({
      where: { centerId: id, status: "active" },
      select: {
        id: true,
        title: true,
        subject: true,
        gradeTag: true,
        price: true,
        maxStudents: true,
        teacherId: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        startDate: true,
        endDate: true,
      },
    });

    const courseIds = courses.map((c) => c.id);
    const teacherIds = [...new Set(courses.map((c) => c.teacherId).filter(Boolean))];

    const teachers = await tx.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, name: true },
    });

    const enrollmentCounts = await tx.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "active" },
      _count: { _all: true },
    });

    const reviewStats = await tx.review.aggregate({
      where: { centerId: id },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
    const countMap = new Map(enrollmentCounts.map((e) => [e.courseId, e._count._all]));

    const enrichedCourses = courses.map((c) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      gradeTag: c.gradeTag,
      price: c.price,
      maxStudents: c.maxStudents,
      enrolledCount: countMap.get(c.id) ?? 0,
      teacherName: teacherMap.get(c.teacherId) ?? "",
      schedulePattern: {
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        startDate: c.startDate,
        endDate: c.endDate,
      },
    }));

    const totalStudents = enrollmentCounts.reduce((sum, e) => sum + e._count._all, 0);
    const avgRating = reviewStats._avg.rating;

    return {
      id: center.id,
      name: center.name,
      shortId: center.shortId,
      description: center.description,
      subjects: center.subjects,
      address: center.address,
      phone: center.phone,
      whatsapp: center.whatsapp,
      email: center.email,
      logoUrl: center.logoUrl,
      rating: avgRating ? Math.round(avgRating * 10) / 10 : 0,
      reviewCount: reviewStats._count._all,
      courses: enrichedCourses,
      totalCourses: enrichedCourses.length,
      totalStudents,
    };
  });

  return ok(result);
});
