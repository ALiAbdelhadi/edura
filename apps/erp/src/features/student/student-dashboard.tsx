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
import { todayKey } from "@repo/server-core/lib/date-key";
import { asRecord } from "@/lib/refine/as-record";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { GradeBandId } from "@repo/database/grading-scale";

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

export function StudentDashboard() {
  const t = useTranslations();
  const { formatPercent, formatDate, locale } = useFormatters();
  const { result } = useCustom({ url: "dashboards/student", method: "get" });
  const { result: walletRes } = useCustom({ url: "me/wallet", method: "get" });
  const { result: sessionsRes } = useList({
    resource: "sessions",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
    pagination: { mode: "off" },
  });
  const tour = useTourGate();

  const payload = asRecord<{
    attendanceRate?: number;
    averagePercent?: number;
    averageBand?: GradeBandId;
    subjectPerformance?: { id: string }[];
  }>(result?.data);
  const data = payload ?? {};
  const wallet = asRecord<{ balance?: number }>(walletRes?.data);

  if (!payload) return <PageSkeleton />;

  const sessions = (sessionsRes?.data ?? []) as SessionRow[];
  const subjects = data.subjectPerformance ?? [];
  const hasBalance = typeof wallet?.balance === "number";

  const ahead = upcomingSessions(sessions);
  const next = ahead[0] ?? null;
  const today = todayKey();
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

                <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
                  <span className="font-medium">
                    {nextIsToday
                      ? t("studentDashboard.today")
                      : formatDate(next.date, { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                  {" · "}
                  <Num.ClockRange start={next.startTime} end={next.endTime} locale={locale} />
                </p>

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

      <SubscriptionAlert />

      <GuardianContactNotice />
      <GuardianVerificationNotice />

      <GuidedTour
        steps={STUDENT_TOUR_STEPS}
        namespace="studentTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      <LatestGradeCard
            href="/dashboard/student/grades"
            label={t("studentClass.latestGrade")}
            openLabel={t("studentDashboard.openRecord", {
              record: t("studentClass.latestGrade"),
            })}
          />

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

      <PracticeInvite show={!next && subjects.length === 0} />
    </div>
  );
}
