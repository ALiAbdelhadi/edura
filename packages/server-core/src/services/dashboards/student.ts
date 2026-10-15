import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { bandForPercent, percentOf } from "@repo/database/grading-scale";

type StudentDashboardRaw = {
  courses: { id: string; title: string }[];
  today: { id: string; courseId: string; startTime: string; roomName: string; teacherName: string }[];
  upcoming: { id: string; courseId: string; startTime: string; date: string }[];
  attendanceTotal: number;
  attendancePresent: number;
  grades: { courseId: string; maxScore: number; score: number }[];
  trend: {
    date: string;
    name: string;
    courseId: string;
    maxScore: number;
    score: number;
    courseTitle: string | null;
  }[];
};

export async function getStudentDashboard(user: SessionUser) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const weekEnd = new Date(todayEnd);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const base = await scopedDb(user, async (tx) => {
    const [row] = await tx.$queryRaw<[{ j: StudentDashboardRaw }]>`
      WITH ec AS (
        SELECT course_id FROM enrollments WHERE student_id = ${user.id}::uuid AND status = 'active'
      )
      SELECT json_build_object(
        'courses', coalesce((
          SELECT json_agg(json_build_object('id', c.id, 'title', c.title))
          FROM courses c WHERE c.id IN (SELECT course_id FROM ec)
        ), '[]'::json),
        'today', coalesce((
          SELECT json_agg(json_build_object(
            'id', s.id, 'courseId', s.course_id, 'startTime', s.start_time,
            'roomName', coalesce(r.name, ''), 'teacherName', coalesce(u.name, '')
          ) ORDER BY s.start_time ASC)
          FROM sessions s
          LEFT JOIN rooms r ON r.id = s.room_id
          LEFT JOIN users u ON u.id = s.teacher_id AND u.deleted_at IS NULL
          WHERE s.course_id IN (SELECT course_id FROM ec)
            AND s.date >= ${todayStart} AND s.date < ${todayEnd}
            AND s.status IN ('scheduled', 'postponed')
        ), '[]'::json),
        'upcoming', coalesce((
          SELECT json_agg(json_build_object(
            'id', q.id, 'courseId', q.course_id, 'startTime', q.start_time,
            'date', to_char(q.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ) ORDER BY q.date ASC, q.start_time ASC)
          FROM (
            SELECT s.id, s.course_id, s.start_time, s.date FROM sessions s
            WHERE s.course_id IN (SELECT course_id FROM ec)
              AND s.date >= ${todayEnd} AND s.date < ${weekEnd}
              AND s.status IN ('scheduled', 'postponed')
            ORDER BY s.date ASC, s.start_time ASC
            LIMIT 5
          ) q
        ), '[]'::json),
        'attendanceTotal', (SELECT count(*)::int FROM attendance_records WHERE student_id = ${user.id}::uuid),
        'attendancePresent', (
          SELECT count(*)::int FROM attendance_records
          WHERE student_id = ${user.id}::uuid AND status = 'present'
        ),
        'grades', coalesce((
          SELECT json_agg(json_build_object('courseId', g.course_id, 'maxScore', g.max_score, 'score', gs.score))
          FROM grades g
          JOIN grade_scores gs ON gs.grade_id = g.id AND gs.student_id = ${user.id}::uuid
          WHERE g.course_id IN (SELECT course_id FROM ec)
        ), '[]'::json),
        'trend', coalesce((
          SELECT json_agg(json_build_object(
            'date', to_char(g.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'name', g.name, 'courseId', g.course_id, 'maxScore', g.max_score,
            'score', gs.score, 'courseTitle', c.title
          ) ORDER BY g.date ASC)
          FROM grades g
          JOIN grade_scores gs ON gs.grade_id = g.id AND gs.student_id = ${user.id}::uuid
          LEFT JOIN courses c ON c.id = g.course_id
        ), '[]'::json)
      ) AS j`;
    return row.j;
  });

  const { courses, grades } = base;
  const todaySessions = base.today;
  const upcomingSessions = base.upcoming;
  const gradeTrendItems = base.trend
    .map((grade) => {
      const maxScore = grade.maxScore || 1;
      const date = new Date(grade.date);
      return {
        date: date.toISOString(),
        label: date.toLocaleDateString("en", { month: "short", day: "numeric" }),
        assignment: grade.name,
        courseId: grade.courseId,
        courseTitle: grade.courseTitle ?? "Unknown",
        percentage: Math.round((grade.score / maxScore) * 100),
      };
    });
  const courseNameMap = new Map(courses.map((c) => [c.id, c.title]));

  const attendanceRate =
    base.attendanceTotal > 0 ? Math.round((base.attendancePresent / base.attendanceTotal) * 100) : 0;

  const subjectPerformance = courses.map((course) => {
    const courseGrades = grades.filter((g) => g.courseId === course.id);
    let totalScore = 0;
    let totalMax = 0;
    for (const g of courseGrades) {
      totalScore += g.score;
      totalMax += g.maxScore;
    }
    const percentage = percentOf(totalScore, totalMax);
    return {
      id: course.id,
      subject: course.title,
      percentage,
      band: bandForPercent(percentage).id,
    };
  });

  const avgPct =
    subjectPerformance.length > 0
      ? Math.round(
          subjectPerformance.reduce((a, b) => a + b.percentage, 0) / subjectPerformance.length,
        )
      : 0;
  const averageBand = bandForPercent(avgPct).id;

  return {
    attendanceRate,
    averagePercent: avgPct,
    averageBand,
    todaySchedule: todaySessions.map((s) => ({
      id: s.id,
      time: s.startTime,
      subject: courseNameMap.get(s.courseId) ?? "",
      room: s.roomName,
      teacher: s.teacherName,
    })),
    upcoming: upcomingSessions.map((s) => ({
      id: s.id,
      time: s.startTime,
      subject: courseNameMap.get(s.courseId) ?? "",
      date: s.date,
    })),
    subjectPerformance,
    analytics: {
      gradeTrend: gradeTrendItems,
    },
  };
}
