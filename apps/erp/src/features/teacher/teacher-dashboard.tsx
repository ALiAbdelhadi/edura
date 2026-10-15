"use client";

import { useMemo } from "react";
import { useCustom, useList } from "@refinedev/core";
import { QUERY_FRESHNESS } from "@/lib/refine";
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
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
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
} from "@repo/shared/date-key";

type SessionRow = {
  id?: string;
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
  centerId?: string | null;
  location?: string | null;
};

const CAIRO_HM = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLATFORM_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

const sessionId = (s: SessionRow) => s.id || "";
const dayKeyOf = (s: SessionRow) => platformDayKey(String(s.date));

export function TeacherDashboard() {
  const t = useTranslations();
  const { formatPercent, formatDate, formatClockRange, formatEGP } = useFormatters();
  const queryStrings = useQueryStrings();
  const { query, result } = useCustom({ url: "dashboards/teacher", method: "get" });
  const tour = useTourGate();

  const today = todayKey();

  const { result: sessionsResult } = useList<SessionRow>({
    resource: "sessions",
    filters: [
      { field: "from", operator: "eq", value: shiftDayKey(today, -30) },
      { field: "to", operator: "eq", value: shiftDayKey(today, 14) },
    ],
    pagination: { mode: "off" },
  });
  const sessions = asArray<SessionRow>(sessionsResult?.data);

  const { query: walletQuery, result: walletResult } = useCustom<{
    balance: number;
    available: number;
  }>({ url: "teacher/wallet", method: "get" });

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
        return (s.endTime ?? s.startTime ?? "") >= nowHm;
      }) ?? null
    );
  }, [liveSessions, today]);

  const { result: coursesResult } = useList<CourseRow>({
    resource: "courses",
    pagination: { mode: "off" },
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: !!nextSession },
  });
  const { result: affiliationsResult } = useCustom<any[]>({
    url: "me/affiliations",
    method: "get",
    queryOptions: { enabled: !!nextSession },
  });

  const placeOf = useMemo(() => {
    const centerNames = new Map<string, string>();
    for (const a of asArray<any>(affiliationsResult?.data)) {
      if (a?.center?.id && a?.center?.name) centerNames.set(a.center.id, a.center.name);
    }
    const byCourse = new Map<string, string>();
    for (const c of asArray<CourseRow>(coursesResult?.data)) {
      const id = c.id;
      if (!id) continue;
      const label = c.centerId
        ? (centerNames.get(c.centerId) ?? "")
        : (c.location?.trim() || t("teacher.yourGroup"));
      if (label) byCourse.set(id, label);
    }
    return byCourse;
  }, [coursesResult?.data, affiliationsResult?.data, t]);

  const isRunningNow = useMemo(() => {
    if (!nextSession || dayKeyOf(nextSession) !== today) return false;
    const nowHm = CAIRO_HM.format(new Date());
    return (nextSession.startTime ?? "") <= nowHm;
  }, [nextSession, today]);

  const unsettled = useMemo(
    () =>
      liveSessions.filter(
        (s) =>
          dayKeyOf(s) < today &&
          (s.status === "scheduled" || s.status === "postponed"),
      ),
    [liveSessions, today],
  );

  const payload = asRecord<any>(result?.data);
  const data = payload ?? {};

  if (query.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => query.refetch()}
        retryLabel={queryStrings.retry}
      />
    );
  }

  if (!payload) {
    return <PageSkeleton />;
  }

  const wallet = walletResult?.data;
  const counterOnlyTotal = typeof data.counterOnlyToday === "number" ? data.counterOnlyToday : 0;

  const heroPlace = nextSession
    ? [nextSession.roomName, placeOf.get(nextSession.courseId)]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="space-y-4">

      <GuidedTour
        steps={TEACHER_TOUR_STEPS}
        namespace="teacher.teacherTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

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

      <Link href="/dashboard/teacher/wallet" className="block">
        <Card>
          <CardContent className="flex items-center gap-3">
            <Wallet className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("teacher.yourMoney")}
              </span>
              {walletQuery.isError ? (
                <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-lg font-bold text-foreground">—</span>
                  <span className="text-xs text-muted-foreground">
                    {queryStrings.unavailable}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline"
                    onClick={(e) => {
                      // inside a Link — retry must not navigate
                      e.preventDefault();
                      e.stopPropagation();
                      walletQuery.refetch();
                    }}
                  >
                    {queryStrings.retry}
                  </button>
                </span>
              ) : (
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
              )}
            </span>
            <ChevronLeft className="size-5 shrink-0 rtl:rotate-180 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

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
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {t("teacher.attendancePct")}
                <span className="block">{t("teacher.lifetimeHint")}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

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
