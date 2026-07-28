export type AnalyticsGranularity = "week" | "month";

export type DateRangeQuery = {
  from?: string;
  to?: string;
};

export type RevenueTimeseriesPoint = {
  period: string;
  label: string;
  revenue: number;
  expenses: number;
  netProfit: number;
};

export type ExpenseTimeseriesPoint = {
  period: string;
  label: string;
  total: number;
};

export type CourseFillRatePoint = {
  courseId: string;
  title: string;
  enrolled: number;
  maxStudents: number;
  fillRatePct: number;
};

export type AttendanceByCoursePoint = {
  courseId: string;
  title: string;
  present: number;
  absent: number;
  excused: number;
  total: number;
  attendanceRatePct: number;
};

export type EnrollmentFunnelPoint = {
  status: "pending" | "approved" | "declined" | "expired";
  count: number;
};

export type SessionStatusPoint = {
  status: "scheduled" | "completed" | "cancelled" | "postponed";
  count: number;
};

export type TeacherAttendanceTrendPoint = {
  period: string;
  label: string;
  attendanceRatePct: number;
  totalRecords: number;
};

export type TeacherGradeLoadPoint = {
  courseId: string;
  title: string;
  pending: number;
  graded: number;
  completionPct: number;
};

export type TeacherScoreDistributionPoint = {
  bucket: string;
  count: number;
};

export type StudentGradeTrendPoint = {
  date: string;
  label: string;
  assignment: string;
  courseId: string;
  courseTitle: string;
  percentage: number;
};

export type ParentPaymentTrendPoint = {
  period: string;
  label: string;
  paid: number;
  refunded: number;
  net: number;
};

export type ParentSubjectComparisonPoint = {
  courseId: string;
  courseTitle: string;
  averagePct: number;
};
