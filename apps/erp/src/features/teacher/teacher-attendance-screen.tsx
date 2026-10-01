"use client";

import React, { useState, useMemo } from "react";
import {
  useGetIdentity,
  useList,
  useCustom,
  useCustomMutation,
  useInvalidate,
} from "@refinedev/core";
import {
  CheckCircle2,
  XCircle,
  Clock,
  CalendarOff,
  AlertTriangle,
  CloudOff,
  DoorOpen,
} from "lucide-react";
import dayjs from "dayjs";
import { SettleLessonCard } from "../attendance/settle-lesson-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Alert, AlertTitle, AlertDescription } from "@repo/ui/components/alert";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { combineQueries, QuerySection } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { resolveStudentCode } from "@repo/shared/student-code";
import { platformDayKey, todayKey } from "@repo/shared/date-key";
import { useParamSeed } from "@/lib/api/use-param-seed";
import { codeFromScan } from "@/lib/attendance/scanned-code";
import { QrScannerButton } from "@/components/kit/qr-scanner-button";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner, PageSpinner } from "@/components/kit/spinner";
import { useTranslations } from "next-intl";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { enqueueAttendance } from "@/lib/pwa/attendance-outbox";
import { useAttendanceSync } from "@/lib/pwa/use-attendance-sync";
type Identity = { id: string; name?: string; email?: string };
type EnrollmentRow = {
  id?: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  studentCode?: string | null;
};
type SessionRow = {
  id?: string;
  courseId: string;
  teacherId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
  courseName?: string;
  roomName?: string;
};
type AttendanceRecord = {
  studentId: string;
  status: "present" | "absent" | "excused" | "counter_only";
};
type AttendanceStatus = "present" | "absent" | "excused" | "counter_only";

export const ATTENDANCE_WINDOW_DAYS = 14;

export function TeacherAttendanceScreen() {
  const t = useTranslations();
  const { formatDate, formatClockRange } = useFormatters();
  const { data: identity } = useGetIdentity<Identity>();
  const teacherId = (identity as any)?.actingTeacherId ?? identity?.id;
  const { queueCount, isSyncing, flush, refreshCount } =
    useAttendanceSync(teacherId);

  const { query: sessionsQuery, result: sessionsResult } = useList<SessionRow>({
    resource: "sessions",
    filters: teacherId
      ? [{ field: "teacherId", operator: "eq", value: teacherId }]
      : undefined,
    queryOptions: { enabled: !!teacherId },
    pagination: { mode: "off" },
  });

  const allSessions = (sessionsResult?.data ?? []) as SessionRow[];

  const recentSessions = useMemo(() => {
    const now = dayjs();
    return allSessions
      .filter((s) => {
        const d = dayjs(s.date);
        return (
          d.isAfter(now.subtract(ATTENDANCE_WINDOW_DAYS, "day")) &&
          d.isBefore(now.add(1, "day")) &&
          s.status !== "cancelled"
        );
      })
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
  }, [allSessions]);

  const today = todayKey();
  const dayKeyOf = (s: SessionRow) => platformDayKey(String(s.date));
  const todaySessions = useMemo(
    () => recentSessions.filter((s) => dayKeyOf(s) === today),
    [recentSessions, today],
  );
  const earlierSessions = useMemo(
    () => recentSessions.filter((s) => dayKeyOf(s) !== today),
    [recentSessions, today],
  );

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(
    null,
  );
  const sessionId = selectedSession?.id;

  const [seedSessionId, setSeedSessionId] = useState<string | null>(null);
  useParamSeed("sessionId", setSeedSessionId);
  React.useEffect(() => {
    if (!seedSessionId || selectedSession) return;
    const hit = recentSessions.find((s) => (s.id) === seedSessionId);
    if (hit) {
      setSelectedSession(hit);
      setSeedSessionId(null);
    }
  }, [seedSessionId, recentSessions, selectedSession]);

  const { query: enrollmentsQuery, result: enrollmentsResult } = useList<EnrollmentRow>({
    resource: "enrollments",
    filters: selectedSession
      ? [{ field: "courseId", operator: "eq", value: selectedSession.courseId }]
      : undefined,
    queryOptions: { enabled: !!selectedSession },
    pagination: { mode: "off" },
  });
  const enrollments = (enrollmentsResult?.data ?? []) as EnrollmentRow[];

  const { query: attendanceQuery, result: attendanceResult } = useCustom<{
    locked: boolean;
    records: AttendanceRecord[];
  }>({
    url: sessionId ? `sessions/${sessionId}/attendance` : "",
    method: "get",
    queryOptions: { enabled: !!sessionId },
  });
  const locked = (attendanceResult?.data as any)?.locked ?? false;
  const existingRecords = (attendanceResult?.data as any)?.records ?? [];

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    {},
  );

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

  const markScanned = (raw: string) => {
    if (locked) {
      toast.error(t("teacher.editClosed"));
      return;
    }
    const code = codeFromScan(raw);
    const hit = code
      ? enrollments.find(
          (e) => e.studentCode && resolveStudentCode(e.studentCode) === code,
        )
      : null;
    if (!hit) {
      toast.error(t("teacher.scanNotEnrolled"));
      return;
    }
    setStatuses((s) => ({ ...s, [hit.studentId]: "present" }));
    toast.success(
      t("teacher.scanMarkedPresent", { name: hit.studentName || hit.studentId }),
    );
  };

  const { mutate: saveAttendance, mutation: saveMutation } =
    useCustomMutation();
  const invalidate = useInvalidate();

  const handleSave = async () => {
    if (!sessionId) return;
    const records = enrollments
      .map((e) => ({
        studentId: e.studentId,
        status: statuses[e.studentId] ?? ("present" as const),
      }))
      .filter(
        (r): r is { studentId: string; status: "present" | "absent" | "excused" } =>
          r.status !== "counter_only",
      );

    if (teacherId && typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueAttendance(teacherId, sessionId, records);
      await refreshCount();
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
        onError: async (err) => {
          // statusCode 0 is the classifier's "never reached the server"
          // (offline or timed out). `navigator.onLine` can report true on a
          // dead connection, so the failure itself — not the flag — is what
          // sends these marks to the outbox.
          const e = err as { statusCode?: number; message?: string };
          if (teacherId && e?.statusCode === 0) {
            await enqueueAttendance(teacherId, sessionId, records);
            await refreshCount();
            toast.info(t("teacher.savedOffline"));
            return;
          }
          toast.error(e?.message || t("teacher.saveError"));
        },
      },
    );
  };

  const handleSyncNow = async () => {
    const result = await flush({ force: true });
    if (result.status === "empty") toast.info(t("teacher.syncNothingToSync"));
    else if (result.status === "offline")
      toast.warning(t("teacher.syncOffline"));
    else if (result.status === "failed") {
      toast.error(result.message || t("teacher.syncFailed"));
    } else {
      toast.success(t("teacher.syncedCount", { n: result.synced }));
      if (result.conflicts > 0) toast.info(t("teacher.skippedCount", { n: result.conflicts }));
      if (result.rejected > 0)
        toast.warning(t("teacher.syncRejectedKept", { n: result.rejected }));
    }
  };

  const groupNameOf = (s: SessionRow) => s.courseName || t("teacher.groupUnnamed");

  const sessionStatusTone = (status: string): StatusTone =>
    status === "completed" ? "success" : status === "scheduled" ? "info" : "neutral";

  const sessionRow = (s: SessionRow) => (
    <button
      type="button"
      onClick={() => setSelectedSession(s)}
      className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-foreground">
          {groupNameOf(s)}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {formatDate(s.date, { weekday: "short", month: "short", day: "numeric" })}
          {" · "}
          {formatClockRange(s.startTime, s.endTime)}
          {s.roomName ? ` · ${s.roomName}` : ""}
        </span>
      </span>
      <StatusBadge tone={sessionStatusTone(s.status)}>
        {t(asKey("status." + s.status))}
      </StatusBadge>
    </button>
  );

  const sessionGroup = (key: string, heading: string, rows: SessionRow[]) => {
    if (rows.length === 0) return null;
    return (
      <div key={key}>
        <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        <ul className="divide-y divide-border border-y border-border">
          {rows.map((s) => (
            <li key={s.id}>{sessionRow(s)}</li>
          ))}
        </ul>
      </div>
    );
  };

  const rosterRow = (e: EnrollmentRow, options: AttendanceStatus[]) => {
    const v = statuses[e.studentId] ?? "present";
    return (
      <div
        key={e.studentId}
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">
            {e.studentName || e.studentId}
          </span>
          {e.studentCode ? (
            <span
              className="mt-0.5 block font-mono text-xs text-muted-foreground"
              dir="ltr"
            >
              {e.studentCode}
            </span>
          ) : null}
        </span>
        <ToggleGroup
          type="single"
          value={options.includes(v) ? v : ""}
          disabled={locked}
          onValueChange={(val) => {
            if (val)
              setStatuses((s) => ({
                ...s,
                [e.studentId]: val as AttendanceStatus,
              }));
          }}
          variant="outline"
          size="sm"
        >
          {options.includes("present") && (
            <ToggleGroupItem value="present">
              <CheckCircle2 className="size-3.5" /> {t("status.present")}
            </ToggleGroupItem>
          )}
          {options.includes("absent") && (
            <ToggleGroupItem value="absent">
              <XCircle className="size-3.5" /> {t("status.absent")}
            </ToggleGroupItem>
          )}
          {options.includes("excused") && (
            <ToggleGroupItem value="excused">
              <Clock className="size-3.5" /> {t("status.excused")}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </div>
    );
  };

  let content: React.ReactNode;

  if (selectedSession) {
    const pending = enrollments.filter(
      (e) => (statuses[e.studentId] ?? "present") === "counter_only",
    );
    const settled = enrollments.filter(
      (e) => (statuses[e.studentId] ?? "present") !== "counter_only",
    );
    const counts = {
      present: settled.filter((e) => statuses[e.studentId] === "present").length,
      absent: settled.filter((e) => statuses[e.studentId] === "absent").length,
      excused: settled.filter((e) => statuses[e.studentId] === "excused").length,
    };

    content = (
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {groupNameOf(selectedSession)}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(selectedSession.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {" · "}
              {formatClockRange(
                selectedSession.startTime,
                selectedSession.endTime,
              )}
              {selectedSession.roomName ? ` · ${selectedSession.roomName}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QrScannerButton
              onScan={markScanned}
              label={t("teacher.scanCard")}
              title={t("teacher.scanTitle")}
              hint={t("teacher.scanHint")}
              deniedMessage={t("teacher.scanDenied")}
              className="h-9 px-2 text-[13px]"
            />
            <Button variant="outline" onClick={() => setSelectedSession(null)}>
              {t("teacher.back")}
            </Button>
            <Button
              disabled={
                locked || enrollments.length === 0 || saveMutation.isPending
              }
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

          <QuerySection
            query={combineQueries(enrollmentsQuery, attendanceQuery)}
            skeleton={<PageSpinner />}
          >
            <>
              {pending.length > 0 && (
                <section className="overflow-hidden rounded-lg border-2 border-warning/50 bg-warning/5">
                  <header className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
                    <DoorOpen className="size-4 shrink-0 text-warning" />
                    <h3 className="font-semibold text-warning">
                      {t("teacher.statusCounterOnly")}
                    </h3>
                    <span
                      className="rounded-full bg-warning/20 px-2 text-sm font-semibold text-warning"
                      dir="ltr"
                    >
                      {pending.length}
                    </span>
                  </header>
                  <p className="px-4 pb-2 text-xs text-muted-foreground">
                    {t("teacher.counterOnlyHint")}
                  </p>
                  <div className="divide-y divide-warning/20 border-t border-warning/20">
                    {pending.map((e) => rosterRow(e, ["present", "absent"]))}
                  </div>
                </section>
              )}

              {enrollments.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("teacher.rosterCounts", counts)}
                </p>
              )}

              {enrollments.length === 0 ? (
                <EmptyState title={t("teacher.noStudents")} />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {settled.map((e) =>
                    rosterRow(e, ["present", "absent", "excused"]),
                  )}
                </div>
              )}
            </>
          </QuerySection>

          {sessionId ? <SettleLessonCard sessionId={sessionId} /> : null}
        </CardContent>
      </Card>
    );
  } else {
    content = (
      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("teacher.takeAttendance")}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {t("teacher.last14Days")}
          </span>
        </CardHeader>
        <CardContent className="px-0">
          <QuerySection
            query={sessionsQuery}
            skeleton={<PageSpinner label={t("teacher.loadingSessions")} />}
            className="mx-4"
            isEmpty={recentSessions.length === 0}
            empty={
              <div className="px-4">
                <EmptyState
                  icon={CalendarOff}
                  title={t("teacher.noRecentSessions")}
                />
              </div>
            }
          >
            <div>
              {sessionGroup("today", t("teacher.todayHeading"), todaySessions)}
              {sessionGroup(
                "earlier",
                t("teacher.earlierHeading"),
                earlierSessions,
              )}
            </div>
          </QuerySection>
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
          <Button
            size="sm"
            variant="outline"
            disabled={isSyncing}
            onClick={handleSyncNow}
          >
            {isSyncing && <Spinner />}
            {t("teacher.syncNow")}
          </Button>
        </div>
      )}
      {content}
    </div>
  );
}
