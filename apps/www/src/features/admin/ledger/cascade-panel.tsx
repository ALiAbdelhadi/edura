/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { api } from "@/lib/api/client";
import { Textarea } from "@repo/ui/components/textarea";
import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { TwoStepCommit, FinalityNotice } from "./commit";
import { Num } from "./num";
import { Eyebrow } from "./primitives";

/**
 * The enrollments endpoint returns a FLAT row (`courseName`, `subject`,
 * `schedulePattern`), not a nested `course` object. Reading `course.title` here
 * silently produced "Unknown class" on every line — which in a cascade preview
 * is worse than no preview, because it looks itemised while telling you nothing.
 */
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

/**
 * CASCADE PREVIEW — the first non-money action to earn the decision panel.
 *
 * Blacklisting is the most consequential non-money action in the product. The
 * truth an operator needs before committing is: *this action has consequences
 * you cannot see from here, and they are recorded so they can be undone.*
 *
 * So the panel shows the cascade ITEMISED, not counted. The list is fetched from
 * `GET /enrollments?studentId=…&status=active`, which the API scopes to the
 * caller's own centerId — the exact same predicate the service cascades on
 * (`{ studentId, status: "active", centerId }` in blacklist.ts). The preview is
 * therefore the real set, not an estimate of it.
 *
 * Two things are stated that the operator cannot otherwise know:
 *   1. the withdrawals are journalled and a lift replays exactly them;
 *   2. no money moves — blacklisting refunds nothing and cancels no subscription.
 *
 * Posted as a reusable pattern: other consequential non-money actions
 * (deactivation, removal from a class) should follow this shape rather than
 * inventing their own.
 */
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
        <h2 className="mt-1.5 mb-0 text-[17px] font-bold text-[var(--ink)]">
          {t("adminHome.students_cascade_title", { name: studentName })}
        </h2>
      </div>

      <div className="lg-field p-3.5">
        <Eyebrow>{t("adminHome.students_cascade_whatHappens")}</Eyebrow>

        {rows === null ? (
          <p className="mt-2 mb-0 text-[13px] text-[var(--ink-3)]">
            {t("adminHome.students_cascade_loading")}
          </p>
        ) : count === 0 ? (
          <p className="mt-2 mb-0 text-[13px] leading-relaxed text-[var(--ink-2)]">
            {t("adminHome.students_cascade_none")}
          </p>
        ) : (
          <>
            <p className="mt-2 mb-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              {t("adminHome.students_cascade_countLine", { n: count })}
            </p>
            {/* Itemised, not counted — the operator sees what they are taking
                away, one line each. */}
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {rows.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-2 last:border-b-0"
                >
                  <span className="text-[13px] text-[var(--ink)]">
                    {e.courseName ?? t("adminHome.students_cascade_unknownCourse")}
                  </span>
                  {e.schedulePattern?.startTime ? (
                    <Num className="shrink-0 text-xs text-[var(--ink-3)]">
                      {e.schedulePattern.startTime}–{e.schedulePattern.endTime}
                    </Num>
                  ) : e.subject ? (
                    <span className="shrink-0 text-xs text-[var(--ink-3)]">{e.subject}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="m-0 text-xs leading-relaxed text-[var(--ink-2)]">
        {t("adminHome.students_cascade_reversible")}
      </p>
      <p className="m-0 text-xs leading-relaxed text-[var(--ink-2)]">
        {t("adminHome.students_cascade_moneyNote")}
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="blacklist-reason"
          className="text-xs font-semibold text-[var(--ink)]"
        >
          {t("adminHome.students_cascade_reasonLabel")}
        </label>
        {/* A blacklist with no reason is a bug — the field gates the commit. */}
        <Textarea
          id="blacklist-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("adminHome.students_cascade_reasonPlaceholder")}
        />
      </div>

      {/* The red notice states what becomes true on commit — NOT the
          reversibility line above it, which is the reassurance. Repeating the
          reassurance in the finality slot tells the operator nothing. */}
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
