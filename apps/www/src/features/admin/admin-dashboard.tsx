"use client";

import { BarChart, DonutChart, LineChart } from "@/components/charts";
import { PageSkeleton } from "@/components/ui/skeletons";
import { SetupChecklist } from "@/features/activation/setup-checklist";
import { revenueVsExpensesLineSeries, sessionStatusDonutData } from "@/lib/analytics/transforms";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { BookOpen, CalendarCheck, GraduationCap, Inbox, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Amount, Eyebrow, MetricCard, Num, PageHead, Sheet, SheetHead } from "./ledger";

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
  /** Off-system (external-teacher) share — always sent by the API. */
  external?: { teachers: number; courses: number; students: number; revenue: number };
  analytics?: {
    revenueVsExpenses?: Array<{ label: string; revenue: number; expenses: number; netProfit: number }>;
    sessionStatusMix?: Array<{ status: "scheduled" | "completed" | "cancelled" | "postponed"; count: number }>;
    attendanceByCourse?: Array<{ title: string; attendanceRatePct: number }>;
  };
}

/**
 * اليوم — the center's decision queue.
 *
 * This screen used to be four near-identical stat cards with the pending work
 * buried in a corner panel that linked nowhere. It knew there were unanswered
 * enrolment requests and said nothing actionable about them.
 *
 * Now the count of open decisions IS the headline, the three cards are ordered
 * by urgency and each one is a door to its queue, and the record (roster,
 * revenue) drops below the decisions — because a number you cannot act on is
 * reference, not a task.
 */
export function AdminDashboard() {
  const t = useTranslations();
  const { formatShortEGP, locale } = useFormatters();
  const { query, result } = useCustom<DashboardData>({
    url: "dashboards/admin",
    method: "get",
  });

  const d = result?.data as DashboardData | undefined;

  if (query.isLoading) {
    return <PageSkeleton />;
  }

  const totals = d?.totals ?? { students: 0, teachers: 0, activeCourses: 0, revenue: 0 };
  // The off-system share the API always sends (reports.ts). Rendered whenever
  // this center HAS off-system teachers — the split must sit beside the
  // headline, not behind a filter; a center with none is spared the zero line.
  const external = d?.external;
  const hasExternal = !!external && (external.teachers > 0 || external.revenue > 0);
  const attendanceRate = d?.attendanceRate ?? 0;
  const todaySessions = d?.todaySessions?.length ?? 0;
  const feeDefaulters = d?.feeDefaulters ?? 0;
  const pendingRequests = d?.pendingEnrollmentRequests ?? 0;

  // The headline count is the sum of everything actually awaiting a decision.
  // Sessions today are work, not a decision, so they are not counted here.
  const openDecisions = pendingRequests + feeDefaulters;

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title={
          openDecisions > 0
            ? t("adminHome.queue_title", { n: openDecisions })
            : t("adminHome.queue_titleNone")
        }
        subtitle={openDecisions > 0 ? t("adminHome.queue_subtitle") : t("adminHome.queue_allClear")}
      />

      {/* Setup checklist. ABOVE the decision cards on purpose: a center that has
          no teachers and no groups has no decisions to make, so the queue below
          is empty and says nothing about what to do next. It renders nothing
          once dismissed, and nothing at all while its own fetch is in flight. */}
      <SetupChecklist />

      {/* Ordered by urgency: unanswered requests block a student from attending;
          unpaid fees block attendance at the counter; today's sessions are the
          shift itself. */}
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
          href="/dashboard/admin/checkin"
          label={t("adminHome.queue_todayLabel")}
          icon={<CalendarCheck className="size-[15px]" />}
          tone="indigo"
          count={todaySessions}
          fact={t("adminHome.queue_todayFact")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* The record. Two big mono figures separated by a hairline, then the
            roster counts — reference, deliberately below the decisions. */}
        <Sheet>
          <SheetHead title={t("adminHome.queue_ledgerTitle")} />
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

        <Sheet>
          <SheetHead title={t("adminHome.queue_todayTitle")} />
          <div className="flex flex-col p-[18px]">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-3.5 first:pt-0">
              <span className="text-[13px] text-[var(--ink-2)]">
                {t("adminHome.queue_attendanceLabel")}
              </span>
              <Num className="text-[17px] font-semibold text-[var(--ink)]">{attendanceRate}%</Num>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-3.5">
              <span className="text-[13px] text-[var(--ink-2)]">
                {t("adminHome.queue_sessionsLabel")}
              </span>
              <Num className="text-[17px] font-semibold text-[var(--ink)]">{todaySessions}</Num>
            </div>
            <div className="lg-total mt-1 flex items-baseline justify-between gap-3 pt-3">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("adminHome.queue_openDecisions")}
              </span>
              <Num
                className={`text-[17px] font-semibold ${
                  openDecisions > 0 ? "text-[var(--amber)]" : "text-[var(--ink)]"
                }`}
              >
                {openDecisions}
              </Num>
            </div>
          </div>
        </Sheet>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Sheet className="lg:col-span-2">
          <SheetHead title={t("adminHome.dashboard_revenueVsExpensesTrend")} />
          {/* Chart wrappers render dir="ltr" internally (recharts axis math)
              while the card around them stays RTL. */}
          <div className="p-[18px]">
            <LineChart
              series={revenueVsExpensesLineSeries(
                (d?.analytics?.revenueVsExpenses ?? []).map((entry) => ({
                  period: entry.label,
                  label: entry.label,
                  revenue: entry.revenue,
                  expenses: entry.expenses,
                  netProfit: entry.netProfit,
                })),
                {
                  revenue: t("adminHome.chart_revenue"),
                  expenses: t("adminHome.chart_expenses"),
                },
              )}
              showArea
              yValueFormatter={(value) => formatShortEGP(value)}
              emptyText={t("adminHome.dashboard_noFinancialTrend")}
            />
          </div>
        </Sheet>
        <Sheet>
          <SheetHead title={t("adminHome.dashboard_sessionStatusMix")} />
          <div className="p-[18px]">
            <DonutChart
              data={sessionStatusDonutData(d?.analytics?.sessionStatusMix ?? [], (s) =>
                t(`status.${s}` as Parameters<typeof t>[0]),
              )}
              centerLabel={t("nav.sessions")}
              emptyText={t("adminHome.dashboard_noSessionStatus")}
            />
          </div>
        </Sheet>
      </div>

      <Sheet>
        <SheetHead title={t("adminHome.dashboard_attendanceByCourse")} />
        <div className="p-[18px]">
          <BarChart
            data={(d?.analytics?.attendanceByCourse ?? []).map((entry) => ({
              label: entry.title,
              rate: entry.attendanceRatePct,
            }))}
            series={[
              {
                key: "rate",
                label: t("adminHome.dashboard_attendancePercent"),
                color: "var(--teal)",
              },
            ]}
            horizontal
            yValueFormatter={(value) => `${Math.round(value)}%`}
            emptyText={t("adminHome.dashboard_noCourseAttendance")}
          />
        </div>
      </Sheet>
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
