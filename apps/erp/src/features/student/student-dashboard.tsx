"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { GuardianContactNotice } from "@/features/student/guardian-contact-notice";
import { GuardianVerificationNotice } from "@/features/student/guardian-verification-notice";
import { PracticeInvite } from "@/features/student/emulator/practice-invite";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { STUDENT_TOUR_STEPS } from "@/features/student/tour/steps";
import { PageSkeleton } from "@/components/ui/skeletons";
import {
  Eyebrow,
  InitialsTile,
  LedgerEmpty,
  Money,
  Num,
  PageTitle,
  Sheet,
} from "@/features/student/ledger";
import { asRecord } from "@/lib/refine/as-record";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { GradeBandId } from "@repo/database/grading-scale";

type SessionRow = { id: string; time: string; subject: string; date?: string };
type SubjectRow = { id: string; subject: string; band: GradeBandId; percentage: number };

/**
 * One figure from the record, linking to the entries behind it.
 *
 * These three were bare `<Link><Sheet>` — clickable, and looking exactly like
 * the static sheets everywhere else in the portal, with no hover, no focus ring
 * and nothing saying they went anywhere. A card that is the only route to a
 * page has to look like a route to it, so: a chevron that leans on hover, a
 * hairline that warms to `--indigo`, and a real focus ring for the keyboard.
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
      <Sheet className="h-full p-5 transition-colors group-hover:border-[var(--indigo)]">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>{eyebrow}</Eyebrow>
          <DirectionalIcon
            icon={ChevronRight}
            aria-hidden
            /* No `rtl:` override on the translate: DirectionalIcon adds
               `-scale-x-100`, and Tailwind composes translate BEFORE scale, so
               the mirror already carries the nudge the other way. */
            className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--ink-3)" }}
          />
        </div>
        <p className="mt-2 text-sm font-medium" style={{ color: "var(--ink-2)" }}>
          {label}
        </p>
        {children}
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          {hint}
        </p>
      </Sheet>
    </Link>
  );
}

/**
 * The student dashboard, answering *what is next* rather than *how much exists*.
 *
 * The previous version was four stat cards, a due-soon table and two trend
 * charts. Three of those figures were not real: `unreadMessages` is hardcoded
 * `0` in the API, `assignmentsDue`/`dueSoon` were invented from grade rows with
 * no score, and `todaySchedule` carries `room: ""` and `teacher: ""` — two of
 * its four columns were structurally always blank.
 *
 * This version renders only figures the endpoint actually derives, and every
 * one of them links to the entries behind it. Where the API returns a
 * fabricated field it is simply not rendered.
 *
 * KNOWN, STILL OPEN: the endpoint itself was not corrected — `unreadMessages`,
 * `assignmentsDue`, `dueSoon` and `assignmentsTrend` are still in the payload,
 * just unread by this screen. They should come out of the contract, which is a
 * change to `dashboards/student` and its consumers rather than to this file.
 */
export function StudentDashboard() {
  const t = useTranslations();
  const { formatPercent, formatDate } = useFormatters();
  const { result } = useCustom({ url: "dashboards/student", method: "get" });
  const { result: walletRes } = useCustom({ url: "me/wallet", method: "get" });
  // Declared above the skeleton return: hooks cannot sit behind a branch.
  const tour = useTourGate();

  // The payload and the guard read the SAME value. `result.data` is refine's
  // frozen `{}` until the request settles, and `{}` is truthy — so guarding on
  // it directly skipped the skeleton and rendered an empty dashboard instead.
  const payload = asRecord<{
    attendanceRate?: number;
    averagePercent?: number;
    averageBand?: GradeBandId;
    todaySchedule?: SessionRow[];
    upcoming?: SessionRow[];
    subjectPerformance?: SubjectRow[];
  }>(result?.data);
  const data = payload ?? {};
  const wallet = asRecord<{ balance?: number }>(walletRes?.data);

  // Keyed on the payload, not isLoading — a PAUSED retry leaves isLoading
  // false while no data has arrived, which skipped the skeleton entirely.
  // See admin-reports-screen for the full reasoning.
  if (!payload) return <PageSkeleton />;

  const today = data.todaySchedule ?? [];
  const upcoming = data.upcoming ?? [];
  const subjects = data.subjectPerformance ?? [];
  // "What is next" is a single session, not a queue. Today's first if there is
  // one, otherwise the first of the coming week.
  const next = today[0] ?? upcoming[0] ?? null;
  const hasBalance = typeof wallet?.balance === "number";

  return (
    <div className="space-y-6">
      <PageTitle
        title={t("studentDashboard.whatsNext")}
        subtitle={t("studentDashboard.whatsNextSubtitle")}
      />

      {/* Child safety: explains WHY adult messaging is off, and fixes it. */}
      <GuardianContactNotice />
      {/* Mutually exclusive with the notice above: that one fires when there
          is no guardian email, this one when there is but nobody has proven
          it reaches them. */}
      <GuardianVerificationNotice />

      {/* Only while the account is empty — see the component for why that is
          also the condition under which it disappears, and why it therefore
          needs no dismiss button. */}
      <PracticeInvite show={!next && subjects.length === 0} />

      {/* First entry only: the guided tour of the real portal offers itself
          once, then never again (user_prefs.tour_completed). It never blocks
          this dashboard — every step carries Skip, and Esc closes it. */}
      <GuidedTour
        steps={STUDENT_TOUR_STEPS}
        namespace="studentTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {/* ── Up next ───────────────────────────────────────────────────────── */}
      <Sheet className="p-5" data-tour="student-upnext">
        <Eyebrow>{t("studentDashboard.upNext")}</Eyebrow>
        {next ? (
          <div className="mt-3 flex items-center gap-4">
            <InitialsTile name={next.subject || "?"} size={44} tone="indigo" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold" style={{ color: "var(--ink)" }}>
                {next.subject}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
                <Num>{next.time}</Num>
                {next.date ? (
                  <>
                    {" · "}
                    <Num>
                      {formatDate(next.date, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </Num>
                  </>
                ) : (
                  <>
                    {" · "}
                    {t("studentDashboard.today")}
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <LedgerEmpty title={t("studentDashboard.noUpcoming")} />
        )}
      </Sheet>

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
      <div className="grid gap-4 sm:grid-cols-3">
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
          <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
            {typeof data.attendanceRate === "number"
              ? formatPercent(data.attendanceRate)
              : "—"}
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
          <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
            {typeof data.averagePercent === "number"
              ? formatPercent(data.averagePercent)
              : "—"}
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
          <div style={{ fontSize: 30 }}>
            {hasBalance ? (
              <Money piasters={wallet!.balance} tone="ink" weight={600} />
            ) : (
              <Num style={{ color: "var(--ink-3)" }}>—</Num>
            )}
          </div>
        </RecordCard>
      </div>

    </div>
  );
}
