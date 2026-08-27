"use client";

import { useTranslations } from "next-intl";
import { AttendanceScreen } from "@/features/attendance/attendance-screen";
import { StudentRecentAttendance } from "@/features/student/student-recent-attendance";
import { PageTitle } from "@/features/student/ledger";

export function StudentAttendanceScreen() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.attendance")} subtitle={t("attendanceView.subtitle")} />
      <AttendanceScreen recent={<StudentRecentAttendance />} />
    </div>
  );
}
