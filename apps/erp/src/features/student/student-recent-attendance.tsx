"use client";

import { useMemo } from "react";
import { useCustom, useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import {
  Chip,
  Hairline,
  InitialsTile,
  LedgerEmpty,
  SectionHeading,
  Sheet,
} from "@/features/student/ledger";
import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

/**
 * آخر الحصص — the attendance record with the lessons NAMED.
 *
 * ── WHAT WAS MISSING ──────────────────────────────────────────────────────
 *
 * The attendance page was three counters and a 28-day heatmap. Both answer
 * "how many", and neither answers the question a student actually argues
 * about: "الحصة اللي فاتت دي أنا كنت فيها، ليه مكتوب غايب؟". A grid of coloured
 * squares cannot be disputed, because it names nothing.
 *
 * ── NO NEW ENDPOINT ───────────────────────────────────────────────────────
 *
 * `me/attendance` returns `{ date, status, courseId }` per record, and the
 * portal already reads `enrollments`, which carries `courseName` for every
 * course the student is in. The join is the same one `student-materials-screen`
 * does. `useCustom` on the same URL shares React Query's cache with
 * `AttendanceScreen` above it, so this costs no extra request.
 *
 * A record whose course is not in the student's CURRENT enrollments — they left
 * the group, or it ended — keeps its date and its status and loses only its
 * name. Dropping the row would quietly shrink a record the counters above still
 * count.
 */

const SHOWN = 10;

type AttendanceRecord = {
  date: string;
  status: "present" | "absent" | "late";
  courseId?: string;
};

const TONE = { present: "teal", late: "amber", absent: "red" } as const;

export function StudentRecentAttendance() {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  // No `studentId` prop, deliberately. One was added speculatively for a parent
  // reading a child's record, and nothing ever passed it — but worse than
  // unused, it would have been a lie: the course names come from the CALLER's
  // own `enrollments`, and a parent's enrollments are not their child's. The
  // prop would have offered a parent view returning the right dates against the
  // wrong subjects.
  const { query, result } = useCustom({ url: "me/attendance", method: "get" });
  const { result: enrollmentsResult } = useList({ resource: "enrollments" });

  const courseNames = useMemo(() => {
    const rows = (enrollmentsResult?.data ?? []) as {
      courseId?: { toString?: () => string } | string;
      courseName?: string;
    }[];
    const map = new Map<string, string>();
    for (const e of rows) {
      const id = typeof e.courseId === "string" ? e.courseId : e.courseId?.toString?.();
      if (id && e.courseName) map.set(id, e.courseName);
    }
    return map;
  }, [enrollmentsResult?.data]);

  const summary = result?.data as { records?: AttendanceRecord[] } | undefined;
  // The endpoint orders by `created_at` descending, which is the order the
  // register was TAKEN. That is what "آخر الحصص" means — the newest entries —
  // so it is kept rather than re-sorted by lesson date.
  const records = (summary?.records ?? []).filter((r) => Boolean(r.date)).slice(0, SHOWN);

  if (query.isLoading) return <PageSpinner />;

  return (
    <Sheet className="p-5">
      <SectionHeading title={t("attendanceView.recentTitle")} />
      <div className="mt-3">
        {records.length === 0 ? (
          <LedgerEmpty title={t("studentClass.noAttendance")} />
        ) : (
          <ul>
            {records.map((r, i) => {
              const name = (r.courseId && courseNames.get(r.courseId)) || null;
              return (
                <li key={`${r.date}-${r.courseId ?? i}-${i}`}>
                  {i > 0 ? <Hairline /> : null}
                  <div className="flex items-center gap-3 py-3">
                    <InitialsTile
                      name={name ?? "?"}
                      size={30}
                      tone={r.status === "present" ? "teal" : "indigo"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>
                        {name ?? t("attendanceView.pastCourse")}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                        {/* The weekday is how anyone recalls a lesson. Not
                            wrapped in <Num>: the month and the weekday are
                            words, and that isolate is for figures. */}
                        {formatDate(r.date, { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                    </div>
                    <Chip tone={TONE[r.status]}>{t(asKey(`status.${r.status}`))}</Chip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
