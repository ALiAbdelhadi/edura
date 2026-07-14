"use client";

import React from "react";
import { useList } from "@refinedev/core";
import {
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  BookOpen,
  User,
  DoorOpen,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { StatCard } from "@/components/kit/stat-card";
import { PageHeader } from "@/components/kit/page-header";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { DescriptionList } from "@/components/kit/description-list";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKeys = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"];

export function ScheduleScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [dayIndex, setDayIndex] = React.useState(new Date().getDay());
  const [selectedSession, setSelectedSession] = React.useState<any>(null);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayLabel = (i: number) => t(asKey(`studentClass.${dayKeys[i]}`));

  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "enrollments",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
  });
  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
  });

  const courses = (coursesResult?.data ?? []) as any[];
  const sessions = (sessionsResult?.data ?? []) as any[];

  const isLoading = coursesQuery.isLoading || sessionsQuery.isLoading;

  if (isLoading) {
    return <PageSpinner label={t("common.loading")} />;
  }

  const selectedDayName = days[dayIndex];

  const getDayNameFromDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return dayNames[date.getDay()];
  };

  const daySessions = sessions
    .filter((s: any) => getDayNameFromDate(s.date) === selectedDayName)
    .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

  const completed = sessions.filter((s: any) => s.status === "completed").length;
  const upcoming = sessions.filter((s: any) => s.status === "scheduled").length;
  const cancelled = sessions.filter((s: any) => s.status === "cancelled").length;

  const statusTone = (status: string): StatusTone =>
    status === "cancelled" ? "danger" : status === "completed" ? "success" : "info";
  const statusText = (status: string) =>
    status === "cancelled"
      ? t("status.cancelled")
      : status === "completed"
        ? t("status.completed")
        : t("status.scheduled");

  const detailItems = selectedSession
    ? [
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" /> {t("studentClass.date")}
            </span>
          ),
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
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-3.5" /> {t("studentClass.time")}
            </span>
          ),
          value: (
            <span dir="ltr">
              {selectedSession.startTime} – {selectedSession.endTime}
            </span>
          ),
        },
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="size-3.5" /> {t("studentClass.course")}
            </span>
          ),
          value: (
            <div className="flex flex-wrap items-center gap-2">
              <span>{selectedSession.courseName || "—"}</span>
              {selectedSession.courseId && (
                <Link
                  href={`/courses/${selectedSession.courseId}`}
                  className="text-xs text-primary hover:underline"
                >
                  {t("studentClass.viewCourse")}
                </Link>
              )}
            </div>
          ),
        },
        ...(selectedSession.subject
          ? [
              {
                label: t("studentClass.subject"),
                value: selectedSession.subject,
              },
            ]
          : []),
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" /> {t("roles.teacher")}
            </span>
          ),
          value: selectedSession.teacherName || t("studentClass.tbd"),
        },
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <DoorOpen className="size-3.5" /> {t("studentClass.room")}
            </span>
          ),
          value: selectedSession.roomName || t("studentClass.tbd"),
        },
        {
          label: t("studentClass.statusLabel"),
          value: (
            <StatusBadge tone={statusTone(selectedSession.status)}>
              {statusText(selectedSession.status)}
            </StatusBadge>
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.schedule")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("nav.schedule")}</CardTitle>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(dayIndex)}
              onValueChange={(v) => {
                if (v) setDayIndex(Number(v));
              }}
            >
              {days.map((d, i) => (
                <ToggleGroupItem key={d} value={String(i)}>
                  {dayLabel(i)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {daySessions.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title={`${t("studentClass.noSessionsOn")} ${dayLabel(dayIndex)}`}
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("studentClass.start")}</TableHead>
                      <TableHead>{t("studentClass.end")}</TableHead>
                      <TableHead>{t("studentClass.course")}</TableHead>
                      <TableHead>{t("roles.teacher")}</TableHead>
                      <TableHead>{t("studentClass.room")}</TableHead>
                      <TableHead>{t("studentClass.statusLabel")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daySessions.map((s: any) => (
                      <TableRow
                        key={s.id || s._id}
                        className="cursor-pointer"
                        onClick={() => setSelectedSession(s)}
                      >
                        <TableCell dir="ltr">{s.startTime}</TableCell>
                        <TableCell dir="ltr">{s.endTime}</TableCell>
                        <TableCell>
                          {s.courseName ? (
                            <Link
                              href={`/courses/${s.courseId}`}
                              className="text-primary hover:underline"
                            >
                              {s.courseName}
                            </Link>
                          ) : (
                            `${t("studentClass.course")}: ${s.courseId?.substring(0, 6)}`
                          )}
                        </TableCell>
                        <TableCell>
                          {s.teacherName || t("studentClass.assignedTeacher")}
                        </TableCell>
                        <TableCell>{s.roomName || t("studentClass.tbd")}</TableCell>
                        <TableCell>
                          <StatusBadge tone={statusTone(s.status)}>
                            {statusText(s.status)}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-1">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label={t("common.total")} value={sessions.length} icon={Calendar} />
          <StatCard
            label={t("status.completed")}
            value={completed}
            icon={CheckCircle2}
            accent
          />
          <StatCard label={t("studentClass.upcoming")} value={upcoming} icon={Clock} />
          <StatCard label={t("status.cancelled")} value={cancelled} icon={XCircle} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("studentClass.enrolledCourses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {courses.length === 0 ? (
              <EmptyState icon={BookOpen} title={t("studentClass.noEnrolledCourses")} />
            ) : (
              <div className="flex flex-col">
                {courses.map((c: any, i: number) => (
                  <div
                    key={c.id || c._id || i}
                    className="border-b border-border py-2 last:border-b-0"
                  >
                    <div className="font-semibold text-foreground">
                      {c.courseName || c.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.schedulePattern?.daysOfWeek?.join(" / ") ||
                        t("studentClass.tbd")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
          {selectedSession && (
            <DescriptionList columns={1} items={detailItems} />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
