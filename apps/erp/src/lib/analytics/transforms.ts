import type { HeatmapCell } from "@repo/ui/components/charts";
import type {
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
} from "@/lib/analytics/contracts";

// Series colours come from the token layer, never from literals. The token is
// `--chart-*`: that is the name the shipped layer defines, and a var() that
// resolves to nothing makes SVG fill fall back to BLACK — silently. Explicit
// per-series assignment (rather than the components' positional seriesColor
// fallback) keeps a series' hue stable when a sibling series is added,
// removed, or reordered.
const DEFAULT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// `labels` / `labelFor` exist because these strings land on ARABIC screens:
// the hardcoded English defaults are only the fallback for callers that have
// no translator in scope, never the intended display.
export function revenueVsExpensesLineSeries(
  points: RevenueTimeseriesPoint[],
  labels?: { revenue: string; expenses: string },
) {
  return [
    {
      id: "revenue",
      label: labels?.revenue ?? "Revenue",
      color: "var(--chart-1)",
      points: points.map((row) => ({ x: row.label, value: row.revenue })),
    },
    {
      id: "expenses",
      label: labels?.expenses ?? "Expenses",
      color: "var(--chart-3)",
      points: points.map((row) => ({ x: row.label, value: row.expenses })),
    },
  ];
}

export function sessionStatusDonutData(
  items: SessionStatusPoint[],
  labelFor?: (status: string) => string,
) {
  return items.map((row, index) => ({
    id: row.status,
    label: labelFor ? labelFor(row.status) : row.status[0].toUpperCase() + row.status.slice(1),
    value: row.count,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));
}

export function attendanceByCourseBarData(items: AttendanceByCoursePoint[]) {
  return items.map((row) => ({
    label: row.title,
    rate: row.attendanceRatePct,
  }));
}

export function courseFillRateBarData(items: CourseFillRatePoint[]) {
  return items.map((row) => ({
    label: row.title,
    fillRate: row.fillRatePct,
  }));
}

export function enrollmentFunnelBarData(
  items: EnrollmentFunnelPoint[],
  labelFor?: (status: string) => string,
) {
  return items.map((row) => ({
    label: labelFor ? labelFor(row.status) : row.status[0].toUpperCase() + row.status.slice(1),
    count: row.count,
  }));
}

export function teacherAttendanceLineSeries(points: TeacherAttendanceTrendPoint[]) {
  return [
    {
      id: "attendance",
      label: "Attendance Rate",
      color: "var(--chart-2)",
      points: points.map((row) => ({ x: row.label, value: row.attendanceRatePct })),
    },
  ];
}

export function teacherGradeLoadBarData(items: TeacherGradeLoadPoint[]) {
  return items.map((row) => ({
    label: row.title,
    pending: row.pending,
    graded: row.graded,
  }));
}

export function scoreDistributionBarData(items: TeacherScoreDistributionPoint[]) {
  return items.map((row) => ({
    label: row.bucket,
    count: row.count,
  }));
}

export function studentGradeTrendLineSeries(points: StudentGradeTrendPoint[]) {
  return [
    {
      id: "grades",
      label: "Grade %",
      color: "var(--chart-1)",
      points: points.map((row) => ({ x: row.label, value: row.percentage })),
    },
  ];
}


export function paymentTrendLineSeries(points: ParentPaymentTrendPoint[]) {
  return [
    {
      id: "paid",
      label: "Paid",
      color: "var(--chart-2)",
      points: points.map((row) => ({ x: row.label, value: row.paid })),
    },
    {
      id: "net",
      label: "Net",
      color: "var(--chart-1)",
      points: points.map((row) => ({ x: row.label, value: row.net })),
    },
  ];
}

export function subjectComparisonBarData(items: ParentSubjectComparisonPoint[]) {
  return items.map((row) => ({
    label: row.courseTitle,
    average: row.averagePct,
  }));
}

/**
 * The last `days` calendar days ending today, as one cell per DAY — not one
 * cell per record.
 *
 * The previous version mapped records straight to cells, so a student with four
 * attendance rows got a four-cell "last 28 days". A calendar's gaps are its
 * content: a fortnight with no lessons is a fact about the fortnight, and it
 * cannot be read off a grid that only draws the days something happened.
 *
 * The grid is padded at the FRONT to the week boundary so every column is one
 * weekday down its whole height — without that the columns mean nothing and the
 * weekday header would be a lie.
 *
 * Dates are keys, never instants: `YYYY-MM-DD` is compared as a string and
 * built in local time, so a student in Cairo does not lose a day to UTC.
 */
export function attendanceDayCells(
  records: Array<{ date: string; status: "present" | "absent" | "late" }>,
  opts: {
    days?: number;
    /** Localized day-of-month, e.g. `3`. */
    formatDayNumber: (date: Date) => string;
    /** The full accessible sentence for one cell. */
    describe: (date: Date, status: "present" | "absent" | "late" | null) => string;
    today?: Date;
  },
): HeatmapCell[] {
  const { days = 28, formatDayNumber, describe } = opts;

  const byDate = new Map<string, "present" | "absent" | "late">();
  // Worst status wins a day: two lessons, one missed, is not a present day.
  const rank = { absent: 2, late: 1, present: 0 } as const;
  for (const record of records) {
    if (!record.date) continue;
    const existing = byDate.get(record.date);
    if (!existing || rank[record.status] > rank[existing]) {
      byDate.set(record.date, record.status);
    }
  }

  const end = opts.today ? new Date(opts.today) : new Date();
  end.setHours(0, 0, 0, 0);

  const windowStart = new Date(end);
  windowStart.setDate(windowStart.getDate() - (days - 1));

  // Back up to Sunday so column 1 is Sunday down every row. Those extra days
  // are real dates OUTSIDE the stated window, so they are emitted as `blank`
  // and drawn as nothing — the card shows exactly `days` days, as it says.
  const start = new Date(windowStart);
  start.setDate(start.getDate() - start.getDay());

  const cells: HeatmapCell[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor);
    if (day < windowStart) {
      cells.push({ date: `pad-${day.toDateString()}`, label: "", tone: "blank" });
      continue;
    }
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
      day.getDate(),
    ).padStart(2, "0")}`;
    const status = byDate.get(key) ?? null;
    cells.push({
      date: key,
      label: formatDayNumber(day),
      tone:
        status === "present"
          ? "positive"
          : status === "late"
            ? "warning"
            : status === "absent"
              ? "negative"
              : "none",
      title: describe(day, status),
    });
  }
  return cells;
}
