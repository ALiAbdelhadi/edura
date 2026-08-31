"use client";

import { PageSkeleton } from "@/components/ui/skeletons";
import { SetupChecklist } from "@/features/activation/setup-checklist";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom, useList } from "@refinedev/core";
import { BookOpen, CalendarCheck, Coins, GraduationCap, Inbox, TriangleAlert, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Amount, Eyebrow, MetricCard, Num, PageHead, Sheet, SheetHead } from "./ledger";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { CENTER_TOUR_STEPS } from "@/features/admin/tour/steps";
import { TodayTakingsCard } from "./today-takings-card";
import { awaitingSettlement, liveNow, type CenterSession } from "./center-day";
import {
  clashingSessionIds,
  type SchedulableSession,
} from "@repo/server-core/services/sessions/conflict-detector";
import { shiftDayKey, todayKey } from "@repo/server-core/lib/date-key";
import { Link } from "@/i18n/navigation";

interface DashboardData {
  totals: {
    students: number;
    teachers: number;
    activeCourses: number;
    revenue: number;
  };
  attendanceRate: number;
  todaySessions: unknown[];
  feeDefaulters: number;
  pendingEnrollmentRequests: number;
  external?: { teachers: number; courses: number; students: number; revenue: number };
  analytics?: {
    revenueVsExpenses?: Array<{ label: string; revenue: number; expenses: number; netProfit: number }>;
    sessionStatusMix?: Array<{ status: "scheduled" | "completed" | "cancelled" | "postponed"; count: number }>;
    attendanceByCourse?: Array<{ title: string; attendanceRatePct: number }>;
  };
}

export function AdminDashboard() {
  const t = useTranslations();
  const { formatShortEGP, formatPercent, locale } = useFormatters();
  const queryStrings = useQueryStrings();
  const tour = useTourGate();
  const { query, result } = useCustom<DashboardData>({
    url: "dashboards/admin",
    method: "get",
  });

  const day = todayKey();
  const { result: sessionsResult } = useList({
    resource: "sessions",
    filters: [
      { field: "from", operator: "eq", value: shiftDayKey(day, -6) },
      { field: "to", operator: "eq", value: day },
    ],
    pagination: { mode: "off" },
  });

  const d = result?.data as DashboardData | undefined;

  if (query.isLoading) {
    return <PageSkeleton />;
  }

  if (query.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => query.refetch()}
        retryLabel={queryStrings.retry}
      />
    );
  }

  const weekSessions = (sessionsResult?.data ?? []) as CenterSession[];
  const running = liveNow(weekSessions, new Date(), day);
  const unsettled = awaitingSettlement(weekSessions);
  const todaysSessions = weekSessions.filter(
    (x) => String(x.date ?? "").slice(0, 10) === day,
  );
  const clashCount = clashingSessionIds(
    todaysSessions as unknown as SchedulableSession[],
  ).size;

  const totals = d?.totals ?? { students: 0, teachers: 0, activeCourses: 0, revenue: 0 };
  const external = d?.external;
  const hasExternal = !!external && (external.teachers > 0 || external.revenue > 0);
  const attendanceRate = d?.attendanceRate ?? 0;
  const todaySessions = d?.todaySessions?.length ?? 0;
  const feeDefaulters = d?.feeDefaulters ?? 0;
  const pendingRequests = d?.pendingEnrollmentRequests ?? 0;

  const openDecisions = pendingRequests + feeDefaulters + unsettled.length + clashCount;

  return (
    <div className="flex flex-col gap-6">
      <GuidedTour
        steps={CENTER_TOUR_STEPS}
        namespace="adminHome.tour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      <PageHead
        title={
          openDecisions > 0
            ? t("adminHome.queue_title", { n: openDecisions })
            : t("adminHome.queue_titleNone")
        }
        subtitle={openDecisions > 0 ? t("adminHome.queue_subtitle") : t("adminHome.queue_allClear")}
      />

      <SetupChecklist />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          href="/dashboard/admin/enrollment-requests"
          label={t("adminHome.queue_requestsLabel")}
          icon={<Inbox className="size-[15px]" />}
          tone="amber"
          count={pendingRequests}
          fact={t("adminHome.queue_requestsFact")}
        />
        <MetricCard
          href="/dashboard/admin/fees"
          label={t("adminHome.queue_defaultersLabel")}
          icon={<Wallet className="size-[15px]" />}
          tone="amber"
          count={feeDefaulters}
          fact={t("adminHome.queue_defaultersFact")}
          blocking={feeDefaulters > 0}
          blockingLabel={t("adminHome.queue_defaultersChip")}
        />
        <MetricCard
          href="/dashboard/admin/counter"
          label={t("adminHome.queue_todayLabel")}
          icon={<CalendarCheck className="size-[15px]" />}
          tone="indigo"
          count={todaySessions}
          fact={t("adminHome.queue_todayFact")}
        />
        <MetricCard
          href="/dashboard/admin/schedule"
          label={t("adminHome.queue_unsettledLabel")}
          icon={<Coins className="size-[15px]" />}
          tone="amber"
          count={unsettled.length}
          fact={t("adminHome.queue_unsettledFact")}
          blocking={unsettled.length > 0}
          blockingLabel={t("adminHome.queue_unsettledChip")}
        />

        <MetricCard
          href="/dashboard/admin/schedule"
          label={t("adminHome.queue_clashLabel")}
          icon={<TriangleAlert className="size-[15px]" />}
          tone="red"
          count={clashCount}
          fact={t("adminHome.queue_clashFact")}
          className="sm:col-span-2"
        />
      </div>

      <TodayTakingsCard />

      {running.length > 0 ? (
        <Sheet>
          <SheetHead
            title={t("adminHome.live_title")}
            action={
              <span className="text-[11px] text-[var(--ink-3)]">
                {t("adminHome.live_count", { n: running.length })}
              </span>
            }
          />
          <div className="flex flex-col">
            {running.map((x) => (
              <Link
                key={x.id}
                href="/dashboard/admin/counter"
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--rule-2)] px-[18px] py-3 last:border-b-0 hover:bg-[var(--rule-2)]"
              >
                <Num.ClockRange
                  start={x.startTime ?? ""}
                  end={x.endTime ?? ""}
                  locale={locale}
                  className="shrink-0 text-[13px] font-semibold text-[var(--ink)]"
                />
                <span className="text-[13px] text-[var(--ink)]">{x.courseName || "—"}</span>
                <span className="text-[12px] text-[var(--ink-2)]">{x.teacherName || "—"}</span>
                {x.roomName ? (
                  <span className="text-[12px] text-[var(--ink-3)]">· {x.roomName}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </Sheet>
      ) : null}

      <div>
        <Sheet>
          <SheetHead
            title={t("adminHome.queue_ledgerTitle")}
            action={
              <span className="text-[11px] text-[var(--ink-3)]">
                {t("adminHome.queue_allTime")}
              </span>
            }
          />
          <div className="flex flex-wrap items-start gap-6 p-[18px]">
            <div className="min-w-[180px]">
              <Eyebrow>{t("adminHome.queue_revenueLabel")}</Eyebrow>
              <p className="mt-1.5 mb-0">
                <Amount
                  piasters={totals.revenue}
                  locale={locale}
                  className="text-[27px] font-semibold tracking-[-0.01em] text-[var(--money)]"
                />
              </p>
              {hasExternal ? (
                <p className="mt-1 mb-0 text-[12px] text-[var(--ink-3)]">
                  {t("adminHome.queue_externalShare", {
                    amount: formatShortEGP(external!.revenue),
                    teachers: external!.teachers,
                  })}
                </p>
              ) : null}
            </div>
            <div aria-hidden className="hidden h-[46px] w-px bg-[var(--rule)] sm:block" />

            <div className="min-w-[150px]">
              <Eyebrow>{t("adminHome.queue_attendanceLabel")}</Eyebrow>
              <p className="mt-1.5 mb-0">
                <Num className="text-[27px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
                  {formatPercent(attendanceRate)}
                </Num>
              </p>
            </div>
            <div aria-hidden className="hidden h-[46px] w-px bg-[var(--rule)] sm:block" />
            <div className="min-w-[180px]">
              <Eyebrow>{t("adminHome.queue_rosterLabel")}</Eyebrow>
              <dl className="mt-1.5 flex flex-col gap-1">
                <RosterLine
                  icon={<Users className="size-[13px]" />}
                  value={totals.students}
                  unit={t("adminHome.queue_studentsUnit")}
                />
                <RosterLine
                  icon={<GraduationCap className="size-[13px]" />}
                  value={totals.teachers}
                  unit={t("adminHome.queue_teachersUnit")}
                />
                <RosterLine
                  icon={<BookOpen className="size-[13px]" />}
                  value={totals.activeCourses}
                  unit={t("adminHome.queue_coursesUnit")}
                />
              </dl>
            </div>
          </div>
        </Sheet>

      </div>

    </div>
  );
}

function RosterLine({
  icon,
  value,
  unit,
}: {
  icon: React.ReactNode;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[var(--ink-3)]">{icon}</span>
      <Num className="text-[15px] font-semibold text-[var(--ink)]">{value}</Num>
      <span className="text-xs text-[var(--ink-2)]">{unit}</span>
    </div>
  );
}
