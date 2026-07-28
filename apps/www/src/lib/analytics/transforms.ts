import type {
  AttendanceByCoursePoint,
  CourseFillRatePoint,
  EnrollmentFunnelPoint,
  ParentPaymentTrendPoint,
  ParentSubjectComparisonPoint,
  RevenueTimeseriesPoint,
  SessionStatusPoint,
  StudentAssignmentsTrendPoint,
  StudentGradeTrendPoint,
  TeacherAttendanceTrendPoint,
  TeacherGradeLoadPoint,
  TeacherScoreDistributionPoint,
} from "@/lib/analytics/contracts";
import { CHART_COLOR, seriesColor } from "@repo/ui/lib/chart-tokens";

// Series colours come from the token layer, never a literal. The 7-hue palette
// that used to live here rendered charts in colours that existed nowhere else
// in the product. See design/DECISIONS.md and @repo/ui/lib/chart-tokens.

export function revenueVsExpensesLineSeries(points: RevenueTimeseriesPoint[]) {
  return [
    {
      id: "revenue",
      label: "Revenue",
      color: CHART_COLOR.money,
      points: points.map((row) => ({ x: row.label, value: row.revenue })),
    },
    {
      id: "expenses",
      label: "Expenses",
      color: CHART_COLOR.neutral,
      points: points.map((row) => ({ x: row.label, value: row.expenses })),
    },
  ];
}

export function sessionStatusDonutData(items: SessionStatusPoint[]) {
  return items.map((row, index) => ({
    id: row.status,
    label: row.status[0].toUpperCase() + row.status.slice(1),
    value: row.count,
    color: seriesColor(index),
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
      color: CHART_COLOR.brand,
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
      color: CHART_COLOR.brand,
      points: points.map((row) => ({ x: row.label, value: row.percentage })),
    },
  ];
}

export function assignmentsTrendBarData(points: StudentAssignmentsTrendPoint[]) {
  return points.map((row) => ({
    label: row.label,
    pending: row.pending,
    graded: row.graded,
  }));
}

export function paymentTrendLineSeries(points: ParentPaymentTrendPoint[]) {
  return [
    {
      id: "paid",
      label: "Paid",
      color: CHART_COLOR.money,
      points: points.map((row) => ({ x: row.label, value: row.paid })),
    },
    {
      id: "net",
      label: "Net",
      color: CHART_COLOR.brand,
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
