"use client";

import { Link } from "@/i18n/navigation";
import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { GuardianContactNotice } from "@/features/student/guardian-contact-notice";
import { PageSkeleton } from "@/components/ui/skeletons";
import {
  Chip,
  Eyebrow,
  InitialsTile,
  LedgerEmpty,
  Money,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/features/student/ledger";
import { asRecord } from "@/lib/refine/as-record";

type SessionRow = { id: string; time: string; subject: string; date?: string };
type SubjectRow = { id: string; subject: string; grade: string; percentage: number };

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
 * fabricated field it is simply not rendered — see design/REQUESTS.md for the
 * corrected contract, which is not this session's to change.
 */
export function StudentDashboard() {
  const t = useTranslations();
  const { result } = useCustom({ url: "dashboards/student", method: "get" });
  const { result: walletRes } = useCustom({ url: "me/wallet", method: "get" });

  // The payload and the guard read the SAME value. `result.data` is refine's
  // frozen `{}` until the request settles, and `{}` is truthy — so guarding on
  // it directly skipped the skeleton and rendered an empty dashboard instead.
  const payload = asRecord<{
    attendanceRate?: number;
    averageGrade?: string;
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

      {/* ── Up next ───────────────────────────────────────────────────────── */}
      <Sheet className="p-5">
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
                    <Num>{next.date}</Num>
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

      {/* ── Schedule: today, then the week ────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Sheet className="p-5">
          <SectionHeading
            eyebrow={t("studentDashboard.scheduleEyebrow")}
            title={t("studentDashboard.today")}
            action={
              <Link
                href="/dashboard/student/schedule"
                className="text-xs font-semibold"
                style={{ color: "var(--indigo)" }}
              >
                {t("nav.schedule")}
              </Link>
            }
          />
          <div className="mt-3">
            {today.length === 0 ? (
              <LedgerEmpty title={t("studentDashboard.noClassesToday")} />
            ) : (
              <ul>
                {today.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0"
                    style={{ borderColor: "var(--rule-2)" }}
                  >
                    <span className="truncate" style={{ color: "var(--ink)" }}>
                      {s.subject}
                    </span>
                    <Num style={{ color: "var(--ink-2)", fontSize: 13 }}>{s.time}</Num>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Sheet>

        <Sheet className="p-5">
          <SectionHeading
            eyebrow={t("studentDashboard.scheduleEyebrow")}
            title={t("studentDashboard.thisWeek")}
          />
          <div className="mt-3">
            {upcoming.length === 0 ? (
              <LedgerEmpty title={t("studentDashboard.noUpcoming")} />
            ) : (
              <ul>
                {upcoming.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0"
                    style={{ borderColor: "var(--rule-2)" }}
                  >
                    <span className="truncate" style={{ color: "var(--ink)" }}>
                      {s.subject}
                    </span>
                    <span className="shrink-0">
                      <Num style={{ color: "var(--ink-2)", fontSize: 13 }}>
                        {s.date} · {s.time}
                      </Num>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Sheet>
      </div>

      {/* ── Your record — every figure links to the entries behind it ─────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/student/attendance" className="block">
          <Sheet className="h-full p-5">
            <Eyebrow>{t("studentDashboard.recordEyebrow")}</Eyebrow>
            <p className="mt-2 text-sm font-medium" style={{ color: "var(--ink-2)" }}>
              {t("studentDashboard.attendanceRate")}
            </p>
            <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
              {data.attendanceRate ?? 0}%
            </Num>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              {t("studentDashboard.attendanceTraceHint")}
            </p>
          </Sheet>
        </Link>

        <Link href="/dashboard/student/grades" className="block">
          <Sheet className="h-full p-5">
            <Eyebrow>{t("studentDashboard.recordEyebrow")}</Eyebrow>
            <p className="mt-2 text-sm font-medium" style={{ color: "var(--ink-2)" }}>
              {t("studentDashboard.averageGrade")}
            </p>
            <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
              {data.averageGrade ?? "—"}
            </Num>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              {t("studentDashboard.gradeTraceHint")}
            </p>
          </Sheet>
        </Link>

        <Link href="/dashboard/student/wallet" className="block">
          <Sheet className="h-full p-5">
            <Eyebrow>{t("studentDashboard.moneyEyebrow")}</Eyebrow>
            <p className="mt-2 text-sm font-medium" style={{ color: "var(--ink-2)" }}>
              {t("studentWallet.balance")}
            </p>
            <div style={{ fontSize: 30 }}>
              {hasBalance ? (
                <Money piasters={wallet!.balance} tone="ink" weight={600} />
              ) : (
                <Num style={{ color: "var(--ink-3)" }}>—</Num>
              )}
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              {t("studentDashboard.balanceTraceHint")}
            </p>
          </Sheet>
        </Link>
      </div>

      {/* ── Subject performance ───────────────────────────────────────────── */}
      <Sheet className="p-5">
        <SectionHeading
          eyebrow={t("studentDashboard.recordEyebrow")}
          title={t("studentDashboard.subjectPerformance")}
          action={
            <Link
              href="/dashboard/student/grades"
              className="text-xs font-semibold"
              style={{ color: "var(--indigo)" }}
            >
              {t("studentDashboard.allGrades")}
            </Link>
          }
        />
        <div className="mt-3">
          {subjects.length === 0 ? (
            <LedgerEmpty title={t("studentDashboard.noPerformanceData")} />
          ) : (
            <ul>
              {subjects.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b py-3 last:border-b-0"
                  style={{ borderColor: "var(--rule-2)" }}
                >
                  <InitialsTile name={s.subject || "?"} size={30} tone="teal" />
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink)" }}>
                    {s.subject}
                  </span>
                  <Chip tone={s.percentage >= 85 ? "teal" : s.percentage >= 60 ? "indigo" : "amber"}>
                    {s.grade}
                  </Chip>
                  <Num
                    style={{ color: "var(--ink-2)", fontSize: 13, minWidth: 44, textAlign: "end" }}
                  >
                    {s.percentage}%
                  </Num>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
}
