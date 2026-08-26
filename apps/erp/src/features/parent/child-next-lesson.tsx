"use client";

import { useList } from "@refinedev/core";
import { CalendarClock, MapPin, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Chip, Eyebrow, Sheet } from "@/components/ledger";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  dateKeyOf,
  isHappeningNow,
  todayKey,
  upcomingSessions,
} from "@/features/sessions/session-time";

/**
 * "الحصة الجاية" — the parent's structural question, answered for the first
 * time.
 *
 * ── WHAT WAS MISSING ──────────────────────────────────────────────────────
 *
 * The parent portal has no schedule screen and had no next-lesson card. A
 * parent driving their child to a centre could not see, anywhere in the app
 * their centre put them in, when or where the next lesson was. The student
 * portal has answered this since its own IA pass; the parent's half was simply
 * never built.
 *
 * ── WHY IT JOINS TWO READS INSTEAD OF ASKING FOR ONE ──────────────────────
 *
 * `GET /api/v1/sessions` is parent-readable and already carries everything on
 * screen here — `courseName`, `teacherName`, `roomName`, `date`, `startTime`,
 * `status`. What it cannot do is answer WHICH CHILD: for a parent it resolves
 * every approved child's active enrollments and returns the UNION of their
 * courses' sessions. The `studentId` parameter is honoured only inside a branch
 * guarded by `user.role === "student"`.
 *
 * So the attribution is done here, from `enrollments?studentId=<child>`, which
 * IS per-child (the route checks the link and narrows). Two existing reads and
 * a client-side filter — no endpoint changed. The missing server-side filter is
 * recorded as an API gap in PARENT_IA_AUDIT.md §7.1 and in the improvement
 * report; it is not worked around anywhere else.
 *
 * A parent with ONE child gets the same answer either way; the join is what
 * keeps a parent of three from reading a sibling's lesson as this child's.
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
 * `childName` is deliberately NOT a prop. The child is named by the context bar
 * at the top of every per-child route, and again on the pay button — the one
 * place where getting it wrong costs money. Naming them a third time in this
 * card's eyebrow put one long Arabic name on screen four times over.
 */
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
      // No pay button here. The home carries one directly below this card, and
      // two identical primary buttons 80px apart is not two chances to act — it
      // is a screen that has stopped knowing what it is asking for.
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
  // "وكمان حصتين النهاردة" — counted from the SAME upcoming list, so it can
  // never disagree with the lesson named above it.
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

      {/* WHEN, WHERE and WITH WHOM — the three halves of the question. A time
          on its own is what the old dashboard payload could manage, because
          its `room` and `teacher` are the empty string by construction. This
          reads `sessions`, where they are real. */}
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
