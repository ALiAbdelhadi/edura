"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustom, useList } from "@refinedev/core";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  DoorOpen,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { StatusBadge } from "@/components/kit/status-badge";
import { BarChart, LineChart } from "@/components/charts";
import { teacherAttendanceLineSeries, teacherGradeLoadBarData } from "@/lib/analytics/transforms";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSkeleton } from "@/components/ui/skeletons";
import { asArray } from "@/lib/refine/as-array";
import { asRecord } from "@/lib/refine/as-record";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { TEACHER_TOUR_STEPS } from "@/features/teacher/tour/steps";
import {
  PLATFORM_TIME_ZONE,
  platformDayKey,
  shiftDayKey,
  todayKey,
} from "@repo/server-core/lib/date-key";

type SessionRow = {
  id?: string;
  _id?: string;
  courseId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
  courseName?: string;
  roomName?: string;
};

type CourseRow = {
  id?: string;
  _id?: string;
  /** NULL = teacher-direct (decision #2: no shadow centers). */
  centerId?: string | null;
  /** Teacher-direct free-text venue ("own hall", "Online", …). */
  location?: string | null;
};

/** Cairo wall-clock `HH:mm`, to compare against a session's own `startTime`. */
const CAIRO_HM = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLATFORM_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

const sessionId = (s: SessionRow) => s.id || s._id || "";
const dayKeyOf = (s: SessionRow) => platformDayKey(String(s.date));

/**
 * ONE REQUEST PER LESSON RUNNING TODAY, and no more than that.
 *
 * There is no teacher-scoped attendance read — `teacher/attendance` is a sync
 * POST only — so the count of "paid, in the building, never reached the hall"
 * has to come from each of today's sessions. A teacher has a handful of
 * lessons in a day, and this is the number that costs them money, so the
 * fan-out is worth it. It is deliberately bounded to TODAY: over a week it
 * would be dozens of requests for a figure nobody acts on retroactively.
 */
function CounterOnlyProbe({
  id,
  onCount,
}: {
  id: string;
  onCount: (id: string, n: number) => void;
}) {
  const { result } = useCustom<{ records?: { status: string }[] }>({
    url: `sessions/${id}/attendance`,
    method: "get",
    queryOptions: { enabled: !!id },
  });
  const records = (result?.data as any)?.records ?? [];
  const n = records.filter((r: any) => r.status === "counter_only").length;
  // Reported from an effect, never during render: the parent stores by id and
  // ignores an unchanged value, so a re-render with the same count writes
  // nothing and the loop closes.
  useEffect(() => {
    onCount(id, n);
  }, [id, n, onCount]);
  return null;
}

export function TeacherDashboard() {
  const t = useTranslations();
  const { formatPercent, formatDate, formatClockRange, formatEGP } = useFormatters();
  const { result } = useCustom({ url: "dashboards/teacher", method: "get" });
  // Declared with the other hooks: the gate cannot sit behind the loading
  // branch below, or the tour would never mount while data is in flight.
  const tour = useTourGate();

  const today = todayKey();

  /* THE HERO READS `sessions`, NOT `dashboards/teacher`.
     The dashboard payload's `todaySessions` carries `subject` and `room` but
     no GROUP TITLE and no CENTER, so two chemistry groups an hour apart were
     the same row and a teacher working three buildings could not tell which
     one to drive to. `sessions` has always enriched every row with
     `courseName` and `roomName`. The window spans backwards as well as
     forwards because the same payload answers "which lessons are still not
     closed" — money already earned and not yet credited. */
  const { result: sessionsResult } = useList<SessionRow>({
    resource: "sessions",
    filters: [
      { field: "from", operator: "eq", value: shiftDayKey(today, -30) },
      { field: "to", operator: "eq", value: shiftDayKey(today, 14) },
    ],
    pagination: { mode: "off" },
  });
  const sessions = asArray<SessionRow>(sessionsResult?.data);

  /* WHICH BUILDING. `courses` carries `centerId` (NULL = teacher-direct) and
     the free-text `location`; `me/affiliations` carries each center's NAME.
     Two reads this portal already makes elsewhere, joined on the client —
     `sessions` itself exposes no center (flagged as T-8). */
  const { result: coursesResult } = useList<CourseRow>({
    resource: "courses",
    pagination: { mode: "off" },
  });
  const { result: affiliationsResult } = useCustom<any[]>({
    url: "me/affiliations",
    method: "get",
  });

  const { result: walletResult } = useCustom<{
    balance: number;
    available: number;
  }>({ url: "teacher/wallet", method: "get" });

  const [counterOnly, setCounterOnly] = useState<Record<string, number>>({});
  const reportCounterOnly = useCallback((id: string, n: number) => {
    setCounterOnly((prev) => (prev[id] === n ? prev : { ...prev, [id]: n }));
  }, []);

  const placeOf = useMemo(() => {
    const centerNames = new Map<string, string>();
    /* `asArray`, NOT `?? []`. refine hands back a FROZEN PLACEHOLDER OBJECT
       while a `useCustom` query is idle, so `data` is `{}` — not undefined —
       and the nullish default never fires. Iterating that threw
       "object is not iterable" and the whole dashboard fell to its error
       boundary on first paint. The same trap is documented in
       `assistant-delegation-strip.tsx` and guarded the same way in
       `teacher-affiliations-screen.tsx`: narrow on the VALUE, never on the
       generic. */
    for (const a of asArray<any>(affiliationsResult?.data)) {
      if (a?.center?.id && a?.center?.name) centerNames.set(a.center.id, a.center.name);
    }
    const byCourse = new Map<string, string>();
    for (const c of asArray<CourseRow>(coursesResult?.data)) {
      const id = c.id || c._id;
      if (!id) continue;
      // A teacher-direct group has no center by design, so its venue is
      // whatever the teacher typed — and "your own group" if they typed
      // nothing. Printing an empty string would read as a missing center.
      const label = c.centerId
        ? (centerNames.get(c.centerId) ?? "")
        : (c.location?.trim() || t("teacher.yourGroup"));
      if (label) byCourse.set(id, label);
    }
    return byCourse;
  }, [coursesResult?.data, affiliationsResult?.data, t]);

  const liveSessions = useMemo(
    () => sessions.filter((s) => s.status !== "cancelled"),
    [sessions],
  );

  const todaySessions = useMemo(
    () =>
      liveSessions
        .filter((s) => dayKeyOf(s) === today)
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
    [liveSessions, today],
  );

  /** The next lesson: still running or still to come, today or later. */
  const nextSession = useMemo(() => {
    const nowHm = CAIRO_HM.format(new Date());
    const ordered = [...liveSessions].sort((a, b) => {
      const d = dayKeyOf(a).localeCompare(dayKeyOf(b));
      return d !== 0 ? d : (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
    return (
      ordered.find((s) => {
        const day = dayKeyOf(s);
        if (day > today) return true;
        if (day < today) return false;
        // `HH:mm` strings are zero-padded, so a plain compare is a time compare.
        return (s.endTime ?? s.startTime ?? "") >= nowHm;
      }) ?? null
    );
  }, [liveSessions, today]);

  const isRunningNow = useMemo(() => {
    if (!nextSession || dayKeyOf(nextSession) !== today) return false;
    const nowHm = CAIRO_HM.format(new Date());
    return (nextSession.startTime ?? "") <= nowHm;
  }, [nextSession, today]);

  /* MONEY ALREADY EARNED AND NOT YET CREDITED.
     Closing a lesson is what moves the teacher's share into their wallet, and
     lesson-settlement.md records that no screen forces it on anybody. A lesson
     whose day has passed and which is still `scheduled` is exactly that. */
  const unsettled = useMemo(
    () =>
      liveSessions.filter(
        (s) =>
          dayKeyOf(s) < today &&
          (s.status === "scheduled" || s.status === "postponed"),
      ),
    [liveSessions, today],
  );

  const counterOnlyTotal = useMemo(
    () => Object.values(counterOnly).reduce((a, b) => a + b, 0),
    [counterOnly],
  );

  // The payload and the guard read the SAME value — see student-dashboard.
  const payload = asRecord<any>(result?.data);
  const data = payload ?? {};

  // Keyed on the payload, not isLoading — see student-dashboard.
  if (!payload) {
    return <PageSkeleton />;
  }

  const wallet = walletResult?.data;

  const heroPlace = nextSession
    ? [nextSession.roomName, placeOf.get(nextSession.courseId)]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="space-y-4">
      {/* First entry only: the guided tour of the REAL portal offers itself
          once, then never again (user_prefs.tour_completed).

          It replaces the emulator as the first-run surface, matching the
          student and parent portals: a tour is the right thing to MEET someone
          with (a minute, pointing at their own screen), and the emulator is the
          right thing to CHOOSE (ten minutes, a simulated world). The emulator
          is not lost — it keeps its permanent entry in the menu, now labelled
          "Practice", and this tour's last card points at it. Both cannot open
          on first run, because both read the same `tour_completed` flag. */}
      <GuidedTour
        steps={TEACHER_TOUR_STEPS}
        namespace="teacher.teacherTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {/* Probes render nothing; they only report today's counter_only counts. */}
      {todaySessions.map((s) => (
        <CounterOnlyProbe
          key={sessionId(s)}
          id={sessionId(s)}
          onCount={reportCounterOnly}
        />
      ))}

      {/* ── HERO ────────────────────────────────────────────────────────────
          "أروح فين، وإمتى، ومع مين" answered in one card. It was four stat
          cards and a table of subjects with no group and no building. */}
      <Card data-tour="teacher-next">
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("teacher.nextLesson")}
            </span>
            {isRunningNow ? (
              <StatusBadge tone="success">{t("teacher.nowLabel")}</StatusBadge>
            ) : nextSession && dayKeyOf(nextSession) === today ? (
              <StatusBadge tone="info">{t("teacher.todayHeading")}</StatusBadge>
            ) : null}
          </div>

          {nextSession ? (
            <Link
              href={`/dashboard/teacher/attendance?sessionId=${sessionId(nextSession)}`}
              className="flex items-center gap-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold text-foreground">
                  {nextSession.courseName || t("teacher.groupUnnamed")}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {formatDate(nextSession.date, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                  {" · "}
                  {formatClockRange(nextSession.startTime, nextSession.endTime)}
                </span>
                {heroPlace ? (
                  <span className="mt-0.5 block text-sm font-medium text-foreground">
                    {heroPlace}
                  </span>
                ) : null}
              </span>
              <ChevronLeft className="size-5 shrink-0 rtl:rotate-180 text-muted-foreground" />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("teacher.noNextLesson")}
            </p>
          )}

          {todaySessions.length > 1 ? (
            <p className="border-t border-border pt-2 text-xs text-muted-foreground">
              {t("teacher.moreToday", { n: todaySessions.length - 1 })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── ALERTS ──────────────────────────────────────────────────────────
          Conditional, never permanent. Both are money: one is a child who paid
          and never reached the hall, the other is a lesson taught but never
          closed. */}
      {counterOnlyTotal > 0 ? (
        <Link
          href="/dashboard/teacher/attendance"
          className="flex items-center gap-2 rounded-lg border-2 border-warning/50 bg-warning/5 px-4 py-3 text-sm"
        >
          <DoorOpen className="size-4 shrink-0 text-warning" />
          <span className="flex-1 font-medium text-warning">
            {t("teacher.counterOnlyToday", { n: counterOnlyTotal })}
          </span>
          <ChevronLeft className="size-4 shrink-0 rtl:rotate-180 text-warning" />
        </Link>
      ) : null}

      {unsettled.length > 0 ? (
        <Link
          href="/dashboard/teacher/attendance"
          className="flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber" />
          <span className="flex-1 font-medium text-foreground">
            {t("teacher.unsettledCount", { n: unsettled.length })}
          </span>
          <ChevronLeft className="size-4 shrink-0 rtl:rotate-180 text-muted-foreground" />
        </Link>
      ) : null}

      {/* ── MONEY ───────────────────────────────────────────────────────────
          The portal that holds a teacher's income showed no money figure on
          its home screen at all, and the wallet itself sat behind the "more"
          sheet. Balance and what is actually withdrawable are different
          numbers; both belong here, because the second is the one that
          answers "امتى أقدر أسحب؟". */}
      <Link href="/dashboard/teacher/wallet" className="block">
        <Card>
          <CardContent className="flex items-center gap-3">
            <Wallet className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("teacher.yourMoney")}
              </span>
              <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-lg font-bold text-foreground">
                  {formatEGP(wallet?.balance ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("teacher.teacherWallet.available")}:{" "}
                  <span className="font-medium text-foreground">
                    {formatEGP(wallet?.available ?? 0)}
                  </span>
                </span>
              </span>
            </span>
            <ChevronLeft className="size-5 shrink-0 rtl:rotate-180 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {/* ── THE RECORD ──────────────────────────────────────────────────────
          Three figures in ONE row, not four full-width cards. Each opens the
          page that owns it — the same index rule the student and parent homes
          follow. */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/dashboard/teacher/grades" className="block">
          <Card className="h-full">
            <CardContent className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-foreground">
                {data.pendingGradeEntries ?? 0}
              </div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {t("teacher.pendingGrades")}
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/teacher/classes" className="block">
          <Card className="h-full">
            <CardContent className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-foreground">
                {data.activeStudents ?? 0}
              </div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {t("teacher.totalStudents")}
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/teacher/attendance" className="block">
          <Card className="h-full">
            <CardContent className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-foreground">
                {formatPercent(data.avgAttendanceRate ?? 0)}
              </div>
              {/* LABELLED, because it cannot be bounded here. `getTeacherDashboard`
                  counts every attendance record ever with no date predicate, so
                  this is a lifetime figure — and it used to sit unqualified
                  beside "today's lessons", which reads as "these days".
                  Bounding it needs a `from`/`to` on the endpoint (T-7). */}
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {t("teacher.attendancePct")}
                <span className="block">{t("teacher.lifetimeHint")}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── TRENDS, below the day ───────────────────────────────────────────
          Both charts exist on no other screen, so neither is dropped — but a
          teacher between lessons is not reading a twelve-week trend, and on a
          phone these stood between them and their own timetable.

          AND ONE CHART WENT EARLIER: a "score distribution" card used to sit
          at the bottom of this dashboard, rendering the SAME chart, under the
          same title, in the same colour, as the one on /grades — except the
          gradebook's carries a per-assessment picker and this one could not be
          narrowed at all. Two answers to one question, and the weaker came
          first. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">{t("teacher.weeklyAttendanceTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={teacherAttendanceLineSeries(data.analytics?.attendanceTrend ?? [])}
              showArea
              yValueFormatter={(value) => formatPercent(Math.round(value))}
              emptyText={t("teacher.noAttendanceTrend")}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">{t("teacher.pendingVsGraded")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={teacherGradeLoadBarData((data.analytics?.gradeLoad ?? []).slice(0, 8))}
              series={[
                { key: "pending", label: t("teacher.pending"), color: "var(--warning)" },
                { key: "graded", label: t("teacher.graded"), color: "var(--success)" },
              ]}
              stacked
              emptyText={t("teacher.noGradeLoad")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
