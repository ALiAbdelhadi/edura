"use client";

import { PageSpinner } from "@/components/kit/spinner";
import { useCustom } from "@refinedev/core";
import { pickedDateKey, toDateKey, todayKey } from "@repo/server-core/lib/date-key";
import {
  clashingSessionIds,
  findScheduleClashes,
  type SchedulableSession,
} from "@repo/server-core/services/sessions/conflict-detector";
import { Button } from "@repo/ui/components/button";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge, EmptyState, Num, PageHead } from "./ledger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { SettleLessonCard } from "../attendance/settle-lesson-card";

/**
 * The week a center actually runs — every session, in its hall, with clashes
 * marked.
 *
 * NO NEW ENDPOINT AND NO NEW QUERY. `/api/v1/sessions?from&to` already returns
 * the week enriched (course, teacher, hall) and scoped to the caller's center,
 * so this screen is a VIEW over data the platform already serves. A calendar
 * with its own reader would be a second answer to "what is scheduled", free to
 * disagree with the attendance and money paths that run off these same rows.
 *
 * Clashes come from `findScheduleClashes`, which applies the SAME rule as the
 * booking gate (`checkConflicts`) — same day, half-open overlap, live statuses
 * only, shared hall or shared teacher. So a cell marked red here is a booking
 * the system would also have refused, and back-to-back lessons in one hall —
 * the normal way a center runs — are correctly left alone.
 */

/** Sunday-first: the Egyptian working week. */
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

type SessionRow = SchedulableSession & {
  courseName: string;
  subject: string;
  teacherName: string;
  roomName: string;
};

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday, which is already the first column.
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function AdminScheduleScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const weekEnd = addDays(weekStart, 6);
  // THE THREE DATE KEYS ARE NOT INTERCHANGEABLE (see lib/date-key.ts, which
  // exists because they were confused before). `weekStart` is built with local
  // setHours(0,0,0,0), so it is a LOCAL-MIDNIGHT date — exactly the
  // `pickedDateKey` case. Running it through `toDateKey` reads the UTC day,
  // which east of UTC is YESTERDAY: every column would carry a key one day
  // behind its own label, and each session would render in the wrong column.
  // Session dates below are stored day values and stay on `toDateKey`.
  const from = pickedDateKey(weekStart);
  const to = pickedDateKey(weekEnd);

  const { query, result } = useCustom({
    url: "sessions",
    method: "get",
    config: { query: { from, to } },
  });

  const sessions = useMemo(
    () => ((result?.data as { items?: SessionRow[] } | undefined)?.items ?? []) as SessionRow[],
    [result],
  );

  // THE CENTER CAN CLOSE A LESSON TOO. The teacher's own button lives at the
  // end of taking attendance; a center needs the same power for the lessons its
  // teachers did not close, and the week grid is where it already looks at
  // them. Same component, same preview, same guards — the center is not given a
  // second, looser way to move money.
  const [settling, setSettling] = useState<SessionRow | null>(null);
  const clashIds = useMemo(() => clashingSessionIds(sessions), [sessions]);
  const clashes = useMemo(() => findScheduleClashes(sessions), [sessions]);
  const clashKind = useMemo(() => {
    const kind = new Map<string, "room" | "teacher">();
    for (const c of clashes) {
      // A hall clash outranks a teacher clash in the label: it is the one the
      // center has to solve today, by moving a group.
      for (const id of [c.sessionId, c.otherSessionId]) {
        if (c.on === "room" || !kind.has(id)) kind.set(id, c.on);
      }
    }
    return kind;
  }, [clashes]);

  /** day index (0=Sun) -> sessions, each day ordered by start time. */
  const byDay = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const key = toDateKey(s.date instanceof Date ? s.date : new Date(s.date));
      const bucket = map.get(key);
      if (bucket) bucket.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [sessions]);

  // `-u-nu-latn` forces Latin digits inside the Arabic locale: the Ledger
  // keeps every FIGURE Latin and bidi-isolated, so a column header reading
  // "١٠ أغسطس" beside a range reading "2026-08-10" is two numbering systems on
  // one screen. Month and weekday names stay Arabic.
  const dayLabel = (d: Date) =>
    d.toLocaleDateString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  const statusLabel = (s: SessionRow) => {
    if (s.status === "cancelled") return t("adminManage.schedule.cancelled");
    if (s.status === "completed") return t("adminManage.schedule.completed");
    if (s.status === "postponed") return t("adminManage.schedule.postponed");
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("adminManage.schedule.title")}
        subtitle={t("adminManage.schedule.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label={t("adminManage.schedule.prevWeek")}
            >
              <ChevronRight className="size-4 rtl:hidden" />
              <ChevronLeft className="size-4 ltr:hidden" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              {t("adminManage.schedule.thisWeek")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label={t("adminManage.schedule.nextWeek")}
            >
              <ChevronLeft className="size-4 rtl:hidden" />
              <ChevronRight className="size-4 ltr:hidden" />
            </Button>
            <span className="ms-1 text-[13px] text-[var(--ink-3)]">
              <Num>{from}</Num> — <Num>{to}</Num>
            </span>
          </div>
        }
      />

      {/* The week's two facts, before the grid: how much is on, and how much of
          it is broken. A clash count of zero is worth stating — it is the
          reassurance the screen exists to give. */}
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-[var(--ink-2)]">
          {t("adminManage.schedule.sessionsCount", { n: sessions.length })}
        </span>
        <span
          className={
            clashes.length > 0
              ? "flex items-center gap-1.5 font-semibold text-destructive"
              : "text-[var(--ink-3)]"
          }
        >
          {clashes.length > 0 && <TriangleAlert className="size-4" />}
          {t("adminManage.schedule.clashCount", { n: clashes.length })}
        </span>
      </div>

      {query.isLoading ? (
        <PageSpinner label={t("adminManage.schedule.title")} />
      ) : sessions.length === 0 ? (
        <EmptyState title={t("adminManage.schedule.empty")} />
      ) : (
        <div className="overflow-x-auto">
          {/* Seven columns that never collapse below a readable width: a week
              is only legible as a week, so it scrolls sideways on a phone
              rather than reflowing into a list that hides the shape. */}
          <div className="grid min-w-[900px] grid-cols-7 gap-2">
            {WEEK_DAYS.map((offset) => {
              const day = addDays(weekStart, offset);
              const key = pickedDateKey(day);
              const items = byDay.get(key) ?? [];
              // `todayKey()` — "what day is it for the user", resolved on Cairo
              // wall-clock. `toDateKey(new Date())` is the other bug in the
              // same family: before 02:00 local it still says yesterday.
              const isToday = key === todayKey();
              return (
                <div key={key} className="flex flex-col gap-2">
                  <div
                    className={`rounded-(--radius-step-sm) px-2 py-1.5 text-center text-[12.5px] ${
                      isToday
                        ? "bg-[var(--indigo-soft)] font-semibold text-[var(--indigo)]"
                        : "text-[var(--ink-3)]"
                    }`}
                  >
                    {dayLabel(day)}
                  </div>

                  {items.length === 0 ? (
                    <div className="rounded-(--radius-step-md) border border-dashed border-[var(--rule)] p-3" />
                  ) : (
                    items.map((s) => {
                      const clashing = clashIds.has(s.id);
                      const dimmed = s.status === "cancelled";
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => setSettling(s)}
                          className={`w-full cursor-pointer rounded-(--radius-step-md) border p-2.5 text-start text-[12.5px] ${
                            clashing
                              ? "border-destructive bg-[var(--red-soft)]"
                              : "border-[var(--rule)]"
                          } ${dimmed ? "opacity-55" : ""}`}
                        >
                          {/* <Num.ClockRange> is ONE island around the whole
                              range, never one per time — two separately
                              isolated spans in an RTL row lay out
                              right-to-left, so 4:00–6:00 renders as 6:00–4:00,
                              a lesson that appears to end before it starts. */}
                          <div className="mb-1 font-semibold text-[var(--ink)]">
                            <Num.ClockRange
                              start={s.startTime}
                              end={s.endTime}
                              locale={locale}
                            />
                          </div>
                          <div className={dimmed ? "line-through" : ""}>{s.courseName}</div>
                          <div className="mt-0.5 text-[var(--ink-3)]">{s.teacherName}</div>
                          <div className="mt-0.5 text-[var(--ink-3)]">
                            {s.roomName || t("adminManage.schedule.noRoom")}
                          </div>
                          {statusLabel(s) && (
                            <div className="mt-1.5">
                              <Badge tone={s.status === "cancelled" ? "failed" : "pending"}>
                                {statusLabel(s)}
                              </Badge>
                            </div>
                          )}
                          {clashing && (
                            <div className="mt-1.5 flex items-center gap-1 font-semibold text-destructive">
                              <TriangleAlert className="size-3.5" />
                              {clashKind.get(s.id) === "room"
                                ? t("adminManage.schedule.clashRoom")
                                : t("adminManage.schedule.clashTeacher")}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!settling} onOpenChange={(o) => !o && setSettling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{settling?.courseName}</DialogTitle>
          </DialogHeader>
          {settling ? <SettleLessonCard sessionId={settling.id} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
