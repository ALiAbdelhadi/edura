"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { DescriptionList } from "@/components/kit/description-list";
import { PageSpinner } from "@/components/kit/spinner";
import {
  Chip,
  Eyebrow,
  InitialsTile,
  LedgerEmpty,
  LedgerTable,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
  Td,
  Th,
  Tr,
} from "@/features/student/ledger";

type Session = {
  id?: string;
  _id?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  courseId?: string;
  courseName?: string;
  subject?: string;
  teacherName?: string;
  roomName?: string;
};
type Enrollment = {
  id?: string;
  _id?: string;
  courseName?: string;
  title?: string;
  schedulePattern?: { daysOfWeek?: string[] };
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKeys = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"];

export function ScheduleScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [dayIndex, setDayIndex] = React.useState(new Date().getDay());
  const [selectedSession, setSelectedSession] = React.useState<Session | null>(null);
  const dayLabel = (i: number) => t(asKey(`studentClass.${dayKeys[i]}`));

  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "enrollments",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
  });
  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
  });

  const courses = (coursesResult?.data ?? []) as Enrollment[];
  const sessions = (sessionsResult?.data ?? []) as Session[];

  if (coursesQuery.isLoading || sessionsQuery.isLoading) {
    return <PageSpinner label={t("common.loading")} />;
  }

  const selectedDayName = dayNames[dayIndex];
  const daySessions = sessions
    .filter((s) => dayNames[new Date(s.date).getDay()] === selectedDayName)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const completed = sessions.filter((s) => s.status === "completed").length;
  const upcoming = sessions.filter((s) => s.status === "scheduled").length;
  const cancelled = sessions.filter((s) => s.status === "cancelled").length;

  const statusTone = (status: string) =>
    status === "cancelled" ? "red" : status === "completed" ? "teal" : "indigo";
  const statusText = (status: string) =>
    status === "cancelled"
      ? t("status.cancelled")
      : status === "completed"
        ? t("status.completed")
        : t("status.scheduled");

  const detailItems = selectedSession
    ? [
        {
          label: t("studentClass.date"),
          value: selectedSession.date
            ? formatDate(selectedSession.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "—",
        },
        {
          label: t("studentClass.time"),
          value: (
            <Num>
              {selectedSession.startTime} – {selectedSession.endTime}
            </Num>
          ),
        },
        {
          label: t("studentClass.course"),
          value: (
            <div className="flex flex-wrap items-center gap-2">
              <span>{selectedSession.courseName || "—"}</span>
              {selectedSession.courseId ? (
                <Link
                  href={`/courses/${selectedSession.courseId}`}
                  className="text-xs hover:underline"
                  style={{ color: "var(--indigo)" }}
                >
                  {t("studentClass.viewCourse")}
                </Link>
              ) : null}
            </div>
          ),
        },
        ...(selectedSession.subject
          ? [{ label: t("studentClass.subject"), value: selectedSession.subject }]
          : []),
        {
          label: t("roles.teacher"),
          value: selectedSession.teacherName || t("studentClass.tbd"),
        },
        {
          label: t("studentClass.room"),
          value: selectedSession.roomName || t("studentClass.tbd"),
        },
        {
          label: t("studentClass.statusLabel"),
          value: (
            <Chip tone={statusTone(selectedSession.status)}>
              {statusText(selectedSession.status)}
            </Chip>
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.schedule")} />

      {/* Day picker. The student's own week is the primary axis here, so it
          sits above the record rather than inside a card header. */}
      <div className="flex flex-wrap gap-1.5">
        {dayNames.map((d, i) => {
          const active = i === dayIndex;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDayIndex(i)}
              aria-pressed={active}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: active ? "var(--indigo-soft)" : "var(--sheet)",
                color: active ? "var(--indigo)" : "var(--ink-2)",
                border: `1px solid ${active ? "var(--indigo-soft)" : "var(--rule)"}`,
              }}
            >
              {dayLabel(i)}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Sheet className="p-5">
            <SectionHeading title={dayLabel(dayIndex)} />
            <div className="mt-3">
              {daySessions.length === 0 ? (
                <LedgerEmpty
                  title={`${t("studentClass.noSessionsOn")} ${dayLabel(dayIndex)}`}
                />
              ) : (
                <LedgerTable
                  head={
                    <>
                      <Th>{t("studentClass.start")}</Th>
                      <Th>{t("studentClass.course")}</Th>
                      <Th>{t("studentClass.room")}</Th>
                      <Th align="end">{t("studentClass.statusLabel")}</Th>
                    </>
                  }
                >
                  {daySessions.map((s) => (
                    <Tr key={s.id || s._id}>
                      <Td>
                        <button
                          type="button"
                          onClick={() => setSelectedSession(s)}
                          className="text-start"
                        >
                          <Num style={{ color: "var(--ink)", fontWeight: 500 }}>{s.startTime}</Num>
                          <div>
                            <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>{s.endTime}</Num>
                          </div>
                        </button>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <InitialsTile name={s.courseName || "?"} size={28} tone="indigo" />
                          {s.courseName && s.courseId ? (
                            <Link
                              href={`/courses/${s.courseId}`}
                              className="font-medium hover:underline"
                              style={{ color: "var(--ink)" }}
                            >
                              {s.courseName}
                            </Link>
                          ) : (
                            <span style={{ color: "var(--ink-2)" }}>
                              {s.courseName || t("studentClass.tbd")}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                          {s.teacherName || t("studentClass.assignedTeacher")}
                        </div>
                      </Td>
                      <Td>
                        <span style={{ color: "var(--ink-2)" }}>
                          {s.roomName || t("studentClass.tbd")}
                        </span>
                      </Td>
                      <Td align="end">
                        <Chip tone={statusTone(s.status)}>{statusText(s.status)}</Chip>
                      </Td>
                    </Tr>
                  ))}
                </LedgerTable>
              )}
            </div>
          </Sheet>
        </div>

        <div className="space-y-4">
          <Sheet className="p-5">
            <Eyebrow>{t("common.total")}</Eyebrow>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>
                  {sessions.length}
                </Num>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("common.total")}
                </p>
              </div>
              <div>
                <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--teal)" }}>
                  {completed}
                </Num>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("status.completed")}
                </p>
              </div>
              <div>
                <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>{upcoming}</Num>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("studentClass.upcoming")}
                </p>
              </div>
              <div>
                <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--red)" }}>
                  {cancelled}
                </Num>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("status.cancelled")}
                </p>
              </div>
            </div>
          </Sheet>

          <Sheet className="p-5">
            <SectionHeading title={t("studentClass.enrolledCourses")} />
            <div className="mt-3">
              {courses.length === 0 ? (
                <LedgerEmpty title={t("studentClass.noEnrolledCourses")} />
              ) : (
                <ul>
                  {courses.map((c, i) => (
                    <li
                      key={c.id || c._id || i}
                      className="flex items-center gap-2.5 border-b py-2.5 last:border-b-0"
                      style={{ borderColor: "var(--rule-2)" }}
                    >
                      <InitialsTile name={c.courseName || c.title || "?"} size={28} tone="teal" />
                      <div className="min-w-0">
                        <div className="truncate font-medium" style={{ color: "var(--ink)" }}>
                          {c.courseName || c.title}
                        </div>
                        <div className="text-xs" style={{ color: "var(--ink-3)" }}>
                          {c.schedulePattern?.daysOfWeek?.join(" / ") || t("studentClass.tbd")}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Sheet>
        </div>
      </div>

      <Dialog
        open={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("studentClass.sessionDetails")}</DialogTitle>
          </DialogHeader>
          {selectedSession ? <DescriptionList columns={1} items={detailItems} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
