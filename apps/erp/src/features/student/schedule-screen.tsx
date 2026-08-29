"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { ChevronRight, MapPin, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { cn } from "@repo/ui/lib/utils";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { DescriptionList } from "@/components/kit/description-list";
import { PageSpinner } from "@/components/kit/spinner";
import {
  Chip,
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/features/student/ledger";
import {
  isHappeningNow,
  sessionsOnDay,
  weekDayKeys,
} from "@/features/sessions/session-time";
import { todayKey } from "@repo/server-core/lib/date-key";

type Session = {
  id?: string;
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

export function ScheduleScreen() {
  const t = useTranslations();
  const { formatDate, formatNumber, locale } = useFormatters();

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [selectedKey, setSelectedKey] = React.useState(() => todayKey());
  const [selectedSession, setSelectedSession] = React.useState<Session | null>(null);

  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
    pagination: { mode: "off" },
  });

  const sessions = (sessionsResult?.data ?? []) as Session[];
  const days = weekDayKeys(new Date(), weekOffset);
  const today = todayKey();

  const selected = days.includes(selectedKey) ? selectedKey : days[0]!;
  const daySessions = sessionsOnDay(sessions, selected);

  const goWeek = (delta: number) => {
    const nextDays = weekDayKeys(new Date(), weekOffset + delta);
    const index = days.indexOf(selected);
    setWeekOffset((w) => w + delta);
    setSelectedKey(nextDays[index === -1 ? 0 : index]!);
  };

  if (sessionsQuery.isLoading) {
    return <PageSpinner label={t("common.loading")} />;
  }

  const statusTone = (status: string) =>
    status === "cancelled" ? "red" : status === "completed" ? "teal" : "indigo";
  const statusText = (status: string) =>
    status === "cancelled"
      ? t("status.cancelled")
      : status === "completed"
        ? t("status.completed")
        : t("status.scheduled");

  const detailItems = selectedSession
    ? [
        {
          label: t("studentClass.date"),
          value: selectedSession.date
            ? formatDate(selectedSession.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "—",
        },
        {
          label: t("studentClass.time"),
          value: (
            <Num.ClockRange
              start={selectedSession.startTime}
              end={selectedSession.endTime}
              locale={locale}
            />
          ),
        },
        {
          label: t("studentClass.course"),
          value: (
            <div className="flex flex-wrap items-center gap-2">
              <span>{selectedSession.courseName || "—"}</span>
              {selectedSession.courseId ? (
                <Link
                  href={`/courses/${selectedSession.courseId}`}
                  className="text-xs hover:underline"
                  style={{ color: "var(--indigo)" }}
                >
                  {t("studentClass.viewCourse")}
                </Link>
              ) : null}
            </div>
          ),
        },
        ...(selectedSession.subject
          ? [{ label: t("studentClass.subject"), value: selectedSession.subject }]
          : []),
        {
          label: t("roles.teacher"),
          value: selectedSession.teacherName || t("studentClass.tbd"),
        },
        {
          label: t("studentClass.room"),
          value: selectedSession.roomName || t("studentClass.tbd"),
        },
        {
          label: t("studentClass.statusLabel"),
          value: (
            <Chip tone={statusTone(selectedSession.status)}>
              {statusText(selectedSession.status)}
            </Chip>
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <PageTitle title={t("nav.schedule")} subtitle={t("studentClass.scheduleSubtitle")} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <LedgerButton onClick={() => goWeek(-1)} aria-label={t("studentClass.weekPrevious")}>
            <DirectionalIcon icon={ChevronRight} className="size-4 rotate-180" aria-hidden />
          </LedgerButton>
          <span className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
            {weekOffset === 0
              ? t("studentClass.thisWeek")
              : `${formatDate(days[0]!, { day: "numeric", month: "short" })} — ${formatDate(
                  days[6]!,
                  { day: "numeric", month: "short" },
                )}`}
          </span>
          <LedgerButton onClick={() => goWeek(1)} aria-label={t("studentClass.weekNext")}>
            <DirectionalIcon icon={ChevronRight} className="size-4" aria-hidden />
          </LedgerButton>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((key) => {
            const active = key === selected;
            const isToday = key === today;
            const has = sessionsOnDay(sessions, key).length > 0;
            const d = new Date(`${key}T00:00:00`);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                aria-pressed={active}
                aria-label={formatDate(key, { weekday: "long", day: "numeric", month: "long" })}
                className="flex flex-col items-center gap-0.5 rounded-lg py-2 transition-colors"
                style={{
                  background: active ? "var(--indigo-soft)" : "var(--sheet)",
                  color: active ? "var(--indigo)" : "var(--ink-2)",
                  border: `1px solid ${active ? "var(--indigo-soft)" : "var(--rule)"}`,
                }}
              >
                <span className="text-[10px] leading-none">
                  {formatDate(key, { weekday: "short" })}
                </span>
                <Num
                  className={cn("text-[15px] leading-tight", isToday && "font-bold")}
                  style={{ color: active ? "var(--indigo)" : "var(--ink)" }}
                >
                  {formatNumber(d.getDate())}
                </Num>
                <span
                  aria-hidden
                  className="size-1 rounded-full"
                  style={{ background: has ? "var(--teal)" : "transparent" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <Sheet className="p-5">
        <SectionHeading
          title={
            selected === today
              ? t("studentDashboard.today")
              : formatDate(selected, { weekday: "long", day: "numeric", month: "long" })
          }
          action={
            daySessions.length > 0 ? (
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>{daySessions.length}</Num>
            ) : null
          }
        />
        <div className="mt-2">
          {daySessions.length === 0 ? (
            <LedgerEmpty title={t("studentClass.noSessionsThatDay")} />
          ) : (
            <ul>
              {daySessions.map((s, i) => {
                const now = isHappeningNow(s) && s.status !== "cancelled";
                return (
                  <li key={s.id || i}>
                    {i > 0 ? <Hairline /> : null}
                    <button
                      type="button"
                      onClick={() => setSelectedSession(s)}
                      className="flex w-full items-start gap-3 py-3.5 text-start transition-colors hover:bg-[var(--field)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--indigo)]"
                      aria-label={s.courseName || t("studentClass.tbd")}
                    >
                      <InitialsTile
                        name={s.courseName || s.subject || "?"}
                        size={34}
                        tone={s.status === "cancelled" ? "amber" : "indigo"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className="truncate font-medium"
                            style={{ color: "var(--ink)" }}
                          >
                            {s.courseName || t("studentClass.tbd")}
                          </span>
                          {now ? <Chip tone="teal">{t("studentDashboard.now")}</Chip> : null}
                          {s.status !== "scheduled" ? (
                            <Chip tone={statusTone(s.status)}>{statusText(s.status)}</Chip>
                          ) : null}
                        </span>

                        <span className="mt-1 block text-sm" style={{ color: "var(--ink-2)" }}>
                          <Num.ClockRange start={s.startTime} end={s.endTime} locale={locale} />
                        </span>

                        <span
                          className="mt-1 flex flex-col gap-0.5 text-xs sm:flex-row sm:flex-wrap sm:gap-x-4"
                          style={{ color: "var(--ink-3)" }}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="size-3 shrink-0" aria-hidden />
                            {s.roomName || t("studentClass.tbd")}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <User className="size-3 shrink-0" aria-hidden />
                            {s.teacherName || t("studentClass.assignedTeacher")}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Sheet>

      <Dialog
        open={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("studentClass.sessionDetails")}</DialogTitle>
          </DialogHeader>
          {selectedSession ? <DescriptionList columns={1} items={detailItems} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
