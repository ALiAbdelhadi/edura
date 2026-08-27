"use client";

import { useList } from "@refinedev/core";
import { CalendarClock, MapPin, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Chip, Eyebrow, Sheet } from "@/components/ledger";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  dateKeyOf,
  isHappeningNow,
  upcomingSessions,
} from "@/features/sessions/session-time";
import { todayKey } from "@repo/server-core/lib/date-key";

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

export function ChildNextLesson({ childId }: { childId: string }) {
  const t = useTranslations();
  const { formatDate, formatClock } = useFormatters();

  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: [
      { field: "studentId", operator: "eq", value: childId },
      { field: "status", operator: "eq", value: "active" },
    ],
    queryOptions: { enabled: Boolean(childId) },
  });

  const { result: sessionsResult } = useList({
    resource: "sessions",
    pagination: { mode: "off" },
  });

  const courseIds = new Set(
    ((enrollmentsResult?.data ?? []) as { courseId?: unknown }[])
      .map((e) =>
        typeof e.courseId === "string" ? e.courseId : String(e.courseId ?? ""),
      )
      .filter(Boolean),
  );

  const mine = ((sessionsResult?.data ?? []) as SessionRow[]).filter((s) =>
    s.courseId ? courseIds.has(s.courseId) : false,
  );

  const upcoming = upcomingSessions(mine);
  const next = upcoming[0];

  if (!next) {
    return (
      <Sheet className="p-5">
        <Eyebrow>{t("parentDashboard.nextLesson")}</Eyebrow>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("parentDashboard.noNextLesson")}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          {t("parentDashboard.noNextLessonHint")}
        </p>
      </Sheet>
    );
  }

  const now = isHappeningNow(next);
  const alsoToday = upcoming.filter(
    (s) => s !== next && dateKeyOf(s.date) === todayKey(),
  ).length;

  return (
    <Sheet className="p-5">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{t("parentDashboard.nextLesson")}</Eyebrow>
        {now ? <Chip tone="teal">{t("parentDashboard.now")}</Chip> : null}
      </div>

      <p
        className="mt-2 text-[19px] font-semibold leading-snug"
        style={{ color: "var(--ink)" }}
      >
        {next.subject || next.courseName || ""}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
        <li className="flex items-center gap-2" style={{ color: "var(--ink-2)" }}>
          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
          {formatDate(next.date, { weekday: "long", day: "numeric", month: "long" })}
          {" · "}
          {formatClock(next.startTime)}
        </li>
        {next.teacherName ? (
          <li className="flex items-center gap-2" style={{ color: "var(--ink-2)" }}>
            <User className="size-3.5 shrink-0" aria-hidden />
            {next.teacherName}
          </li>
        ) : null}
        {next.roomName ? (
          <li className="flex items-center gap-2" style={{ color: "var(--ink-2)" }}>
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {next.roomName}
          </li>
        ) : null}
      </ul>

      {alsoToday > 0 ? (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
          {t("parentDashboard.alsoToday", { count: alsoToday })}
        </p>
      ) : null}
    </Sheet>
  );
}
