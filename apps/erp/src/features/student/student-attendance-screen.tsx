"use client";

import { useTranslations } from "next-intl";
import { AttendanceScreen } from "@/features/attendance/attendance-screen";
import { StudentRecentAttendance } from "@/features/student/student-recent-attendance";
import { PageTitle } from "@/features/student/ledger";

/**
 * حضوري — the student's own attendance page.
 *
 * ── WHY THIS WRAPPER EXISTS ───────────────────────────────────────────────
 *
 * The route used to be `<AttendanceScreen />` and nothing else, which made it
 * the ONE page in this portal with no heading: a student landed on three bare
 * numbers with nothing saying which screen they were on. The heading could not
 * simply be added inside `AttendanceScreen`, because the parent portal mounts
 * that same component INSIDE its own page header and would have printed two.
 *
 * So the shared screen keeps carrying no portal chrome — the rule its own file
 * header states — and the chrome lives here, in the portal that wants it,
 * alongside the named-lessons list only this portal can build. See
 * `student-recent-attendance.tsx` for why a parent cannot.
 */
export function StudentAttendanceScreen() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.attendance")} subtitle={t("attendanceView.subtitle")} />
      <AttendanceScreen recent={<StudentRecentAttendance />} />
    </div>
  );
}
