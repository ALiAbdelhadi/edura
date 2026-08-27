import type { HeatmapCell } from "@repo/ui/components/charts";
import type {
  EnrollmentFunnelPoint,
  SessionStatusPoint,
  TeacherAttendanceTrendPoint,
  TeacherGradeLoadPoint,
} from "@/lib/analytics/contracts";

const DEFAULT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

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

export function attendanceDayCells(
  records: Array<{ date: string; status: "present" | "absent" | "late" }>,
  opts: {
    days?: number;
    formatDayNumber: (date: Date) => string;
    describe: (date: Date, status: "present" | "absent" | "late" | null) => string;
    today?: Date;
  },
): HeatmapCell[] {
  const { days = 28, formatDayNumber, describe } = opts;

  const byDate = new Map<string, "present" | "absent" | "late">();
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
