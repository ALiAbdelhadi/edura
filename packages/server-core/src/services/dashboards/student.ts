import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { bandForPercent, percentOf } from "@repo/database/grading-scale";
import { studentGradeTrendTx } from "../reports/reports";
import { enrichSessions } from "../sessions/enrich";

export async function getStudentDashboard(user: SessionUser) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const weekEnd = new Date(todayEnd);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const base = await scopedDb(user, async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: { studentId: user.id, status: "active" },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);

    const [courses, todayRows, upcomingSessions, attendanceByStatus, grades, gradeTrend] =
      await Promise.all([
        tx.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true, subject: true },
        }),
        tx.session.findMany({
          where: {
            courseId: { in: courseIds },
            date: { gte: todayStart, lt: todayEnd },
            status: { in: ["scheduled", "postponed"] },
          },
          orderBy: { startTime: "asc" },
        }),
        tx.session.findMany({
          where: {
            courseId: { in: courseIds },
            date: { gte: todayEnd, lt: weekEnd },
            status: { in: ["scheduled", "postponed"] },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 5,
        }),
        tx.attendanceRecord.groupBy({
          by: ["status"],
          where: { studentId: user.id },
          _count: true,
        }),
        tx.grade.findMany({
          where: { courseId: { in: courseIds } },
          select: {
            id: true,
            name: true,
            courseId: true,
            date: true,
            maxScore: true,
            scores: { where: { studentId: user.id }, select: { score: true } },
          },
        }),
        studentGradeTrendTx(tx, user.id),
      ]);

    const todaySessions = await enrichSessions(tx, todayRows);
    const attendanceTotal = attendanceByStatus.reduce((sum, row) => sum + row._count, 0);
    const attendancePresent =
      attendanceByStatus.find((row) => row.status === "present")?._count ?? 0;

    return {
      courses,
      todaySessions,
      upcomingSessions,
      attendanceTotal,
      attendancePresent,
      grades,
      gradeTrend,
    };
  });

  const { courses, todaySessions, upcomingSessions, grades, gradeTrend } = base;
  const courseNameMap = new Map(courses.map((c) => [c.id, c.title]));

  const attendanceRate =
    base.attendanceTotal > 0 ? Math.round((base.attendancePresent / base.attendanceTotal) * 100) : 0;

  const subjectPerformance = courses.map((course) => {
    const courseGrades = grades.filter((g) => g.courseId === course.id);
    let totalScore = 0;
    let totalMax = 0;
    for (const g of courseGrades) {
      const myScore = g.scores[0];
      if (myScore !== undefined) {
        totalScore += myScore.score;
        totalMax += g.maxScore;
      }
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
      date: s.date instanceof Date ? s.date.toISOString() : s.date,
    })),
    subjectPerformance,
    analytics: {
      gradeTrend: gradeTrend.items,
    },
  };
}
