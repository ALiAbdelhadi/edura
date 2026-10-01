import { PaymentStatus } from "@repo/database";
import { scopedDb, platformDb, type TenantTx } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { dayRange, platformTodayWindow } from "../../lib/day-range";
import {
  endOfPlatformDay,
  platformDayKey,
  shiftDayKey,
  startOfPlatformDay,
  todayKey,
} from "../../lib/date-key";
import type {
  AnalyticsGranularity,
  AttendanceByCoursePoint,
  CourseFillRatePoint,
  EnrollmentFunnelPoint,
  ParentPaymentTrendPoint,
  ParentSubjectComparisonPoint,
  RevenueTimeseriesPoint,
  SessionStatusPoint,
  StudentGradeTrendPoint,
  TeacherAttendanceTrendPoint,
  TeacherGradeLoadPoint,
  TeacherScoreDistributionPoint,
} from "../../analytics/contracts";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

const dateFilter = dayRange;

function isUsableDay(value?: string): boolean {
  return !!value && (/^\d{4}-\d{2}-\d{2}$/.test(value) || isValidDate(new Date(value)));
}

function parseRange(from?: string, to?: string, granularity: AnalyticsGranularity = "month") {
  const toKey = isUsableDay(to) ? platformDayKey(to as string) : todayKey();
  let fromKey: string;
  if (isUsableDay(from)) {
    fromKey = platformDayKey(from as string);
  } else if (granularity === "week") {
    fromKey = shiftDayKey(toKey, -(7 * 8) + 1);
  } else {
    let year = Number(toKey.slice(0, 4));
    let month = Number(toKey.slice(5, 7)) - 5;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
  }
  return { fromDate: startOfPlatformDay(fromKey), toDate: endOfPlatformDay(toKey) };
}

function isoWeekKeyOfDay(key: string): string {
  const temp = new Date(
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))),
  );
  const day = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((temp.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getPeriodKey(date: Date, granularity: AnalyticsGranularity): string {
  const key = todayKey(date);
  if (granularity === "week") return isoWeekKeyOfDay(key);
  return key.slice(0, 7);
}

function formatPeriodLabel(period: string, granularity: AnalyticsGranularity): string {
  if (granularity === "week") {
    const [year, week] = period.split("-W");
    return `W${week} ${year}`;
  }
  const [year, month] = period.split("-");
  const monthLabel = MONTH_NAMES[Number(month) - 1] ?? month;
  return `${monthLabel} ${year.slice(2)}`;
}

function buildPeriodKeys(fromDate: Date, toDate: Date, granularity: AnalyticsGranularity): string[] {
  const fromKey = todayKey(fromDate);
  const toKey = todayKey(toDate);
  const keys: string[] = [];

  if (granularity === "week") {
    const cursor = new Date(
      Date.UTC(
        Number(fromKey.slice(0, 4)),
        Number(fromKey.slice(5, 7)) - 1,
        Number(fromKey.slice(8, 10)),
      ),
    );
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() || 7) - 1));
    while (cursor.toISOString().slice(0, 10) <= toKey) {
      keys.push(isoWeekKeyOfDay(cursor.toISOString().slice(0, 10)));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return keys;
  }

  let year = Number(fromKey.slice(0, 4));
  let month = Number(fromKey.slice(5, 7));
  const endYear = Number(toKey.slice(0, 4));
  const endMonth = Number(toKey.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function percentage(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function paymentWhereBase(centerId: string) {
  return {
    centerId,
    status: { notIn: [PaymentStatus.failed, PaymentStatus.pending] },
  };
}

export type ProvenanceFilter = {
  systemStatus?: "enrolled" | "external" | null;
  dataSource?: "system" | "manual" | null;
};

function isUnfiltered(f?: ProvenanceFilter): boolean {
  return !f || (!f.systemStatus && !f.dataSource);
}

async function resolveProvenance(
  tx: TenantTx,
  centerId: string,
  f?: ProvenanceFilter,
): Promise<{ dataSource?: "system" | "manual"; courseIds: string[] | null }> {
  if (isUnfiltered(f)) return { courseIds: null };

  let courseIds: string[] | null = null;
  if (f?.systemStatus) {
    const profiles = await tx.teacherProfile.findMany({
      where: { systemStatus: f.systemStatus },
      select: { userId: true },
    });
    const teacherIds = profiles.map((p) => p.userId);
    const courses = teacherIds.length
      ? await tx.course.findMany({
          where: { centerId, teacherId: { in: teacherIds } },
          select: { id: true },
        })
      : [];
    courseIds = courses.map((c) => c.id);
  }

  return { ...(f?.dataSource ? { dataSource: f.dataSource } : {}), courseIds };
}

function courseNarrow(courseIds: string[] | null) {
  return courseIds === null ? {} : { courseId: { in: courseIds } };
}

export async function getRevenueReport(
  user: SessionUser,
  from?: string,
  to?: string,
  provenance?: ProvenanceFilter,
) {
  const centerId = user.centerId as string;
  const df = dateFilter(from, to);

  const agg = await scopedDb(user, async (tx) => {
    const { dataSource, courseIds } = await resolveProvenance(tx, centerId, provenance);
    return tx.payment.aggregate({
      where: {
        ...paymentWhereBase(centerId),
        ...(df ? { paidAt: df } : {}),
        ...(dataSource ? { dataSource } : {}),
        ...courseNarrow(courseIds),
      },
      _sum: { amount: true },
      _count: true,
    });
  });

  return { total: agg._sum.amount ?? 0, count: agg._count ?? 0, from, to };
}

export async function getExpensesReport(user: SessionUser, from?: string, to?: string) {
  const centerId = user.centerId as string;
  const df = dateFilter(from, to);

  const rows = await scopedDb(user, (tx) =>
    tx.expense.groupBy({
      by: ["category"],
      where: { centerId, ...(df ? { expenseDate: df } : {}) },
      _sum: { amount: true },
      _count: true,
    }),
  );

  const byCategory = rows.map((r) => ({
    category: r.category,
    subtotal: r._sum.amount ?? 0,
    count: r._count,
  }));
  const total = byCategory.reduce((sum, r) => sum + r.subtotal, 0);
  return { total, byCategory, from, to };
}

export async function getRevenueTimeseries(
  user: SessionUser,
  from?: string,
  to?: string,
  granularity: AnalyticsGranularity = "month",
  provenance?: ProvenanceFilter,
) {
  const centerId = user.centerId as string;
  const { fromDate, toDate } = parseRange(from, to, granularity);
  const periodKeys = buildPeriodKeys(fromDate, toDate, granularity);
  const index = new Map<string, RevenueTimeseriesPoint>(
    periodKeys.map((period) => [
      period,
      { period, label: formatPeriodLabel(period, granularity), revenue: 0, expenses: 0, netProfit: 0 },
    ]),
  );

  const { payments, expenses } = await scopedDb(user, async (tx) => {
    const { dataSource, courseIds } = await resolveProvenance(tx, centerId, provenance);
    const payments = await tx.payment.findMany({
      where: {
        ...paymentWhereBase(centerId),
        paidAt: { gte: fromDate, lte: toDate },
        ...(dataSource ? { dataSource } : {}),
        ...courseNarrow(courseIds),
      },
      select: { amount: true, paidAt: true },
    });
    const expenses = await tx.expense.findMany({
      where: { centerId, expenseDate: { gte: fromDate, lte: toDate } },
      select: { amount: true, expenseDate: true },
    });
    return { payments, expenses };
  });

  for (const row of payments) {
    const period = getPeriodKey(new Date(row.paidAt), granularity);
    const entry = index.get(period);
    if (entry) entry.revenue += row.amount ?? 0;
  }
  for (const row of expenses) {
    const period = getPeriodKey(new Date(row.expenseDate), granularity);
    const entry = index.get(period);
    if (entry) entry.expenses += row.amount ?? 0;
  }

  const series = periodKeys.map((period) => {
    const entry = index.get(period)!;
    entry.netProfit = entry.revenue - entry.expenses;
    return entry;
  });

  return { from, to, granularity, series };
}

export async function getExpensesTimeseries(
  user: SessionUser,
  from?: string,
  to?: string,
  granularity: AnalyticsGranularity = "month",
) {
  const centerId = user.centerId as string;
  const { fromDate, toDate } = parseRange(from, to, granularity);
  const periodKeys = buildPeriodKeys(fromDate, toDate, granularity);
  const totals = new Map<string, number>(periodKeys.map((p) => [p, 0]));

  const { rows, byCategoryRaw } = await scopedDb(user, async (tx) => {
    const rows = await tx.expense.findMany({
      where: { centerId, expenseDate: { gte: fromDate, lte: toDate } },
      select: { amount: true, expenseDate: true },
    });
    const byCategoryRaw = await tx.expense.groupBy({
      by: ["category"],
      where: { centerId, expenseDate: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
    });
    return { rows, byCategoryRaw };
  });

  for (const row of rows) {
    const period = getPeriodKey(new Date(row.expenseDate), granularity);
    totals.set(period, (totals.get(period) ?? 0) + (row.amount ?? 0));
  }

  const byCategory = byCategoryRaw.map((r) => ({
    category: r.category,
    subtotal: r._sum.amount ?? 0,
    count: r._count,
  }));

  return {
    from,
    to,
    granularity,
    series: periodKeys.map((period) => ({
      period,
      label: formatPeriodLabel(period, granularity),
      total: totals.get(period) ?? 0,
    })),
    byCategory,
  };
}

export async function getCourseFillRates(
  user: SessionUser,
  provenance?: ProvenanceFilter,
) {
  const centerId = user.centerId as string;

  return scopedDb(user, async (tx) => {
    const { dataSource, courseIds: scopeIds } = await resolveProvenance(
      tx,
      centerId,
      provenance,
    );
    const courses = await tx.course.findMany({
      where: {
        centerId,
        status: "active",
        ...(dataSource ? { dataSource } : {}),
        ...(scopeIds === null ? {} : { id: { in: scopeIds } }),
      },
      select: { id: true, title: true, maxStudents: true },
    });
    if (courses.length === 0) return { items: [] as CourseFillRatePoint[] };

    const courseIds = courses.map((course) => course.id);
    const enrollments = await tx.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "active" },
      _count: true,
    });
    const enrollmentByCourse = new Map(enrollments.map((row) => [row.courseId, row._count]));
    const items = courses
      .map((course) => {
        const enrolled = enrollmentByCourse.get(course.id) ?? 0;
        const maxStudents = course.maxStudents ?? 0;
        return {
          courseId: course.id,
          title: course.title,
          enrolled,
          maxStudents,
          fillRatePct: percentage(enrolled, maxStudents),
        };
      })
      .sort((a, b) => b.fillRatePct - a.fillRatePct || b.enrolled - a.enrolled);

    return { items };
  });
}

export async function getAttendanceByCourse(
  user: SessionUser,
  from?: string,
  to?: string,
  provenance?: ProvenanceFilter,
) {
  const centerId = user.centerId as string;
  const df = dateFilter(from, to);

  return scopedDb(user, async (tx) => {
    const { dataSource, courseIds: scopeIds } = await resolveProvenance(
      tx,
      centerId,
      provenance,
    );
    const rows = await tx.attendanceRecord.groupBy({
      by: ["courseId", "status"],
      where: {
        centerId,
        ...(df ? { session: { date: df } } : {}),
        ...(dataSource ? { dataSource } : {}),
        ...courseNarrow(scopeIds),
      },
      _count: true,
    });

    const byCourse = new Map<string, { present: number; absent: number; excused: number }>();
    for (const row of rows) {
      const entry = byCourse.get(row.courseId) ?? { present: 0, absent: 0, excused: 0 };
      if (row.status === "present") entry.present += row._count;
      else if (row.status === "absent") entry.absent += row._count;
      else if (row.status === "excused") entry.excused += row._count;
      byCourse.set(row.courseId, entry);
    }

    const courseIds = [...byCourse.keys()];
    const courses =
      courseIds.length > 0
        ? await tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [];
    const titleById = new Map(courses.map((course) => [course.id, course.title]));

    const items: AttendanceByCoursePoint[] = [...byCourse.entries()]
      .map(([courseId, counts]) => {
        const total = counts.present + counts.absent + counts.excused;
        return {
          courseId,
          title: titleById.get(courseId) ?? "Unknown course",
          present: counts.present,
          absent: counts.absent,
          excused: counts.excused,
          total,
          attendanceRatePct: percentage(counts.present, total),
        };
      })
      .sort((a, b) => b.total - a.total);

    return { from, to, items };
  });
}

export async function getEnrollmentFunnel(user: SessionUser, from?: string, to?: string) {
  const centerId = user.centerId as string;
  const df = dateFilter(from, to);

  return scopedDb(user, async (tx) => {
    const rows = await tx.enrollmentRequest.groupBy({
      by: ["status"],
      where: { centerId, ...(df ? { submittedAt: df } : {}) },
      _count: true,
    });
    const counts = new Map(rows.map((row) => [row.status, row._count]));
    const items: EnrollmentFunnelPoint[] = ["pending", "approved", "declined", "expired"].map((status) => ({
      status: status as EnrollmentFunnelPoint["status"],
      count: counts.get(status as EnrollmentFunnelPoint["status"]) ?? 0,
    }));
    return { from, to, items };
  });
}

export async function getSessionStatusMix(user: SessionUser, from?: string, to?: string) {
  const centerId = user.centerId as string;
  const df = dateFilter(from, to);

  return scopedDb(user, async (tx) => {
    const rows = await tx.session.groupBy({
      by: ["status"],
      where: { course: { centerId }, ...(df ? { date: df } : {}) },
      _count: true,
    });
    const counts = new Map(rows.map((row) => [row.status, row._count]));
    const items: SessionStatusPoint[] = ["scheduled", "completed", "cancelled", "postponed"].map((status) => ({
      status: status as SessionStatusPoint["status"],
      count: counts.get(status as SessionStatusPoint["status"]) ?? 0,
    }));
    return { from, to, items };
  });
}

export async function getTeacherAttendanceTrend(
  user: SessionUser,
  from?: string,
  to?: string,
  granularity: AnalyticsGranularity = "week",
) {
  const teacherId = user.id;
  const { fromDate, toDate } = parseRange(from, to, granularity);
  const periodKeys = buildPeriodKeys(fromDate, toDate, granularity);

  return scopedDb(user, async (tx) => {
    const activeCourses = await tx.course.findMany({
      where: { teacherId, status: "active" },
      select: { id: true },
    });
    const activeCourseIds = activeCourses.map((course) => course.id);
    if (activeCourseIds.length === 0) {
      return { from, to, granularity, series: [] as TeacherAttendanceTrendPoint[] };
    }

    const records = await tx.attendanceRecord.findMany({
      where: {
        courseId: { in: activeCourseIds },
        session: { date: { gte: fromDate, lte: toDate } },
      },
      select: { status: true, session: { select: { date: true } } },
    });

    const periodCounters = new Map<string, { present: number; total: number }>(
      periodKeys.map((period) => [period, { present: 0, total: 0 }]),
    );
    for (const record of records) {
      const period = getPeriodKey(new Date(record.session.date), granularity);
      const counter = periodCounters.get(period);
      if (!counter) continue;
      counter.total += 1;
      if (record.status === "present") counter.present += 1;
    }

    const series: TeacherAttendanceTrendPoint[] = periodKeys.map((period) => {
      const counter = periodCounters.get(period) ?? { present: 0, total: 0 };
      return {
        period,
        label: formatPeriodLabel(period, granularity),
        attendanceRatePct: percentage(counter.present, counter.total),
        totalRecords: counter.total,
      };
    });
    return { from, to, granularity, series };
  });
}

export async function getTeacherGradeLoad(user: SessionUser) {
  const teacherId = user.id;

  return scopedDb(user, async (tx) => {
    const courses = await tx.course.findMany({
      where: { teacherId, status: "active" },
      select: { id: true, title: true },
    });
    if (courses.length === 0) return { items: [] as TeacherGradeLoadPoint[] };
    const courseIds = courses.map((course) => course.id);

    const grades = await tx.grade.findMany({
      where: { teacherId, courseId: { in: courseIds } },
      select: { courseId: true, _count: { select: { scores: true } } },
    });
    const byCourse = new Map<string, { pending: number; graded: number }>();
    for (const grade of grades) {
      const entry = byCourse.get(grade.courseId) ?? { pending: 0, graded: 0 };
      if (grade._count.scores > 0) entry.graded += 1;
      else entry.pending += 1;
      byCourse.set(grade.courseId, entry);
    }

    const items: TeacherGradeLoadPoint[] = courses
      .map((course) => {
        const row = byCourse.get(course.id) ?? { pending: 0, graded: 0 };
        return {
          courseId: course.id,
          title: course.title,
          pending: row.pending,
          graded: row.graded,
          completionPct: percentage(row.graded, row.pending + row.graded),
        };
      })
      .sort((a, b) => b.pending - a.pending || a.title.localeCompare(b.title));

    return { items };
  });
}

export async function getTeacherScoreDistribution(user: SessionUser, courseId?: string) {
  const teacherId = user.id;

  return scopedDb(user, async (tx) => {
    const grades = await tx.grade.findMany({
      where: { teacherId, ...(courseId ? { courseId } : {}) },
      select: { maxScore: true, scores: { select: { score: true } } },
    });
    const buckets: Record<string, number> = {
      "0-49": 0,
      "50-59": 0,
      "60-69": 0,
      "70-79": 0,
      "80-89": 0,
      "90-100": 0,
    };
    for (const grade of grades) {
      const maxScore = grade.maxScore || 1;
      for (const row of grade.scores ?? []) {
        const pct = Math.round((row.score / maxScore) * 100);
        if (pct < 50) buckets["0-49"] += 1;
        else if (pct < 60) buckets["50-59"] += 1;
        else if (pct < 70) buckets["60-69"] += 1;
        else if (pct < 80) buckets["70-79"] += 1;
        else if (pct < 90) buckets["80-89"] += 1;
        else buckets["90-100"] += 1;
      }
    }
    const items: TeacherScoreDistributionPoint[] = Object.entries(buckets).map(([bucket, count]) => ({
      bucket,
      count,
    }));
    return { items };
  });
}

export async function getStudentGradeTrend(user: SessionUser, from?: string, to?: string) {
  return scopedDb(user, (tx) => studentGradeTrendTx(tx, user.id, from, to));
}

export async function studentGradeTrendTx(
  tx: TenantTx,
  studentId: string,
  from?: string,
  to?: string,
) {
  const df = dateFilter(from, to);
  const grades = await tx.grade.findMany({
    where: { scores: { some: { studentId } }, ...(df ? { date: df } : {}) },
    orderBy: { date: "asc" },
    select: {
      courseId: true,
      name: true,
      maxScore: true,
      date: true,
      scores: { where: { studentId }, select: { score: true } },
    },
  });
  const courseIds = [...new Set(grades.map((grade) => grade.courseId))];
  const courses =
    courseIds.length > 0
      ? await tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
      : [];
  const courseTitleById = new Map(courses.map((course) => [course.id, course.title]));
  const items: StudentGradeTrendPoint[] = grades
    .map((grade) => {
      const score = grade.scores[0];
      if (!score) return null;
      const maxScore = grade.maxScore || 1;
      const percentageValue = Math.round((score.score / maxScore) * 100);
      const dateLabel = new Date(grade.date).toLocaleDateString("en", { month: "short", day: "numeric" });
      return {
        date: new Date(grade.date).toISOString(),
        label: dateLabel,
        assignment: grade.name,
        courseId: grade.courseId,
        courseTitle: courseTitleById.get(grade.courseId) ?? "Unknown",
        percentage: percentageValue,
      };
    })
    .filter((item): item is StudentGradeTrendPoint => Boolean(item));

  return { from, to, items };
}


export async function getParentPaymentTrend(
  studentId: string,
  from?: string,
  to?: string,
  granularity: AnalyticsGranularity = "month",
) {
  const { fromDate, toDate } = parseRange(from, to, granularity);
  const periodKeys = buildPeriodKeys(fromDate, toDate, granularity);

  const rows = await platformDb((tx) =>
    tx.payment.findMany({
      where: {
        studentId,
        paidAt: { gte: fromDate, lte: toDate },
        status: { notIn: ["failed", "pending"] },
      },
      select: { amount: true, paidAt: true },
    }),
  );

  const index = new Map<string, ParentPaymentTrendPoint>(
    periodKeys.map((period) => [
      period,
      {
        period,
        label: formatPeriodLabel(period, granularity),
        paid: 0,
        refunded: 0,
        net: 0,
      },
    ]),
  );
  for (const row of rows) {
    const period = getPeriodKey(new Date(row.paidAt), granularity);
    const entry = index.get(period);
    if (!entry) continue;
    if ((row.amount ?? 0) >= 0) entry.paid += row.amount;
    else entry.refunded += Math.abs(row.amount ?? 0);
  }
  const series = periodKeys.map((period) => {
    const entry = index.get(period)!;
    entry.net = entry.paid - entry.refunded;
    return entry;
  });
  return { from, to, granularity, series };
}

export async function getParentSubjectComparison(studentId: string) {
  const { grades, courses } = await platformDb(async (tx) => {
    const grades = await tx.grade.findMany({
      where: { scores: { some: { studentId } } },
      select: {
        courseId: true,
        maxScore: true,
        scores: { where: { studentId }, select: { score: true } },
      },
    });
    const courseIds = [...new Set(grades.map((grade) => grade.courseId))];
    const courses =
      courseIds.length > 0
        ? await tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [];
    return { grades, courses };
  });

  const titleByCourse = new Map(courses.map((course) => [course.id, course.title]));
  const totals = new Map<string, { score: number; max: number }>();
  for (const grade of grades) {
    const studentScore = grade.scores[0];
    if (!studentScore) continue;
    const key = grade.courseId;
    const existing = totals.get(key) ?? { score: 0, max: 0 };
    existing.score += studentScore.score;
    existing.max += grade.maxScore;
    totals.set(key, existing);
  }
  const items: ParentSubjectComparisonPoint[] = Array.from(totals.entries())
    .map(([courseId, total]) => ({
      courseId,
      courseTitle: titleByCourse.get(courseId) ?? "Unknown",
      averagePct: percentage(total.score, total.max),
    }))
    .sort((a, b) => b.averagePct - a.averagePct);
  return { items };
}

export async function getNetProfitReport(user: SessionUser, from?: string, to?: string) {
  const centerId = user.centerId as string;
  const df = dateFilter(from, to);

  const [revenue, expenses, trend, revenueByCourseRaw, fillRates, attendanceByCourse, enrollmentFunnel, sessionStatus] =
    await Promise.all([
      getRevenueReport(user, from, to),
      getExpensesReport(user, from, to),
      getRevenueTimeseries(user, from, to, "month"),
      scopedDb(user, (tx) =>
        tx.payment.groupBy({
          by: ["courseId"],
          where: { ...paymentWhereBase(centerId), ...(df ? { paidAt: df } : {}) },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
        }),
      ),
      getCourseFillRates(user),
      getAttendanceByCourse(user, from, to),
      getEnrollmentFunnel(user, from, to),
      getSessionStatusMix(user, from, to),
    ]);

  const courseIds = revenueByCourseRaw
    .map((row) => row.courseId)
    .filter((id): id is string => Boolean(id));
  const courses =
    courseIds.length > 0
      ? await scopedDb(user, (tx) =>
          tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
        )
      : [];
  const courseTitleMap = new Map(courses.map((course) => [course.id, course.title]));
  const revenueTotal = revenue.total || 1;
  const byCourse = revenueByCourseRaw.map((row) => {
    const revenueValue = row._sum.amount ?? 0;
    return {
      title: (row.courseId ? courseTitleMap.get(row.courseId) : undefined) ?? "Unknown",
      revenue: revenueValue,
      pct: percentage(revenueValue, revenueTotal),
    };
  });
  const monthly = trend.series.map((row) => ({
    month: row.label,
    revenue: row.revenue,
    expenses: row.expenses,
  }));
  const enrollmentRates = fillRates.items.map((row) => ({
    title: row.title,
    enrolled: row.enrolled,
    max: row.maxStudents,
    pct: row.fillRatePct,
  }));

  const attendanceTotals = attendanceByCourse.items.reduce(
    (acc, row) => {
      acc.present += row.present;
      acc.total += row.total;
      return acc;
    },
    { present: 0, total: 0 },
  );
  const attendanceRate = percentage(attendanceTotals.present, attendanceTotals.total);

  return {
    revenue: revenue.total,
    expenses: expenses.total,
    netProfit: revenue.total - expenses.total,
    from,
    to,
    monthly,
    byCourse,
    enrollmentRates,
    attendanceRate,
    enrollmentFunnel: enrollmentFunnel.items,
    sessionStatusMix: sessionStatus.items,
    attendanceByCourse: attendanceByCourse.items,
  };
}

export async function getAdminDashboard(
  user: SessionUser,
  provenance?: ProvenanceFilter,
  period?: { from?: string; to?: string },
) {
  const centerId = user.centerId as string;

  const money = dayRange(period?.from, period?.to);
  const periodFrom = period?.from ?? null;
  const periodTo = period?.to ?? null;

  const { gte: todayStart, lt: todayEnd } = platformTodayWindow();

  const [base, feeDefaulters, trend, sessionStatusMix, attendanceByCourse, courseFillRates, enrollmentFunnel] =
    await Promise.all([
      scopedDb(user, async (tx) => {
        const { dataSource, courseIds } = await resolveProvenance(tx, centerId, provenance);
        const courseScope = courseNarrow(courseIds);

        const totalStudents = await tx.enrollment.count({
          where: { centerId, status: "active", ...courseScope, ...(dataSource ? { dataSource } : {}) },
        });
        const teacherGroups = await tx.course.groupBy({
          by: ["teacherId"],
          where: {
            centerId,
            status: "active",
            ...(dataSource ? { dataSource } : {}),
            ...(courseIds === null ? {} : { id: { in: courseIds } }),
          },
        });
        const totalCourses = await tx.course.count({
          where: {
            centerId,
            status: "active",
            ...(dataSource ? { dataSource } : {}),
            ...(courseIds === null ? {} : { id: { in: courseIds } }),
          },
        });
        const todaySessionCount = await tx.session.count({
          where: {
            date: { gte: todayStart, lt: todayEnd },
            course: { centerId },
            ...courseScope,
            ...(dataSource ? { dataSource } : {}),
          },
        });
        const revenueAgg = await tx.payment.aggregate({
          where: {
            ...paymentWhereBase(centerId),
            ...courseScope,
            ...(dataSource ? { dataSource } : {}),
            ...(money ? { paidAt: money } : {}),
          },
          _sum: { amount: true },
        });
        const expenseAgg = await tx.expense.aggregate({
          where: { centerId, ...(money ? { expenseDate: money } : {}) },
          _sum: { amount: true },
        });
        const pendingEnrollmentRequests = await tx.enrollmentRequest.count({
          where: { centerId, status: "pending", ...courseScope },
        });
        const attendanceWhen = money ? { session: { date: money } } : {};
        const attendanceByStatus = await tx.attendanceRecord.groupBy({
          by: ["status"],
          where: { centerId, ...courseScope, ...(dataSource ? { dataSource } : {}), ...attendanceWhen },
          _count: true,
        });
        const attendanceTotal = attendanceByStatus.reduce((sum, row) => sum + row._count, 0);
        const attendancePresent =
          attendanceByStatus.find((row) => row.status === "present")?._count ?? 0;

        const externalProfiles = await tx.teacherProfile.findMany({
          where: { managedByCenterId: centerId, systemStatus: "external" },
          select: { userId: true },
        });
        const externalTeacherIds = externalProfiles.map((p) => p.userId);
        const externalCourses = externalTeacherIds.length
          ? await tx.course.findMany({
              where: { centerId, teacherId: { in: externalTeacherIds }, status: "active" },
              select: { id: true },
            })
          : [];
        const externalCourseIds = externalCourses.map((c) => c.id);
        const externalRevenue = externalCourseIds.length
          ? await tx.payment.aggregate({
              where: {
                ...paymentWhereBase(centerId),
                courseId: { in: externalCourseIds },
                ...(money ? { paidAt: money } : {}),
              },
              _sum: { amount: true },
            })
          : null;
        const externalStudents = externalCourseIds.length
          ? await tx.enrollment.count({
              where: { centerId, status: "active", courseId: { in: externalCourseIds } },
            })
          : 0;

        return {
          totalStudents,
          totalTeachers: teacherGroups.length,
          totalCourses,
          todaySessionCount,
          revenue: revenueAgg._sum.amount ?? 0,
          expenses: expenseAgg._sum.amount ?? 0,
          pendingEnrollmentRequests,
          attendanceTotal,
          attendancePresent,
          external: {
            teachers: externalTeacherIds.length,
            courses: externalCourseIds.length,
            students: externalStudents,
            revenue: externalRevenue?._sum.amount ?? 0,
          },
        };
      }),
      countFeeDefaulters(user),
      getRevenueTimeseries(user, periodFrom ?? undefined, periodTo ?? undefined, "month", provenance),
      getSessionStatusMix(user, periodFrom ?? undefined, periodTo ?? undefined),
      getAttendanceByCourse(user, periodFrom ?? undefined, periodTo ?? undefined, provenance),
      getCourseFillRates(user, provenance),
      getEnrollmentFunnel(user, periodFrom ?? undefined, periodTo ?? undefined),
    ]);

  const attendanceRate = percentage(base.attendancePresent, base.attendanceTotal);

  return {
    period: { from: periodFrom, to: periodTo },
    totals: {
      students: base.totalStudents,
      teachers: base.totalTeachers,
      activeCourses: base.totalCourses,
      revenue: base.revenue,
      expenses: base.expenses,
      netProfit: base.revenue - base.expenses,
    },
    todaySessionCount: base.todaySessionCount,
    attendanceRate,
    feeDefaulters,
    pendingEnrollmentRequests: base.pendingEnrollmentRequests,
    external: base.external,
    analytics: {
      revenueVsExpenses: trend.series,
      sessionStatusMix: sessionStatusMix.items,
      attendanceByCourse: attendanceByCourse.items.slice(0, 8),
      courseFillRates: courseFillRates.items.slice(0, 8),
      enrollmentFunnel: enrollmentFunnel.items,
    },
  };
}

async function countFeeDefaulters(user: SessionUser): Promise<number> {
  const centerId = user.centerId as string;

  return scopedDb(user, async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: { centerId, status: "active" },
      select: { studentId: true, course: { select: { price: true } } },
    });
    if (enrollments.length === 0) return 0;

    const owedByStudent = new Map<string, number>();
    for (const enrollment of enrollments) {
      const prev = owedByStudent.get(enrollment.studentId) ?? 0;
      owedByStudent.set(enrollment.studentId, prev + (enrollment.course?.price ?? 0));
    }

    const studentIds = [...owedByStudent.keys()];
    const paidPerStudent = await tx.payment.groupBy({
      by: ["studentId"],
      where: { ...paymentWhereBase(centerId), studentId: { in: studentIds } },
      _sum: { amount: true },
    });
    const paidMap = new Map(paidPerStudent.map((row) => [row.studentId, row._sum.amount ?? 0]));

    let count = 0;
    for (const [studentId, owed] of owedByStudent) {
      const paid = paidMap.get(studentId) ?? 0;
      if (owed - paid > 0) count += 1;
    }
    return count;
  });
}

export async function getTeacherDashboard(
  user: SessionUser,
  period?: { from?: string; to?: string },
) {
  const teacherId = user.id;

  const { gte: todayStart, lt: todayEnd } = platformTodayWindow();

  const when = dayRange(period?.from, period?.to);

  const base = await scopedDb(user, async (tx) => {
    const activeCourses = await tx.course.findMany({
      where: { teacherId, status: "active" },
      select: { id: true, title: true, maxStudents: true, subject: true, gradeTag: true, defaultRoomId: true },
    });
    const activeCourseIds = activeCourses.map((course) => course.id);

    const activeStudents = await tx.enrollment.count({
      where: { courseId: { in: activeCourseIds }, status: "active" },
    });
    const todaySessions = await tx.session.findMany({
      where: {
        teacherId,
        date: { gte: todayStart, lt: todayEnd },
        status: { in: ["scheduled", "postponed"] },
      },
      select: { id: true, courseId: true, startTime: true, endTime: true, roomId: true, status: true },
    });
    const attendanceWhen = when ? { session: { date: when } } : {};
    const attendanceByStatus = await tx.attendanceRecord.groupBy({
      by: ["status"],
      where: { courseId: { in: activeCourseIds }, ...attendanceWhen },
      _count: true,
    });
    const attendanceTotal = attendanceByStatus.reduce((sum, row) => sum + row._count, 0);
    const attendancePresent =
      attendanceByStatus.find((row) => row.status === "present")?._count ?? 0;
    const counterOnlyToday = await tx.attendanceRecord.count({
      where: {
        status: "counter_only",
        session: {
          teacherId,
          date: { gte: todayStart, lt: todayEnd },
          status: { not: "cancelled" },
        },
      },
    });

    const courseRoomIds = activeCourses.map((course) => course.defaultRoomId).filter(Boolean) as string[];
    const sessionRoomIds = todaySessions.map((session) => session.roomId).filter(Boolean) as string[];
    const allRoomIds = [...new Set([...courseRoomIds, ...sessionRoomIds])];
    const rooms =
      allRoomIds.length > 0
        ? await tx.room.findMany({ where: { id: { in: allRoomIds } }, select: { id: true, name: true } })
        : [];

    return {
      activeCourses,
      activeStudents,
      todaySessions,
      attendanceTotal,
      attendancePresent,
      counterOnlyToday,
      rooms,
    };
  });

  const [gradeLoad, attendanceTrend, scoreDistribution] = await Promise.all([
    getTeacherGradeLoad(user),
    getTeacherAttendanceTrend(user, undefined, undefined, "week"),
    getTeacherScoreDistribution(user),
  ]);

  const courseMap = new Map(base.activeCourses.map((course) => [course.id, course]));
  const roomMap = new Map(base.rooms.map((room) => [room.id, room.name]));

  const avgAttendance = percentage(base.attendancePresent, base.attendanceTotal);
  const pendingGradeEntries = gradeLoad.items.reduce((sum, row) => sum + row.pending, 0);

  const enrichedSessions = base.todaySessions.map((session) => {
    const course = courseMap.get(session.courseId);
    const start = session.startTime ?? "";
    const end = session.endTime ?? "";
    let duration = "";
    let durationMinutes: number | null = null;
    if (start && end) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const mins = eh * 60 + em - (sh * 60 + sm);
      if (mins > 0) {
        duration = `${mins} min`;
        durationMinutes = mins;
      }
    }
    const roomId = session.roomId ?? course?.defaultRoomId ?? undefined;
    return {
      id: session.id,
      courseId: session.courseId,
      startTime: start,
      endTime: end,
      time: start,
      duration,
      durationMinutes,
      subject: course?.subject ?? "",
      room: roomId ? (roomMap.get(roomId) ?? "") : "",
      grade: course?.gradeTag ?? "",
      status: session.status,
    };
  });

  return {
    period: { from: period?.from ?? null, to: period?.to ?? null },
    activeStudents: base.activeStudents,
    activeCourses: base.activeCourses.length,
    todaySessions: enrichedSessions,
    avgAttendanceRate: avgAttendance,
    pendingGradeEntries,
    counterOnlyToday: base.counterOnlyToday,
    analytics: {
      attendanceTrend: attendanceTrend.series,
      gradeLoad: gradeLoad.items,
      scoreDistribution: scoreDistribution.items,
    },
  };
}
