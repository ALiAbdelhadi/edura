import { platformDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { NotFoundError } from "../../errors/classes";
import { canSeeMeetingLink } from "../discovery/meeting-link";

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

export function getCourseDetail(viewer: SessionUser | null, id: string) {
  return platformDb(async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");

    // The meeting link is the thing being paid for: anyone holding it can sit in
    // the online lesson for free. This route is readable without a session, so
    // the link is returned only to the people already PAID into the course —
    // see `canSeeMeetingLink` (SECURITY_AUDIT.md DIFF-02).
    const canSeeLink = await canSeeMeetingLink(tx, course, viewer);

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
      onlineUrl: canSeeLink ? course.onlineUrl : null,
      hasOnlineUrl: !!course.onlineUrl,
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
}
