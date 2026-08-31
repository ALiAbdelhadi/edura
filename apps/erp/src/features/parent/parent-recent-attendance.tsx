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
} from "@/components/ledger";
import { QuerySection } from "@repo/ui/components/query-section";
import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

const SHOWN = 10;

type AttendanceRecord = {
  date: string;
  status: "present" | "absent" | "late";
  courseId?: string;
};

const TONE = { present: "teal", late: "amber", absent: "red" } as const;

export function ParentRecentAttendance({ childId }: { childId: string }) {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  const { query, result } = useCustom({
    url: `me/attendance?studentId=${childId}`,
    method: "get",
  });
  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: [{ field: "studentId", operator: "eq", value: childId }],
    queryOptions: { enabled: Boolean(childId) },
  });

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
  const records = (summary?.records ?? []).filter((r) => Boolean(r.date)).slice(0, SHOWN);

  return (
    <Sheet className="p-5">
      <SectionHeading title={t("attendanceView.recentTitle")} />
      <div className="mt-3">
        <QuerySection
          query={query}
          skeleton={<PageSpinner />}
          isEmpty={records.length === 0}
          empty={<LedgerEmpty title={t("studentClass.noAttendance")} />}
        >
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
                        {formatDate(r.date, { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                    </div>
                    <Chip tone={TONE[r.status]}>{t(asKey(`status.${r.status}`))}</Chip>
                  </div>
                </li>
              );
            })}
          </ul>
        </QuerySection>
      </div>
    </Sheet>
  );
}
