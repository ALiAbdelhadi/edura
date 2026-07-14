"use client";

import React, { useState, useMemo } from "react";
import { useGetIdentity, useList, useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import { CheckCircle2, XCircle, Clock, CalendarOff, AlertTriangle, CloudOff } from "lucide-react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Alert, AlertTitle, AlertDescription } from "@repo/ui/components/alert";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { toast } from "@repo/ui/components/sonner";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner, PageSpinner } from "@/components/kit/spinner";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { enqueueAttendance } from "@/lib/pwa/attendance-outbox";
import { useAttendanceSync } from "@/lib/pwa/use-attendance-sync";
type Identity = { id: string; name?: string; email?: string };
type EnrollmentRow = { _id?: string; id?: string; studentId: string; studentName?: string; studentEmail?: string };
type SessionRow = { _id?: string; id?: string; courseId: string; teacherId: string; date: string; startTime?: string; endTime?: string; status: string };
type AttendanceRecord = { studentId: string; status: "present" | "absent" | "excused" };
type AttendanceStatus = "present" | "absent" | "excused";

const statusTone: Record<AttendanceStatus, StatusTone> = {
  present: "success",
  absent: "danger",
  excused: "warning",
};

export function TeacherAttendanceScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { data: identity } = useGetIdentity<Identity>();
  const teacherId = identity?.id;
  const { queueCount, isSyncing, flush } = useAttendanceSync(teacherId);

  const { query: sessionsQuery, result: sessionsResult } = useList<SessionRow>({
    resource: "sessions",
    filters: teacherId ? [{ field: "teacherId", operator: "eq", value: teacherId }] : undefined,
    queryOptions: { enabled: !!teacherId },
    pagination: { mode: "off" },
  });

  const allSessions = (sessionsResult?.data ?? []) as SessionRow[];

  const recentSessions = useMemo(() => {
    const now = dayjs();
    return allSessions
      .filter((s) => {
        const d = dayjs(s.date);
        return d.isAfter(now.subtract(14, "day")) && d.isBefore(now.add(1, "day")) && s.status !== "cancelled";
      })
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
  }, [allSessions]);

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const sessionId = selectedSession?.id || selectedSession?._id;

  const { result: enrollmentsResult } = useList<EnrollmentRow>({
    resource: "enrollments",
    filters: selectedSession ? [{ field: "courseId", operator: "eq", value: selectedSession.courseId }] : undefined,
    queryOptions: { enabled: !!selectedSession },
    pagination: { mode: "off" },
  });
  const enrollments = (enrollmentsResult?.data ?? []) as EnrollmentRow[];

  const { query: attendanceQuery, result: attendanceResult } = useCustom<{ locked: boolean; records: AttendanceRecord[] }>({
    url: sessionId ? `sessions/${sessionId}/attendance` : "",
    method: "get",
    queryOptions: { enabled: !!sessionId },
  });
  const locked = (attendanceResult?.data as any)?.locked ?? false;
  const existingRecords = (attendanceResult?.data as any)?.records ?? [];

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  React.useEffect(() => {
    if (!selectedSession) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const e of enrollments) {
      next[e.studentId] = "present";
    }
    for (const r of existingRecords) {
      next[r.studentId] = r.status;
    }
    setStatuses(next);
  }, [selectedSession, enrollments.length, existingRecords.length]);

  const { mutate: saveAttendance, mutation: saveMutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const handleSave = async () => {
    if (!sessionId) return;
    const records: AttendanceRecord[] = enrollments.map((e) => ({
      studentId: e.studentId,
      status: statuses[e.studentId] ?? "present",
    }));

    // Offline: PUT would just fail — queue instead and let useAttendanceSync
    // replay it through the offline sync endpoint once back online.
    if (teacherId && typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueAttendance(teacherId, sessionId, records);
      toast.info(t("teacher.savedOffline"));
      return;
    }

    saveAttendance(
      {
        url: `sessions/${sessionId}/attendance`,
        method: "put",
        values: { records } as any,
        config: { headers: {} },
      },
      {
        onSuccess: () => {
          toast.success(t("teacher.saved"));
          invalidate({ resource: "sessions", invalidates: ["list"] });
        },
        onError: (err) => {
          toast.error((err as { message?: string })?.message || t("teacher.saveError"));
        },
      },
    );
  };

  const handleSyncNow = async () => {
    const result = await flush();
    if (result.status === "empty") toast.info(t("teacher.syncNothingToSync"));
    else if (result.status === "offline") toast.warning(t("teacher.syncOffline"));
    else {
      toast.success(t("teacher.syncedCount", { n: result.synced }));
      const skipped = result.conflicts + result.errors;
      if (skipped > 0) toast.info(t("teacher.skippedCount", { n: skipped }));
    }
  };

  const sessionColumns: ColumnDef<SessionRow>[] = [
    {
      id: "date",
      header: t("teacher.date"),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span>
            {formatDate(s.date, { weekday: "short", month: "short", day: "numeric" })} · {s.startTime}–{s.endTime}
          </span>
        );
      },
    },
    {
      id: "status",
      header: t("teacher.status"),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <StatusBadge tone={s.status === "completed" ? "success" : s.status === "scheduled" ? "info" : "neutral"}>
            {t(asKey("status." + s.status))}
          </StatusBadge>
        );
      },
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" onClick={() => setSelectedSession(row.original)}>
          {t("teacher.markAttendance")}
        </Button>
      ),
    },
  ];

  const rosterColumns: ColumnDef<EnrollmentRow>[] = [
    {
      id: "name",
      header: t("teacher.student"),
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-semibold">{e.studentName || e.studentId}</span>
            {e.studentEmail && <span className="text-xs text-muted-foreground">{e.studentEmail}</span>}
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("teacher.status"),
      cell: ({ row }) => {
        const e = row.original;
        const v = statuses[e.studentId] ?? "present";
        return (
          <ToggleGroup
            type="single"
            value={v}
            disabled={locked}
            onValueChange={(val) => {
              if (val) setStatuses((s) => ({ ...s, [e.studentId]: val as AttendanceStatus }));
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="present">
              <CheckCircle2 className="size-3.5" /> {t("status.present")}
            </ToggleGroupItem>
            <ToggleGroupItem value="absent">
              <XCircle className="size-3.5" /> {t("status.absent")}
            </ToggleGroupItem>
            <ToggleGroupItem value="excused">
              <Clock className="size-3.5" /> {t("status.excused")}
            </ToggleGroupItem>
          </ToggleGroup>
        );
      },
    },
    {
      id: "tag",
      header: t("teacher.tag"),
      cell: ({ row }) => {
        const v = statuses[row.original.studentId] ?? "present";
        return <StatusBadge tone={statusTone[v]}>{t(asKey("status." + v))}</StatusBadge>;
      },
    },
  ];

  let content: React.ReactNode;

  if (selectedSession) {
    const sessionComposition = [
      {
        label: formatDate(selectedSession.date, { month: "short", day: "numeric" }),
        present: Object.values(statuses).filter((s) => s === "present").length,
        absent: Object.values(statuses).filter((s) => s === "absent").length,
        excused: Object.values(statuses).filter((s) => s === "excused").length,
      },
    ];

    content = (
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {`${t("teacher.attendance")} — ${formatDate(selectedSession.date, { weekday: "short", month: "short", day: "numeric" })} · ${selectedSession.startTime}–${selectedSession.endTime}`}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSelectedSession(null)}>
              {t("teacher.back")}
            </Button>
            <Button
              disabled={locked || enrollments.length === 0 || saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending && <Spinner />}
              {t("teacher.saveAttendance")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked && (
            <Alert className="bg-warning/12 text-warning">
              <AlertTriangle />
              <AlertTitle>{t("teacher.editClosed")}</AlertTitle>
              <AlertDescription>{t("teacher.editClosedDesc")}</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("teacher.composition")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={sessionComposition}
                series={[
                  { key: "present", label: t("status.present"), color: "var(--success)" },
                  { key: "absent", label: t("status.absent"), color: "var(--destructive)" },
                  { key: "excused", label: t("status.excused"), color: "var(--warning)" },
                ]}
                stacked
              />
            </CardContent>
          </Card>
          {attendanceQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={rosterColumns}
              data={enrollments}
              pageSize={100}
              emptyState={t("teacher.noStudents")}
            />
          )}
        </CardContent>
      </Card>
    );
  } else {
    content = (
      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("teacher.takeAttendance")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("teacher.last14Days")}</span>
        </CardHeader>
        <CardContent>
          {sessionsQuery.isLoading ? (
            <PageSpinner label={t("teacher.loadingSessions")} />
          ) : recentSessions.length === 0 ? (
            <EmptyState icon={CalendarOff} title={t("teacher.noRecentSessions")} />
          ) : (
            <DataTable
              columns={sessionColumns}
              data={recentSessions}
              pageSize={10}
              emptyState={t("teacher.noRecentSessions")}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {queueCount > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-info/12 px-4 py-3 text-sm text-info"
        >
          <div className="flex items-center gap-2 font-medium">
            <CloudOff className="size-4 shrink-0" />
            {t("teacher.pendingSync", { n: queueCount })}
          </div>
          <Button size="sm" variant="outline" disabled={isSyncing} onClick={handleSyncNow}>
            {isSyncing && <Spinner />}
            {t("teacher.syncNow")}
          </Button>
        </div>
      )}
      {content}
    </div>
  );
}
