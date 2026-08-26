import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";
import { bandForPercent, percentOf } from "@repo/database/grading-scale";
import {
  getStudentGradeTrend,
} from "@/lib/services/reports/reports";
import { enrichSessions } from "@/lib/services/sessions/enrich";

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

    const todaySessions = await enrichSessions(
      tx,
      await tx.session.findMany({
        where: {
          courseId: { in: courseIds },
          date: { gte: todayStart, lt: todayEnd },
          status: { in: ["scheduled", "postponed"] },
        },
        orderBy: { startTime: "asc" },
      }),
    );

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
    // `unreadMessages` WAS HERE, hardcoded to `0`. It was never a count of
    // anything — no messaging read reached this route — so any consumer that
    // trusted it would have shown "no unread messages" to a student with a
    // full inbox. `assignmentsDue` / `dueSoon` / `assignmentsTrend` stood
    // beside it, derived from scoreless grade rows against an Assignment model
    // that does not exist; they came out with the student IA restructure.
    //
    // Verified zero consumers across the repo before removal — no component, no
    // emulator screen, no test, no contract. A field nothing reads and nothing
    // could answer correctly is worse than a missing one: it is the shape of an
    // answer, and the next person to need an unread count will find it already
    // there and wire a badge to a lie. (STUDENT_IA_AUDIT.md §5.1 finding 1.)
    //
    // A REAL count needs a messaging read with its own tenancy rules; that is
    // the same still-open gap the student and parent audits both record, and it
    // is deliberately not faked here in the meantime.
    // `room` and `teacher` were `""` BY CONSTRUCTION here — the two survivors
    // of the fabricated-fields cleanup above, sitting four lines under the
    // comment explaining why their siblings were removed. Now served through
    // `enrichSessions`, the same joins the sessions route makes — one shape,
    // and an empty room stays honestly `""` (a session with no hall).
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
      // ISO, NOT a formatted string. This used to be
      // `toLocaleDateString("en", …)`, so the server picked English for every
      // reader and the Arabic dashboard printed "Aug 17" beside Arabic prose.
      // The server does not know who is reading; the client does, and every
      // other screen in the portal formats through `useFormatters`.
      // Sole consumer: features/student/student-dashboard.tsx.
      date: s.date instanceof Date ? s.date.toISOString() : s.date,
    })),
    subjectPerformance,
    analytics: {
      gradeTrend: gradeTrend.items,
    },
  });
});
