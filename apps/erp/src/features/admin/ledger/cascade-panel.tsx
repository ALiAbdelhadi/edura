/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Num as UiNum } from "@repo/ui/components/num";
import { Textarea } from "@repo/ui/components/textarea";
import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { FinalityNotice, TwoStepCommit } from "./commit";
import { Eyebrow } from "./primitives";

type Enrollment = {
  id: string;
  courseId?: string;
  courseName?: string | null;
  subject?: string | null;
  schedulePattern?: {
    daysOfWeek?: number[];
    startTime?: string;
    endTime?: string;
  } | null;
};

export function BlacklistCascadePanel({
  studentId,
  studentName,
  onCommit,
  busy,
}: {
  studentId: string;
  studentName: string;
  onCommit: (reason: string) => void;
  busy?: boolean;
}) {
  const t = useTranslations();
  const { locale } = useFormatters();
  const [rows, setRows] = React.useState<Enrollment[] | null>(null);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setRows(null);
    api
      .get(`enrollments?studentId=${encodeURIComponent(studentId)}&status=active`)
      .json<{ data: Enrollment[] | { items: Enrollment[] } }>()
      .then((r) => {
        if (cancelled) return;
        const d = r.data as any;
        setRows(Array.isArray(d) ? d : (d?.items ?? []));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const count = rows?.length ?? 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Eyebrow>{t("adminHome.students_cascade_eyebrow")}</Eyebrow>
        <h2 className="mt-1.5 mb-0 text-[17px] font-bold text-(--ink)">
          {t("adminHome.students_cascade_title", { name: studentName })}
        </h2>
      </div>
      <div className="lg-field p-3.5">
        <Eyebrow>{t("adminHome.students_cascade_whatHappens")}</Eyebrow>
        {rows === null ? (
          <p className="mt-2 mb-0 text-[13px] text-(--ink-3)">
            {t("adminHome.students_cascade_loading")}
          </p>
        ) : count === 0 ? (
          <p className="mt-2 mb-0 text-[13px] leading-relaxed text-(--ink-2)">
            {t("adminHome.students_cascade_none")}
          </p>
        ) : (
          <>
            <p className="mt-2 mb-2 text-[13px] leading-relaxed text-(--ink-2)">
              {t("adminHome.students_cascade_countLine", { n: count })}
            </p>
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {rows.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 border-b border-(--rule-2) py-2 last:border-b-0"
                >
                  <span className="text-[13px] text-(--ink)">
                    {e.courseName ?? t("adminHome.students_cascade_unknownCourse")}
                  </span>
                  {e.schedulePattern?.startTime ? (
                    <UiNum.ClockRange
                      start={e.schedulePattern.startTime}
                      end={e.schedulePattern.endTime}
                      locale={locale}
                      className="shrink-0 text-xs text-(--ink-3)"
                    />
                  ) : e.subject ? (
                    <span className="shrink-0 text-xs text-(--ink-3)">{e.subject}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="m-0 text-xs leading-relaxed text-(--ink-2)">
        {t("adminHome.students_cascade_reversible")}
      </p>
      <p className="m-0 text-xs leading-relaxed text-(--ink-2)">
        {t("adminHome.students_cascade_moneyNote")}
      </p>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="blacklist-reason"
          className="text-xs font-semibold text-(--ink)"
        >
          {t("adminHome.students_cascade_reasonLabel")}
        </label>
        <Textarea
          id="blacklist-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("adminHome.students_cascade_reasonPlaceholder")}
        />
      </div>
      <FinalityNotice>{t("adminHome.students_cascade_finality")}</FinalityNotice>
      <TwoStepCommit
        resetKey={studentId}
        icon={<Ban className="size-4" />}
        label={
          count > 0
            ? t("adminHome.students_cascade_commit", { n: count })
            : t("adminHome.students_cascade_commitNone")
        }
        armedLabel={t("adminHome.students_cascade_armed")}
        hint={t("adminHome.students_cascade_hint")}
        armedHint={t("adminHome.students_cascade_armedHint")}
        disabled={!reason.trim() || rows === null}
        busy={busy}
        onCommit={() => onCommit(reason.trim())}
      />
    </div>
  );
}
