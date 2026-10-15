import type { Course } from "@repo/database";
import { platformDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { NotFoundError } from "../../errors/classes";
import { canSeeMeetingLink } from "../discovery/meeting-link";
import { COURSE_COLUMNS } from "./list-courses";

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

type CourseDetailRow = Course & {
  _enrolled: number;
  _teacherName: string | null;
  _centerName: string | null;
  _avgRating: number | null;
  _reviewCount: number;
};

export function getCourseDetail(viewer: SessionUser | null, id: string) {
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<CourseDetailRow[]>`
      SELECT ${COURSE_COLUMNS},
             (SELECT count(*)::int FROM enrollments en
               WHERE en.course_id = c.id AND en.status = 'active') AS "_enrolled",
             (SELECT u.name FROM users u WHERE u.id = c.teacher_id) AS "_teacherName",
             (SELECT ce.name FROM centers ce WHERE ce.id = c.center_id) AS "_centerName",
             (SELECT avg(rv.rating)::float8 FROM reviews rv WHERE rv.teacher_id = c.teacher_id) AS "_avgRating",
             (SELECT count(*)::int FROM reviews rv WHERE rv.teacher_id = c.teacher_id) AS "_reviewCount"
        FROM courses c
       WHERE c.id = ${id}::uuid`;
    if (!row) throw new NotFoundError("Course not found");
    const { _enrolled: enrolledCount, _teacherName, _centerName, _avgRating: avg, _reviewCount, ...course } = row;

    // The meeting link is the thing being paid for: anyone holding it can sit in
    // the online lesson for free. This route is readable without a session, so
    // the link is returned only to the people already PAID into the course —
    // see `canSeeMeetingLink` (SECURITY_AUDIT.md DIFF-02).
    const canSeeLink = await canSeeMeetingLink(tx, course, viewer);

    return {
      ...course,
      onlineUrl: canSeeLink ? course.onlineUrl : null,
      hasOnlineUrl: !!course.onlineUrl,
      schedulePattern: schedulePatternOf(course),
      remainingSeats: course.maxStudents - enrolledCount,
      enrolledCount,
      teacherName: _teacherName ?? "",
      centerName: _centerName ?? "",
      centerId: course.centerId,
      teacherRating: avg ? Math.round(avg * 10) / 10 : 0,
      teacherReviewCount: _reviewCount ?? 0,
    };
  });
}
