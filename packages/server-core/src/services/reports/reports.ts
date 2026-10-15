import { PaymentStatus, Prisma, type SessionStatus } from "@repo/database";
import { scopedDb, platformDb, type TenantTx } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { dayRange, platformTodayWindow, type DayRange } from "../../lib/day-range";
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

const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

function paymentBaseSql(centerId: string) {
  return Prisma.sql`p.center_id = ${centerId}::uuid AND p.status NOT IN ('failed', 'pending')`;
}

function provenanceSql(centerId: string, f?: ProvenanceFilter) {
  const filtered = !isUnfiltered(f);
  const dataSource = filtered && f?.dataSource ? f.dataSource : null;
  const scope =
    filtered && f?.systemStatus
      ? Prisma.sql`(SELECT c.id FROM courses c WHERE c.center_id = ${centerId}::uuid
          AND c.teacher_id IN (SELECT tp.user_id FROM teacher_profiles tp
                               WHERE tp.system_status = ${f.systemStatus}::teacher_system_status))`
      : null;
  return {
    source: (col: string) =>
      dataSource ? Prisma.sql`AND ${Prisma.raw(col)} = ${dataSource}::data_source` : Prisma.empty,
    scope: (col: string) => (scope ? Prisma.sql`AND ${Prisma.raw(col)} IN ${scope}` : Prisma.empty),
  };
}

function rangeSql(col: string, range?: DayRange) {
  const gte = range?.gte ? Prisma.sql`AND ${Prisma.raw(col)} >= ${range.gte}` : Prisma.empty;
  const lte = range?.lte ? Prisma.sql`AND ${Prisma.raw(col)} <= ${range.lte}` : Prisma.empty;
  return Prisma.sql`${gte} ${lte}`;
}

function sessionDateSql(col: string, range?: DayRange) {
  return range
    ? Prisma.sql`AND ${Prisma.raw(col)} IN (SELECT s.id FROM sessions s WHERE TRUE ${rangeSql("s.date", range)})`
    : Prisma.empty;
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
    const prov = provenanceSql(centerId, provenance);
    const rows = await tx.$queryRaw<
      [{ payments: { amount: number; paidAt: string }[]; expenses: { amount: number; expenseDate: string }[] }]
    >`
      SELECT
        (SELECT coalesce(json_agg(json_build_object(
            'amount', p.amount, 'paidAt', to_char(p.paid_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}))), '[]'::json)
         FROM payments p
         WHERE ${paymentBaseSql(centerId)}
           AND p.paid_at >= ${fromDate} AND p.paid_at <= ${toDate}
           ${prov.source("p.data_source")} ${prov.scope("p.course_id")}) AS payments,
        (SELECT coalesce(json_agg(json_build_object(
            'amount', x.amount, 'expenseDate', to_char(x.expense_date AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}))), '[]'::json)
         FROM expenses x
         WHERE x.center_id = ${centerId}::uuid
           AND x.expense_date >= ${fromDate} AND x.expense_date <= ${toDate}) AS expenses`;
    return rows[0];
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
    const prov = provenanceSql(centerId, provenance);
    const courses = await tx.$queryRaw<{ id: string; title: string; maxStudents: number | null; enrolled: number }[]>`
      SELECT c.id, c.title, c.max_students AS "maxStudents",
        (SELECT count(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS enrolled
      FROM courses c
      WHERE c.center_id = ${centerId}::uuid AND c.status = 'active'
        ${prov.source("c.data_source")} ${prov.scope("c.id")}`;
    if (courses.length === 0) return { items: [] as CourseFillRatePoint[] };

    const items = courses
      .map((course) => {
        const enrolled = course.enrolled;
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
    const prov = provenanceSql(centerId, provenance);
    const rows = await tx.$queryRaw<
      { courseId: string; status: string; _count: number; title: string | null }[]
    >`
      SELECT a.course_id AS "courseId", a.status::text AS status, count(*)::int AS "_count",
        (SELECT c.title FROM courses c WHERE c.id = a.course_id) AS title
      FROM attendance_records a
      WHERE a.center_id = ${centerId}::uuid
        ${sessionDateSql("a.session_id", df)} ${prov.source("a.data_source")} ${prov.scope("a.course_id")}
      GROUP BY a.course_id, a.status`;

    const byCourse = new Map<string, { present: number; absent: number; excused: number }>();
    for (const row of rows) {
      const entry = byCourse.get(row.courseId) ?? { present: 0, absent: 0, excused: 0 };
      if (row.status === "present") entry.present += row._count;
      else if (row.status === "absent") entry.absent += row._count;
      else if (row.status === "excused") entry.excused += row._count;
      byCourse.set(row.courseId, entry);
    }

    const titleById = new Map(rows.filter((row) => row.title !== null).map((row) => [row.courseId, row.title as string]));

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

type AdminDashboardBase = {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  todaySessionCount: number;
  revenue: number;
  expenses: number;
  pendingEnrollmentRequests: number;
  attendanceTotal: number;
  attendancePresent: number;
  externalTeachers: number;
  externalCourses: number;
  externalStudents: number;
  externalRevenue: number;
};

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
        const prov = provenanceSql(centerId, provenance);
        const rows = await tx.$queryRaw<[{ base: AdminDashboardBase }]>`
          WITH ext_courses AS (
            SELECT c.id FROM courses c
            WHERE c.center_id = ${centerId}::uuid AND c.status = 'active'
              AND c.teacher_id IN (SELECT tp.user_id FROM teacher_profiles tp
                                   WHERE tp.managed_by_center_id = ${centerId}::uuid
                                     AND tp.system_status = 'external')
          )
          SELECT json_build_object(
            'totalStudents', (SELECT count(*) FROM enrollments e
               WHERE e.center_id = ${centerId}::uuid AND e.status = 'active'
                 ${prov.scope("e.course_id")} ${prov.source("e.data_source")}),
            'totalTeachers', (SELECT count(DISTINCT c.teacher_id) FROM courses c
               WHERE c.center_id = ${centerId}::uuid AND c.status = 'active'
                 ${prov.source("c.data_source")} ${prov.scope("c.id")}),
            'totalCourses', (SELECT count(*) FROM courses c
               WHERE c.center_id = ${centerId}::uuid AND c.status = 'active'
                 ${prov.source("c.data_source")} ${prov.scope("c.id")}),
            'todaySessionCount', (SELECT count(*) FROM sessions s
               WHERE s.date >= ${todayStart} AND s.date < ${todayEnd}
                 AND s.course_id IN (SELECT c.id FROM courses c WHERE c.center_id = ${centerId}::uuid)
                 ${prov.scope("s.course_id")} ${prov.source("s.data_source")}),
            'revenue', (SELECT coalesce(sum(p.amount), 0) FROM payments p
               WHERE ${paymentBaseSql(centerId)}
                 ${prov.scope("p.course_id")} ${prov.source("p.data_source")} ${rangeSql("p.paid_at", money)}),
            'expenses', (SELECT coalesce(sum(x.amount), 0) FROM expenses x
               WHERE x.center_id = ${centerId}::uuid ${rangeSql("x.expense_date", money)}),
            'pendingEnrollmentRequests', (SELECT count(*) FROM enrollment_requests r
               WHERE r.center_id = ${centerId}::uuid AND r.status = 'pending' ${prov.scope("r.course_id")}),
            'attendanceTotal', (SELECT count(*) FROM attendance_records a
               WHERE a.center_id = ${centerId}::uuid
                 ${prov.scope("a.course_id")} ${prov.source("a.data_source")} ${sessionDateSql("a.session_id", money)}),
            'attendancePresent', (SELECT count(*) FROM attendance_records a
               WHERE a.center_id = ${centerId}::uuid AND a.status = 'present'
                 ${prov.scope("a.course_id")} ${prov.source("a.data_source")} ${sessionDateSql("a.session_id", money)}),
            'externalTeachers', (SELECT count(*) FROM teacher_profiles tp
               WHERE tp.managed_by_center_id = ${centerId}::uuid AND tp.system_status = 'external'),
            'externalCourses', (SELECT count(*) FROM ext_courses),
            'externalStudents', (SELECT count(*) FROM enrollments e
               WHERE e.center_id = ${centerId}::uuid AND e.status = 'active'
                 AND e.course_id IN (SELECT id FROM ext_courses)),
            'externalRevenue', (SELECT coalesce(sum(p.amount), 0) FROM payments p
               WHERE ${paymentBaseSql(centerId)}
                 AND p.course_id IN (SELECT id FROM ext_courses) ${rangeSql("p.paid_at", money)})
          ) AS base`;
        const b = rows[0].base;
        return {
          totalStudents: b.totalStudents,
          totalTeachers: b.totalTeachers,
          totalCourses: b.totalCourses,
          todaySessionCount: b.todaySessionCount,
          revenue: b.revenue,
          expenses: b.expenses,
          pendingEnrollmentRequests: b.pendingEnrollmentRequests,
          attendanceTotal: b.attendanceTotal,
          attendancePresent: b.attendancePresent,
          external: {
            teachers: b.externalTeachers,
            courses: b.externalCourses,
            students: b.externalStudents,
            revenue: b.externalRevenue,
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
    const rows = await tx.$queryRaw<[{ n: number }]>`
      SELECT count(*)::int AS n FROM (
        SELECT e.student_id, sum(c.price) AS owed
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.center_id = ${centerId}::uuid AND e.status = 'active'
        GROUP BY e.student_id
      ) o
      WHERE o.owed - coalesce((SELECT sum(p.amount) FROM payments p
                               WHERE ${paymentBaseSql(centerId)} AND p.student_id = o.student_id), 0) > 0`;
    return rows[0].n;
  });
}

type TeacherDashboardBase = {
  activeCourses: {
    id: string;
    title: string;
    maxStudents: number;
    subject: string | null;
    gradeTag: string | null;
    defaultRoomId: string | null;
  }[];
  activeStudents: number;
  todaySessions: {
    id: string;
    courseId: string;
    startTime: string | null;
    endTime: string | null;
    roomId: string | null;
    status: SessionStatus;
  }[];
  attendanceTotal: number;
  attendancePresent: number;
  counterOnlyToday: number;
  rooms: { id: string; name: string }[];
};

export async function getTeacherDashboard(
  user: SessionUser,
  period?: { from?: string; to?: string },
) {
  const teacherId = user.id;

  const { gte: todayStart, lt: todayEnd } = platformTodayWindow();

  const when = dayRange(period?.from, period?.to);

  const baseP = scopedDb(user, async (tx) => {
    const rows = await tx.$queryRaw<[{ base: TeacherDashboardBase }]>`
      WITH active AS (
        SELECT c.id, c.title, c.max_students, c.subject, c.grade_tag, c.default_room_id
        FROM courses c WHERE c.teacher_id = ${teacherId}::uuid AND c.status = 'active'
      ),
      today AS (
        SELECT s.id, s.course_id, s.start_time, s.end_time, s.room_id, s.status
        FROM sessions s
        WHERE s.teacher_id = ${teacherId}::uuid
          AND s.date >= ${todayStart} AND s.date < ${todayEnd}
          AND s.status IN ('scheduled', 'postponed')
      )
      SELECT json_build_object(
        'activeCourses', (SELECT coalesce(json_agg(json_build_object(
            'id', a.id, 'title', a.title, 'maxStudents', a.max_students, 'subject', a.subject,
            'gradeTag', a.grade_tag, 'defaultRoomId', a.default_room_id)), '[]'::json) FROM active a),
        'activeStudents', (SELECT count(*) FROM enrollments e
           WHERE e.course_id IN (SELECT id FROM active) AND e.status = 'active'),
        'todaySessions', (SELECT coalesce(json_agg(json_build_object(
            'id', t.id, 'courseId', t.course_id, 'startTime', t.start_time, 'endTime', t.end_time,
            'roomId', t.room_id, 'status', t.status)), '[]'::json) FROM today t),
        'attendanceTotal', (SELECT count(*) FROM attendance_records a
           WHERE a.course_id IN (SELECT id FROM active) ${sessionDateSql("a.session_id", when)}),
        'attendancePresent', (SELECT count(*) FROM attendance_records a
           WHERE a.course_id IN (SELECT id FROM active) AND a.status = 'present'
             ${sessionDateSql("a.session_id", when)}),
        'counterOnlyToday', (SELECT count(*) FROM attendance_records a
           WHERE a.status = 'counter_only'
             AND a.session_id IN (SELECT s.id FROM sessions s
               WHERE s.teacher_id = ${teacherId}::uuid
                 AND s.date >= ${todayStart} AND s.date < ${todayEnd}
                 AND s.status <> 'cancelled')),
        'rooms', (SELECT coalesce(json_agg(json_build_object('id', r.id, 'name', r.name)), '[]'::json)
           FROM rooms r
           WHERE r.id IN (SELECT a.default_room_id FROM active a WHERE a.default_room_id IS NOT NULL
                          UNION SELECT t.room_id FROM today t WHERE t.room_id IS NOT NULL))
      ) AS base`;
    return rows[0].base;
  });

  const [base, gradeLoad, attendanceTrend, scoreDistribution] = await Promise.all([
    baseP,
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
