"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@repo/ui/components/badge";
import { MetricCard } from "@repo/ui/components/metric-card";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";

import { asKey } from "@/lib/i18n/keys";
import { Link } from "@/i18n/navigation";
import { OversightTable, type Col } from "./oversight-table";
import { useTeacherOversight, type Paged } from "./use-teacher-oversight";

type Row = Record<string, unknown>;

export function CoursesTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<Paged<Row>>(teacherId, "courses", {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    { key: "title", label: t("colCourse") },
    { key: "subject", label: t("colSubject") },
    {
      key: "centerName",
      label: t("colCenter"),
      // A null centre is a teacher-direct course by design, not missing data.
      render: (r) =>
        r.centerId ? (
          <Link
            className="focus-ledger underline underline-offset-2"
            href={`/dashboard/superadmin/centers/${String(r.centerId)}`}
          >
            {(r.centerName as string) ?? String(r.centerId).slice(0, 8)}
          </Link>
        ) : (
          <Badge variant="outline">{t("teacherDirect")}</Badge>
        ),
    },
    {
      key: "status",
      label: t("colStatus"),
      render: (r) => (
        <StatusBadge tone={statusTone(String(r.status))}>{String(r.status)}</StatusBadge>
      ),
    },
    { key: "activeEnrollments", label: t("colEnrolled"), figure: true },
    { key: "maxStudents", label: t("colSeats"), figure: true },
    { key: "pricePerMonth", label: t("colMonthly"), money: true },
    { key: "pricePerSession", label: t("colPerSession"), money: true },
    { key: "startDate", label: t("colStarts"), date: true },
  ];

  return (
    <OversightTable
      locale={locale}
      loading={req.isLoading}
      failed={req.isError}
      onRetry={req.refetch}
      rows={req.data?.data ?? []}
      total={req.data?.total ?? 0}
      columns={columns}
      emptyText={t("noCourses")}
    />
  );
}

export function SessionsTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<Paged<Row>>(teacherId, "sessions", {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    { key: "courseTitle", label: t("colCourse") },
    { key: "date", label: t("colDate"), date: true },
    { key: "startTime", label: t("colStart") },
    { key: "endTime", label: t("colEnd") },
    {
      key: "status",
      label: t("colStatus"),
      render: (r) => (
        <StatusBadge tone={statusTone(String(r.status))}>{String(r.status)}</StatusBadge>
      ),
    },
    {
      key: "distributedAt",
      label: t("colSettled"),
      // `distributedAt` is the settlement stamp — the money moved, and the
      // session is locked from here on (the settled-lesson lock).
      render: (r) =>
        r.distributedAt ? (
          <Num.Date
            value={String(r.distributedAt)}
            locale={locale}
            options={{ dateStyle: "medium", timeStyle: "short" }}
            className="text-[11px] text-ink-3"
          />
        ) : (
          <span className="text-[11px] text-ink-3">{t("notSettled")}</span>
        ),
    },
  ];

  return (
    <OversightTable
      locale={locale}
      loading={req.isLoading}
      failed={req.isError}
      onRetry={req.refetch}
      rows={req.data?.data ?? []}
      total={req.data?.total ?? 0}
      columns={columns}
      emptyText={t("noSessions")}
    />
  );
}

export function EnrollmentsTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<Paged<Row>>(teacherId, "enrollments", {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    {
      key: "studentName",
      label: t("colStudent"),
      render: (r) => (
        <Link
          className="focus-ledger underline underline-offset-2"
          href={`/dashboard/superadmin/users/${String(r.studentId)}`}
        >
          {(r.studentName as string) ?? String(r.studentId).slice(0, 8)}
        </Link>
      ),
    },
    { key: "courseTitle", label: t("colCourse") },
    {
      key: "status",
      label: t("colStatus"),
      render: (r) => (
        <StatusBadge tone={statusTone(String(r.status))}>{String(r.status)}</StatusBadge>
      ),
    },
    { key: "enrolledAt", label: t("colEnrolledAt"), date: true },
    { key: "unenrolledAt", label: t("colUnenrolledAt"), date: true },
  ];

  return (
    <OversightTable
      locale={locale}
      loading={req.isLoading}
      failed={req.isError}
      onRetry={req.refetch}
      rows={req.data?.data ?? []}
      total={req.data?.total ?? 0}
      columns={columns}
      emptyText={t("noEnrollments")}
    />
  );
}

export function AttendanceTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const tStatus = useTranslations("attendanceStatus");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<
    Paged<Row> & { byStatus: { status: string; count: number }[] }
  >(teacherId, "attendance", { enabled, query: { limit: "100" } });
  if (!enabled) return null;

  const byStatus = req.data?.byStatus ?? [];

  const columns: Col[] = [
    {
      key: "studentName",
      label: t("colStudent"),
      render: (r) => (
        <Link
          className="focus-ledger underline underline-offset-2"
          href={`/dashboard/superadmin/users/${String(r.studentId)}`}
        >
          {(r.studentName as string) ?? String(r.studentId).slice(0, 8)}
        </Link>
      ),
    },
    { key: "courseTitle", label: t("colCourse") },
    {
      key: "status",
      label: t("colStatus"),
      // `counter_only` is a real state, not a synonym for present: the student
      // checked in at the desk and never reached the hall, so it is excluded
      // from distribution. Naming it plainly is the point of showing it.
      render: (r) => (
        <StatusBadge tone={statusTone(String(r.status))}>
          {tStatus.has(asKey(String(r.status)))
            ? tStatus(asKey(String(r.status)))
            : String(r.status)}
        </StatusBadge>
      ),
    },
    { key: "createdAt", label: t("colRecorded"), date: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      {byStatus.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {byStatus.map((s) => (
            <MetricCard
              key={s.status}
              label={
                tStatus.has(asKey(s.status)) ? tStatus(asKey(s.status)) : s.status
              }
              value={<Num.Figure value={s.count} locale={locale} />}
            />
          ))}
        </div>
      ) : null}

      <OversightTable
        locale={locale}
        loading={req.isLoading}
        failed={req.isError}
        onRetry={req.refetch}
        rows={req.data?.data ?? []}
        total={req.data?.total ?? 0}
        columns={columns}
        emptyText={t("noAttendance")}
      />
    </div>
  );
}
