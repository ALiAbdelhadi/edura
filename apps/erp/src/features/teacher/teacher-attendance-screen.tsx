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
import { toast } from "@repo/ui/components/sonner";
import { resolveStudentCode } from "@repo/database/student-code";
import { platformDayKey, todayKey } from "@repo/server-core/lib/date-key";
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
  _id?: string;
  id?: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  /** Null for a student whose profile predates student-code v2 issuance. */
  studentCode?: string | null;
};
type SessionRow = {
  _id?: string;
  id?: string;
  courseId: string;
  teacherId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
  /* WHICH GROUP, AND WHERE. Both come from `GET /api/v1/sessions`, which has
     always enriched every row with `courseName`, `subject`, `teacherName` and
     `roomName` — this screen simply never rendered them, and listed lessons by
     date and time alone. A teacher with four groups was picking a register by
     the clock, and two groups an hour apart looked identical. Optional in the
     type because a session whose course row is gone still has a date and a
     status, and losing its name must not lose the row. */
  courseName?: string;
  roomName?: string;
};
type AttendanceRecord = {
  studentId: string;
  status: "present" | "absent" | "excused" | "counter_only";
};
// counter_only (Step 6): passed the center counter but never door-checked in
// counter_and_door mode — visible to the teacher, NOT counted as present.
type AttendanceStatus = "present" | "absent" | "excused" | "counter_only";

/**
 * How far back this screen will show a lesson.
 *
 * EXPORTED because another screen links INTO here. The group list marks a past
 * lesson "لسه متقفلتش" and offers `?sessionId=`, and a link to a lesson older
 * than this window would land the teacher on a list that cannot contain it —
 * a door that opens onto nothing. One definition, both readers.
 */
export const ATTENDANCE_WINDOW_DAYS = 14;

export function TeacherAttendanceScreen() {
  const t = useTranslations();
  const { formatDate, formatClockRange } = useFormatters();
  const { data: identity } = useGetIdentity<Identity>();
  // Step 8: an assistant operates on their teacher's data.
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

  /* TODAY IS A CAIRO DAY, not the browser's, and a session's day is the CAIRO
     day its instant falls in — not the UTC date printed on the front of it.
     ════════════════════════════════════════════════════════════════════════
     `todayKey()` is the platform-clock helper the door screen already uses to
     ask the server for today's sessions, and the boundary the money screens
     settled on (docs/decisions/money-day-boundary.md).

     The second half is the trap, and it was measured on dev rather than
     assumed: `Session.date` is `@db.Timestamptz(6)`, NOT `@db.Date`, and rows
     do not sit at midnight UTC — one demo teacher's lessons are stored at
     12:00Z and another's at 21:00Z. `toDateKey`, whose doc comment names "a
     session's date" as its case, slices the UTC prefix; on the 21:00Z row that
     reads 2026-08-19 while Cairo has already turned over to the 20th, so a
     lesson happening TODAY would have filed itself under "earlier". Every
     Cairo-evening lesson is stored that way.

     `platformDayKey` resolves the instant to the Cairo day it falls in, which
     is right for all three shapes: a midnight-UTC date-only value, a midday
     timestamp, and a Cairo-midnight-stored-as-21:00Z one. */
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
  const sessionId = selectedSession?.id || selectedSession?._id;

  /* ARRIVING ON ONE LESSON'S REGISTER.
     The dashboard hero and the "لسه متقفلتش" chip on a group's session list
     both point at A LESSON, not at the list of them. This screen selects by
     object rather than by id, and the list is not loaded when the parameter
     arrives, so the seed is LATCHED into state and resolved once the sessions
     land. Same `useParamSeed` hand-off the gradebook and the group list
     already take for `?courseId=`.

     A seed that matches nothing — a lesson older than the 14-day window, or
     another teacher's — simply leaves the reader on the list, which is the
     honest outcome. */
  const [seedSessionId, setSeedSessionId] = useState<string | null>(null);
  useParamSeed("sessionId", setSeedSessionId);
  React.useEffect(() => {
    if (!seedSessionId || selectedSession) return;
    const hit = recentSessions.find((s) => (s.id || s._id) === seedSessionId);
    if (hit) {
      setSelectedSession(hit);
      setSeedSessionId(null);
    }
  }, [seedSessionId, recentSessions, selectedSession]);

  const { result: enrollmentsResult } = useList<EnrollmentRow>({
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

  /* مسح البطاقة هنا / Why the scan on THIS screen only moves a toggle.
     ════════════════════════════════════════════════════════════════════════
     This screen has exactly one commit — the Save button below — and a scan
     that wrote on its own would be a second one, racing the roster the teacher
     is still editing. So a card sets that student's toggle to `present` and
     nothing else; the teacher saves when the lesson is taken, as they already
     do. That also makes it work in `counter_only` mode, which the hall-door
     screen deliberately does not: this path never touches the counter/door
     stage machine, it fills in the same roster a tap fills in.

     A forged card therefore buys nothing — resolution is confined to students
     ALREADY enrolled in this course, every one of whom the teacher can mark
     present with a tap. See `codeFromScan` for why no signature is checked. */
  const markScanned = (raw: string) => {
    // `locked` is checked FIRST because it is true of the LESSON, not of the
    // card: once editing is closed nothing can be marked, so telling someone
    // their student "is not in this group" would send them looking for the
    // wrong problem. The button stays visible for the same reason the toggles
    // stay visible-but-disabled — the alert above says why.
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
    // Refusing by name is the honest outcome: the card may well be genuine and
    // simply belong to a student who is not in this group.
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
    // counter_only rows are stage-derived at the counter/door — the bulk save
    // must not overwrite them unless the teacher explicitly resolved them.
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
      // The pending-sync banner counts what is queued; without a refresh here
      // it stayed hidden until the next mount, so a teacher who saved a roster
      // offline saw a toast and then no sign the work was still held.
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
        onError: (err) => {
          toast.error(
            (err as { message?: string })?.message || t("teacher.saveError"),
          );
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
      // The server answered and refused. Saying "you are offline" here — which
      // is what this did before — sends the teacher to check their signal for a
      // problem that is not on their end.
      toast.error(result.message || t("teacher.syncFailed"));
    } else {
      toast.success(t("teacher.syncedCount", { n: result.synced }));
      const skipped = result.conflicts + result.errors;
      if (skipped > 0) toast.info(t("teacher.skippedCount", { n: skipped }));
    }
  };

  const groupNameOf = (s: SessionRow) => s.courseName || t("teacher.groupUnnamed");

  const sessionStatusTone = (status: string): StatusTone =>
    status === "completed" ? "success" : status === "scheduled" ? "info" : "neutral";

  /* A LESSON ROW, not a table row.
     The list was a three-column DataTable — date, status, a button — read on a
     375px phone between lessons. A row now leads with the GROUP, carries the
     hall beside the clock, and is itself the control: the whole row opens the
     register, so the tap target is the row rather than a button at the end of
     it.

     RENDER FUNCTIONS, NOT INNER COMPONENTS. Declaring these as components
     inside the screen gives React a NEW component type on every render, so it
     unmounts and remounts the subtree each time — which on the roster means
     every `ToggleGroup` is rebuilt on every status change, losing focus and
     any in-flight interaction. Returning elements from a plain function keeps
     one identity and still lets them close over `statuses` and `locked`. */
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
        {/* WRAPS, never truncates. Measured at 375px: with the day, the date
            and a 12-hour range already on this line, the hall was the part
            that fell off the end — "قاعة الأمل" rendering as "قاع…" — and the
            hall is the half of "where am I going?" that a teacher working
            three buildings actually needs. Two short lines beat one clipped
            one. */}
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
            <li key={s.id || s._id}>{sessionRow(s)}</li>
          ))}
        </ul>
      </div>
    );
  };

  /* THE ROSTER ROW. Name, then the student CODE — not the email.
     The code is what a teacher reads off a card at the door and what a family
     quotes at a counter; the email is a login credential nobody says out loud,
     and it was taking the one subordinate line a phone row has. */
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
        {/* No status badge beside the toggle. The toggle already SHOWS which
            value is selected; the badge that used to sit in a "الوسم" column
            40px away was the page saying the same thing twice. */}
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
    /* THE STATE THIS SCREEN EXISTS TO CATCH GETS ITS OWN SECTION.
       `counter_only` means a student paid at the counter, walked into the
       building, and never reached the classroom. It does NOT count as present
       and it is the teacher's money. It used to render as a `warning` badge
       — the identical amber as "excused" — sitting wherever the roster happened
       to sort it, so the one row that means "a child is lost in this building"
       was tonally indistinguishable from an authorised absence and had to be
       hunted for. Colour alone was never a signal; position and a count are.
       Resolving a row moves it out of this section and into the roster below,
       so the section is a queue that empties. */
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
            {/* Present on any device with a camera, iPhones included. Only a
                machine with no camera hides it, and there the roster's
                toggles are untouched, so nobody loses a capability. */}
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

          {attendanceQuery.isLoading ? (
            <PageSpinner />
          ) : (
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

              {/* The three counts, in one line of text.
                  This replaces a stacked bar chart that plotted exactly ONE
                  bar — three numbers rendered as a graph, directly above the
                  roster those same three numbers were being counted from. */}
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
          )}

          {/* Attendance is what the settlement reads, so closing the lesson
              belongs at the END of taking it — not on another screen. */}
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
          {sessionsQuery.isLoading ? (
            <PageSpinner label={t("teacher.loadingSessions")} />
          ) : recentSessions.length === 0 ? (
            <div className="px-4">
              <EmptyState
                icon={CalendarOff}
                title={t("teacher.noRecentSessions")}
              />
            </div>
          ) : (
            <div>
              {sessionGroup("today", t("teacher.todayHeading"), todaySessions)}
              {sessionGroup(
                "earlier",
                t("teacher.earlierHeading"),
                earlierSessions,
              )}
            </div>
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
