import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";
import { bandForPercent, percentOf } from "@repo/database/grading-scale";
import {
  getStudentGradeTrend,
} from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("student");

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

    const courses = await tx.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, subject: true },
    });

    const todaySessions = await tx.session.findMany({
      where: {
        courseId: { in: courseIds },
        date: { gte: todayStart, lt: todayEnd },
        status: { in: ["scheduled", "postponed"] },
      },
      orderBy: { startTime: "asc" },
    });

    const upcomingSessions = await tx.session.findMany({
      where: {
        courseId: { in: courseIds },
        date: { gte: todayEnd, lt: weekEnd },
        status: { in: ["scheduled", "postponed"] },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 5,
    });

    const attendanceTotal = await tx.attendanceRecord.count({ where: { studentId: user.id } });
    const attendancePresent = await tx.attendanceRecord.count({
      where: { studentId: user.id, status: "present" },
    });

    const grades = await tx.grade.findMany({
      where: { courseId: { in: courseIds } },
      select: {
        id: true,
        name: true,
        courseId: true,
        date: true,
        maxScore: true,
        scores: { where: { studentId: user.id }, select: { score: true } },
      },
    });

    return { courses, todaySessions, upcomingSessions, attendanceTotal, attendancePresent, grades };
  });

  const { courses, todaySessions, upcomingSessions, grades } = base;
  const courseNameMap = new Map(courses.map((c) => [c.id, c.title]));

  const attendanceRate =
    base.attendanceTotal > 0 ? Math.round((base.attendancePresent / base.attendanceTotal) * 100) : 0;

  // A subject's percentage is المجموع ÷ المجموع الكلي — the marks summed, then
  // divided — NOT the average of each assessment's own percentage. That is how
  // an Egyptian report is computed, and it is the difference between a 50-mark
  // final counting as a final and counting as one quiz.
  //
  // It also removes a discrepancy that was live: this route averaged
  // percentages while the parent's progress screen summed marks, so the same
  // child in the same subject read 75% to themselves and 82% to their parent.
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
      // The BAND ID, not a translated word: this is an API, and the language
      // belongs to whoever renders it.
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

  const gradeTrend = await getStudentGradeTrend(user);

  return ok({
    attendanceRate,
    // `averageGrade` (a US letter) and `gpa` (a 4.0 average of those letters)
    // were removed here, not renamed: nothing an Egyptian family reads is
    // expressed in either, and the GPA was two lossy conversions away from the
    // marks it claimed to summarise. The percentage is the record.
    averagePercent: avgPct,
    averageBand,
    unreadMessages: 0,
    todaySchedule: todaySessions.map((s) => ({
      id: s.id,
      time: s.startTime,
      subject: courseNameMap.get(s.courseId) ?? "",
      room: "",
      teacher: "",
    })),
    upcoming: upcomingSessions.map((s) => ({
      id: s.id,
      time: s.startTime,
      subject: courseNameMap.get(s.courseId) ?? "",
      date: new Date(s.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    })),
    subjectPerformance,
    analytics: {
      gradeTrend: gradeTrend.items,
    },
  });
});
