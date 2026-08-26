"use client";

import { PageSkeleton } from "@/components/ui/skeletons";
import { SetupChecklist } from "@/features/activation/setup-checklist";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom, useList } from "@refinedev/core";
import { BookOpen, CalendarCheck, Coins, GraduationCap, Inbox, TriangleAlert, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const { formatShortEGP, formatPercent, locale } = useFormatters();
  // Declared with the other hooks: the gate cannot sit behind a loading branch.
  const tour = useTourGate();
  const { query, result } = useCustom<DashboardData>({
    url: "dashboards/admin",
    method: "get",
  });

  /*
    THE CENTRE'S DAY — one read, three answers.

    A week back to today, because two of the three questions are not about
    today alone: a lesson that finished on Monday and is still unsettled on
    Thursday is precisely the one worth surfacing, and it would fall out of a
    one-day window. `sessions` returns the whole row (so `status` AND
    `distributedAt` arrive) plus course, teacher and hall names, which is
    everything the three sections below render. See center-day.ts.
  */
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

  const weekSessions = (sessionsResult?.data ?? []) as CenterSession[];
  const running = liveNow(weekSessions, new Date(), day);
  const unsettled = awaitingSettlement(weekSessions);
  // The SAME rule the booking gate applies (`checkConflicts`) and the same one
  // the schedule screen draws in red, so a clash counted here is a booking the
  // system would itself have refused. Today only: a clash three days ago is
  // history, and this screen is a queue.
  const todaysSessions = weekSessions.filter(
    (x) => String(x.date ?? "").slice(0, 10) === day,
  );
  const clashCount = clashingSessionIds(
    todaysSessions as unknown as SchedulableSession[],
  ).size;

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

  /*
    The headline is the sum of everything actually awaiting a decision, and it
    now includes the two this pass surfaced. Sessions today are WORK, not a
    decision, so they are still not counted — but an unsettled lesson is money
    that has not moved, and a clash is a room double-booked, and both need
    somebody to act.

    The two arrive from a second read, so the number can rise a moment after
    first paint. That is honest: it grows toward the truth rather than opening
    at a total it cannot yet justify, and the cards below it carry the same
    figures.
  */
  const openDecisions = pendingRequests + feeDefaulters + unsettled.length + clashCount;

  return (
    <div className="flex flex-col gap-6">
      {/* First entry only: the guided tour of the REAL portal offers itself
          once, then never again (user_prefs.tour_completed). It replaces the
          emulator as the first-run surface — same choice every other portal
          made: a tour is what you MEET someone with, an emulator is what they
          CHOOSE. The emulator keeps its menu entry, now labelled "Practice",
          and this tour's last card points at it. */}
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
        {/* THE COUNTER, not `/checkin`. This card has always linked to the
            by-student check-in screen — the one the de-duplication pass
            deliberately took out of the sidebar because the board is the answer
            to "what is running today". The card's own question is the board's
            question. */}
        <MetricCard
          href="/dashboard/admin/counter"
          label={t("adminHome.queue_todayLabel")}
          icon={<CalendarCheck className="size-[15px]" />}
          tone="indigo"
          count={todaySessions}
          fact={t("adminHome.queue_todayFact")}
        />
        {/*
          MONEY THAT HAS NOT MOVED. A completed lesson with `distributedAt`
          null is revenue collected and never split between platform, teacher
          and centre — the single most consequential thing on this screen that
          nobody was being told about. It was reachable only by opening the
          schedule, finding the right week, and clicking the right cell.
        */}
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
        {/* A clash is a hall or a teacher double-booked TODAY. The schedule
            draws them in red; this says one exists before anyone thinks to
            look. Same rule as the booking gate, so a count here is a booking
            the system would itself refuse.

            `sm:col-span-2`: FIVE cards in a grid whose last row never fills
            (2 of 3 columns at `lg`, 1 of 2 at `sm`) leave a dead cell the
            width of a whole card, in the one product area whose own thesis
            (`docs/decisions/counter-board.md`) is that every read here is
            real state, never furniture. This card is last, so spanning the
            remaining columns closes that cell at both grid widths rather
            than reflowing the four cards before it. */}
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

      {/* TODAY'S TAKINGS, directly under the decisions and ABOVE the record.
          "النهاردة جبنا كام؟" is asked every evening and had no answer anywhere
          in either centre portal; the figure below it is a LIFETIME total, so
          putting today's above it is also what stops the two being read as the
          same timeframe. It renders nothing while its own read is in flight. */}
      <TodayTakingsCard />

      {/*
        «شغّال دلوقتي» — which lessons are running, in which hall, with whom.

        "مين عنده حصة دلوقتي؟ القاعات مشغولة؟" could only be answered by opening
        the counter board and picking teachers one at a time. It renders only
        while something IS running: an empty "nothing on now" sheet at 2am is
        furniture, and its absence is not ambiguous.

        Each row opens the counter board, which is where the roster and the
        check-in counts live — those are deliberately NOT repeated here, because
        `sessions` does not carry them and inventing a second source for a
        figure the board already owns is how two screens start disagreeing.
      */}
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
        {/* The record. Two big mono figures separated by a hairline, then the
            roster counts — reference, deliberately below the decisions. */}
        <Sheet>
          {/* NAMED AS LIFETIME. `dashboards/admin` accepts `from`/`to` now and
              returns a `period`; this screen deliberately passes none, so every
              figure below is since-the-beginning. With «اتحصّل النهاردة» sitting
              directly above, two unlabelled money figures a few hundred pixels
              apart would be read as the same window. */}
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
            {/*
              ATTENDANCE MOVED HERE, out of a sheet titled «النهاردة».

              It is a LIFETIME rate — `getAdminDashboard` counts every
              attendance row this centre has ever had unless a period is passed,
              and this screen passes none. Sitting inside a sheet called "today"
              it read as today's, which is the one place a lifetime figure must
              not be. Here it sits with the other lifetime figures, under the
              heading that says so.
            */}
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

      {/*
        THE THREE CHARTS ARE GONE FROM HERE, and two of them were duplicates.

        `/reports` already draws the revenue-vs-expenses series (as its cashflow
        bars) and the identical session-status donut from the identical field.
        Two renderings of one series on two screens is two things to keep in
        agreement for no gain. The attendance-by-course bars were not duplicated
        and so MOVED rather than went: `/reports` receives them from the
        `attendanceByCourse` its net-profit payload already carries, with no new
        request.

        What is left here is a QUEUE. Three charts below a decision list pushed
        every decision off a phone screen, and a chart is reference — the thing
        this screen was rebuilt to stop being.
      */}
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
