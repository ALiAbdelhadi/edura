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

export function revenueVsExpensesLineSeries(points: RevenueTimeseriesPoint[]) {
  return [
    {
      id: "revenue",
      label: "Revenue",
      color: "var(--chart-1)",
      points: points.map((row) => ({ x: row.label, value: row.revenue })),
    },
    {
      id: "expenses",
      label: "Expenses",
      color: "var(--chart-3)",
      points: points.map((row) => ({ x: row.label, value: row.expenses })),
    },
  ];
}

export function sessionStatusDonutData(items: SessionStatusPoint[]) {
  return items.map((row, index) => ({
    id: row.status,
    label: row.status[0].toUpperCase() + row.status.slice(1),
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

export function enrollmentFunnelBarData(items: EnrollmentFunnelPoint[]) {
  return items.map((row) => ({
    label: row.status[0].toUpperCase() + row.status.slice(1),
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

export function attendanceRecordsToHeatmapCells(
  records: Array<{ date: string; status: "present" | "absent" | "late" }>,
) {
  return records.slice(-28).map((record) => ({
    date: record.date,
    value: record.status === "present" ? 100 : record.status === "late" ? 60 : 20,
    label: new Date(`${record.date}T00:00:00`).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
    }),
  }));
}
