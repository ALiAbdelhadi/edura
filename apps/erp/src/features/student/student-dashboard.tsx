"use client";

import type { ReactNode } from "react";
import { ChevronRight, IdCard, MapPin, Sparkles, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCustom, useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { GuardianContactNotice } from "@/features/student/guardian-contact-notice";
import { GuardianVerificationNotice } from "@/features/student/guardian-verification-notice";
import { PracticeInvite } from "@/features/student/emulator/practice-invite";
import { SubscriptionAlert } from "@/features/student/subscription-alert";
import { LatestGradeCard } from "@/features/grades/latest-grade-card";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { STUDENT_TOUR_STEPS } from "@/features/student/tour/steps";
import { PageSkeleton } from "@/components/ui/skeletons";
import {
  Chip,
  Eyebrow,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Money,
  Num,
  PageTitle,
  Sheet,
} from "@/features/student/ledger";
import {
  dateKeyOf,
  isHappeningNow,
  upcomingSessions,
} from "@/features/sessions/session-time";
// The CAIRO day. There used to be a `todayKey` in session-time returning the
// device's day, and this screen imported that one.
import { todayKey } from "@repo/server-core/lib/date-key";
import { asRecord } from "@/lib/refine/as-record";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { GradeBandId } from "@repo/database/grading-scale";

/**
 * The rows `GET /api/v1/sessions` returns for a student — the SAME resource the
 * schedule screen reads, chosen over `dashboards/student.todaySchedule` because
 * that payload ships `room: ""` and `teacher: ""` by construction, so the two
 * halves of "فين ومع مين" were structurally unanswerable there.
 *
 * NOT here, and deliberately not added: the CENTER's name. This endpoint joins
 * the course, the teacher and the room, and no center — asking for one would be
 * an API change, and this pass reads existing endpoints only. The hall name is
 * what a student navigates by inside the building anyway.
 */
type SessionRow = {
  id: string;
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

/**
 * One figure from the record, linking to the entries behind it.
 *
 * ── WHY THIS IS NOW A STRIP AND NOT THREE CARDS ───────────────────────────
 *
 * It was `grid sm:grid-cols-3`, which on a phone is one column: three
 * full-width cards, roughly 360px of scroll, for three numbers. Everything
 * underneath — including the two quick actions — started below the fold on a
 * 375px screen. Three across at every width costs each figure some size and
 * buys back the whole rest of the page; the hint line and the chevron are the
 * two things that go, and both are decoration next to the figure itself.
 *
 * The chevron is a `DirectionalIcon` because it points along the READING axis —
 * "onward" is left in Arabic and right in English (§6.4).
 */
function RecordCard({
  href,
  eyebrow,
  label,
  hint,
  openLabel,
  children,
}: {
  href: string;
  eyebrow: string;
  label: string;
  hint: string;
  openLabel: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={openLabel}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
    >
      <Sheet className="h-full p-3 transition-colors group-hover:border-[var(--indigo)] sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>{eyebrow}</Eyebrow>
          <DirectionalIcon
            icon={ChevronRight}
            aria-hidden
            /* No `rtl:` override on the translate: DirectionalIcon adds
               `-scale-x-100`, and Tailwind composes translate BEFORE scale, so
               the mirror already carries the nudge the other way. */
            className="hidden size-4 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block"
            style={{ color: "var(--ink-3)" }}
          />
        </div>
        <p
          className="mt-1.5 text-xs font-medium leading-snug sm:mt-2 sm:text-sm"
          style={{ color: "var(--ink-2)" }}
        >
          {label}
        </p>
        {children}
        <p className="mt-1 hidden text-xs sm:block" style={{ color: "var(--ink-3)" }}>
          {hint}
        </p>
      </Sheet>
    </Link>
  );
}

/**
 * A destination the student reaches by DOING something, not by reading a
 * figure. Two of them, and they are the compensation for what the phone bar
 * cannot hold: the card they show at the counter, and the screen where they
 * subscribe.
 */
function QuickAction({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
    >
      <Sheet className="flex h-full items-center gap-3 p-4 transition-colors group-hover:border-[var(--indigo)]">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {label}
          </span>
          <span className="block truncate text-xs" style={{ color: "var(--ink-3)" }}>
            {hint}
          </span>
        </span>
      </Sheet>
    </Link>
  );
}

/**
 * The student dashboard, answering *what is next* rather than *how much exists*.
 *
 * ── WHAT THE HERO NOW SAYS, AND WHY ───────────────────────────────────────
 *
 * The first question this portal exists to answer is "عندي حصة النهاردة؟ امتى
 * وفين؟" — three parts, and the hero used to answer one of them. It printed a
 * course name and a bare `16:00`: no hall, no teacher, no day period, and no
 * hint that two more lessons were waiting behind it.
 *
 * All three missing parts were already on the wire. `GET /sessions` joins the
 * room and the teacher for exactly this reader; the hero simply was not the
 * thing reading it. So the source moved, and nothing about the endpoint,
 * scoping or money changed.
 *
 * The time also now goes through `Num.Clock`, which is the product's 12-hour
 * clock with the day period written out (docs/decisions/lesson-times-12h.md).
 * The hero was the last surface still printing a raw 24-hour string.
 *
 * KNOWN, STILL OPEN: `dashboards/student` still ships `todaySchedule.room` and
 * `.teacher` as the empty string — the hero reads the room and the teacher from
 * `GET /sessions` instead, so nothing renders those two. The fabricated fields
 * that used to stand beside them (`unreadMessages`, `assignmentsDue`,
 * `dueSoon`, `assignmentsTrend`) are gone from that route; the reasoning is
 * written at the removal site. A real unread count is still an open product
 * gap (STUDENT_IA_AUDIT.md §5.1 finding 4) — do not fill it with a placeholder.
 */
export function StudentDashboard() {
  const t = useTranslations();
  const { formatPercent, formatDate, locale } = useFormatters();
  const { result } = useCustom({ url: "dashboards/student", method: "get" });
  const { result: walletRes } = useCustom({ url: "me/wallet", method: "get" });
  // The schedule's own resource. `pagination: off` is stated rather than
  // assumed: the route applies no take/skip, and a screen that silently
  // depended on that would break the day someone added one.
  const { result: sessionsRes } = useList({
    resource: "sessions",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
    pagination: { mode: "off" },
  });
  // Declared above the skeleton return: hooks cannot sit behind a branch.
  const tour = useTourGate();

  // The payload and the guard read the SAME value. `result.data` is refine's
  // frozen `{}` until the request settles, and `{}` is truthy — so guarding on
  // it directly skipped the skeleton and rendered an empty dashboard instead.
  const payload = asRecord<{
    attendanceRate?: number;
    averagePercent?: number;
    averageBand?: GradeBandId;
    subjectPerformance?: { id: string }[];
  }>(result?.data);
  const data = payload ?? {};
  const wallet = asRecord<{ balance?: number }>(walletRes?.data);

  // Keyed on the payload, not isLoading — a PAUSED retry leaves isLoading
  // false while no data has arrived, which skipped the skeleton entirely.
  // See admin-reports-screen for the full reasoning.
  if (!payload) return <PageSkeleton />;

  const sessions = (sessionsRes?.data ?? []) as SessionRow[];
  const subjects = data.subjectPerformance ?? [];
  const hasBalance = typeof wallet?.balance === "number";

  const ahead = upcomingSessions(sessions);
  const next = ahead[0] ?? null;
  const today = todayKey();
  // Everything still to come TODAY, minus the one already in the hero. A
  // student with a double period wants to know the second one exists; they do
  // not want the schedule printed twice on the home screen, which is the
  // duplication the 2026-08-10 dedup pass removed.
  const laterToday = next
    ? ahead.filter((s) => s !== next && dateKeyOf(s.date) === today).length
    : 0;

  const nextIsToday = next ? dateKeyOf(next.date) === today : false;
  const nextIsNow = next ? isHappeningNow(next) : false;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageTitle
        title={t("studentDashboard.whatsNext")}
        subtitle={t("studentDashboard.whatsNextSubtitle")}
      />

      {/* ── Up next — the whole reason this page loads ──────────────────────
          It leads. The guardian notices used to stand above it; they are
          alerts about the account, and an alert is not the answer to "do I
          have a lesson today". They now sit directly beneath, still above the
          fold on a 375px screen. */}
      <Sheet className="p-5" data-tour="student-upnext">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>{t("studentDashboard.upNext")}</Eyebrow>
          {nextIsNow ? <Chip tone="teal">{t("studentDashboard.now")}</Chip> : null}
        </div>

        {next ? (
          <>
            <div className="mt-3 flex items-start gap-4">
              <InitialsTile name={next.courseName || next.subject || "?"} size={44} tone="indigo" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-snug" style={{ color: "var(--ink)" }}>
                  {next.courseName || next.subject || t("studentClass.tbd")}
                </p>

                {/* WHEN — day first, then the clock. A student reads "بكرة" and
                    stops; the hour only matters once the day is settled. */}
                <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
                  <span className="font-medium">
                    {nextIsToday
                      ? t("studentDashboard.today")
                      : formatDate(next.date, { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                  {" · "}
                  <Num.ClockRange start={next.startTime} end={next.endTime} locale={locale} />
                </p>

                {/* WHERE and WITH WHOM — the two halves that were structurally
                    blank before. `tbd` rather than a hidden row: "لسه ما
                    تحددتش" is an answer, an absent line is not. */}
                <div
                  className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5"
                  style={{ color: "var(--ink-2)" }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {next.roomName || t("studentClass.tbd")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5 shrink-0" aria-hidden />
                    {next.teacherName || t("studentClass.tbd")}
                  </span>
                </div>
              </div>
            </div>

            {laterToday > 0 ? (
              <p className="mt-4 text-sm">
                <Link
                  href="/dashboard/student/schedule"
                  className="font-medium hover:underline"
                  style={{ color: "var(--indigo)" }}
                >
                  {t("studentDashboard.moreToday", { count: laterToday })}
                </Link>
              </p>
            ) : null}
          </>
        ) : (
          <div className="mt-2">
            <LedgerEmpty
              title={t("studentDashboard.noUpcoming")}
              hint={t("studentDashboard.noUpcomingHint")}
              action={
                <LedgerButton variant="primary" asChild>
                  <Link href="/dashboard/student/subjects">
                    {t("studentDashboard.quickSubscribe")}
                  </Link>
                </LedgerButton>
              }
            />
          </div>
        )}
      </Sheet>

      {/* Money that is about to stop working. It renders nothing at all unless
          a subscription is inside the seven-day window or has just lapsed, so
          it is an interruption only when there is something to interrupt for. */}
      <SubscriptionAlert />

      {/* Child safety: explains WHY adult messaging is off, and fixes it. */}
      <GuardianContactNotice />
      {/* Mutually exclusive with the notice above: that one fires when there
          is no guardian email, this one when there is but nobody has proven
          it reaches them. */}
      <GuardianVerificationNotice />

      {/* First entry only: the guided tour of the real portal offers itself
          once, then never again (user_prefs.tour_completed). It never blocks
          this dashboard — every step carries Skip, and Esc closes it. */}
      <GuidedTour
        steps={STUDENT_TOUR_STEPS}
        namespace="studentTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {/* ── The newest mark ─────────────────────────────────────────────────
          The average below answers "how am I doing"; this answers "what did I
          get", which is the question actually asked after an exam. It renders
          nothing until something has been marked. */}
      <LatestGradeCard
            href="/dashboard/student/grades"
            label={t("studentClass.latestGrade")}
            openLabel={t("studentDashboard.openRecord", {
              record: t("studentClass.latestGrade"),
            })}
          />

      {/*
        ── Your record — every figure links to the entries behind it ────────

        WHAT USED TO SIT AROUND THESE THREE CARDS WAS THE SAME PAGE TWICE OVER.
        A "today" list and a "this week" list stood between "up next" and this
        row — but "up next" IS `today[0]`, so the same lesson was printed twice
        within 150px, and both lists are what `/schedule` renders in full with a
        day picker. Below the cards came a "subject performance" list, which is
        the `/grades` table shortened, and which carried its own "all grades"
        link admitting as much.

        All three are gone. "Up next" stays because a single next lesson is a
        genuine summary and exists in that form nowhere else, and each card
        below still opens the page that owns its number. Nothing was removed
        from the portal — the schedule and the grades are untouched at full size
        on their own pages.
      */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4" data-tour="student-record">
        <RecordCard
          href="/dashboard/student/attendance"
          eyebrow={t("studentDashboard.recordEyebrow")}
          label={t("studentDashboard.attendanceRate")}
          hint={t("studentDashboard.attendanceTraceHint")}
          openLabel={t("studentDashboard.openRecord", {
            record: t("studentDashboard.attendanceRate"),
          })}
        >
          {/* Was a literal `{n}%` while the card beside it used `formatPercent`,
              so the same row printed `٪` and `%` — two ways of writing one unit,
              120px apart. One formatter, both cards. */}
          <Num className="text-[22px] font-semibold sm:text-[30px]" style={{ color: "var(--ink)" }}>
            {typeof data.attendanceRate === "number" ? formatPercent(data.attendanceRate) : "—"}
          </Num>
        </RecordCard>

        <RecordCard
          href="/dashboard/student/grades"
          eyebrow={t("studentDashboard.recordEyebrow")}
          label={t("studentDashboard.averageGrade")}
          hint={
            data.averageBand
              ? t(`gradeBands.${data.averageBand}`)
              : t("studentDashboard.gradeTraceHint")
          }
          openLabel={t("studentDashboard.openRecord", {
            record: t("studentDashboard.averageGrade"),
          })}
        >
          <Num className="text-[22px] font-semibold sm:text-[30px]" style={{ color: "var(--ink)" }}>
            {typeof data.averagePercent === "number" ? formatPercent(data.averagePercent) : "—"}
          </Num>
        </RecordCard>

        <RecordCard
          href="/dashboard/student/wallet"
          eyebrow={t("studentDashboard.moneyEyebrow")}
          label={t("studentWallet.balance")}
          hint={t("studentDashboard.balanceTraceHint")}
          openLabel={t("studentDashboard.openRecord", {
            record: t("studentWallet.balance"),
          })}
        >
          <div className="text-[19px] sm:text-[30px]">
            {hasBalance ? (
              <Money piasters={wallet!.balance} tone="ink" weight={600} />
            ) : (
              <Num style={{ color: "var(--ink-3)" }}>—</Num>
            )}
          </div>
        </RecordCard>
      </div>

      {/* ── Two things you DO ───────────────────────────────────────────────
          The card is used at the counter at every physical lesson, and
          Subjects is the one screen where a student spends. Both are a nav
          click away on a desktop and behind a sheet on a phone, which is one
          press too many for the first and hides the second. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction
          href="/dashboard/student/id"
          icon={<IdCard className="size-4.5" />}
          label={t("studentDashboard.quickCard")}
          hint={t("studentDashboard.quickCardHint")}
        />
        <QuickAction
          href="/dashboard/student/subjects"
          icon={<Sparkles className="size-4.5" />}
          label={t("studentDashboard.quickSubscribe")}
          hint={t("studentDashboard.quickSubscribeHint")}
        />
      </div>

      {/* Only while the account is empty — see the component for why that is
          also the condition under which it disappears, and why it therefore
          needs no dismiss button. */}
      <PracticeInvite show={!next && subjects.length === 0} />
    </div>
  );
}
