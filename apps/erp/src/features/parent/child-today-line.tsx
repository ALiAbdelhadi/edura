"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Chip, Eyebrow, Sheet } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { todayKey } from "@/features/sessions/session-time";

/**
 * "ابني راح الحصة النهاردة ولا لأ؟" — question number one, answered as a
 * yes/no about one day instead of a percentage and a coloured square.
 *
 * ── WHY IT SITS ABOVE THE NEXT-LESSON CARD ────────────────────────────────
 *
 * Because when it exists it outranks everything else on the screen. A parent
 * opening the app at six in the evening is asking about the lesson that has
 * already happened, not the one on Thursday. It renders NOTHING when today
 * holds no record — before the register is taken there is no answer, and an
 * em dash is not one — so the permanent hero leads on every other day.
 *
 * ── WHY THERE IS NO VERB ──────────────────────────────────────────────────
 *
 * "حضر" and "حضرت" are different words, and a parent of a daughter should not
 * read the wrong one. The status is a chip carrying `status.present` /
 * `.late` / `.absent` — the same vocabulary the attendance screen below it
 * uses, so the two cannot describe one register differently.
 *
 * Reads `me/attendance?studentId=` and nothing else. `useCustom` on that URL
 * shares React Query's cache with the record strip on the home and with the
 * attendance screen itself, so it costs no extra request on either.
 *
 * `href` is optional because this renders in two places: on the home it opens
 * the attendance page, and ON the attendance page it is already there — a card
 * that links to the screen you are looking at is a control that does nothing.
 */

const TONE = { present: "teal", late: "amber", absent: "red" } as const;

type Record_ = { date?: string; status: "present" | "absent" | "late" };

export function ChildTodayLine({
  childId,
  childName,
  href,
}: {
  childId: string;
  childName: string;
  /** Omit to render the line as a statement rather than a link. */
  href?: string;
}) {
  const t = useTranslations();
  const { result } = useCustom({
    url: `me/attendance?studentId=${childId}`,
    method: "get",
  });

  const records = ((result?.data as { records?: Record_[] } | undefined)
    ?.records ?? []) as Record_[];
  const key = todayKey();
  const today = records.filter((r) => r.date === key);
  if (today.length === 0) return null;

  // More than one lesson today: the worst outcome leads, because that is the
  // one a parent needs to ask about. A day with one absence and two present
  // marks is not a day to report as "حاضر".
  const worst =
    today.find((r) => r.status === "absent") ??
    today.find((r) => r.status === "late") ??
    today[0]!;

  const body = (
    <>
      <Eyebrow>{t("parentDashboard.todayEyebrow")}</Eyebrow>
      <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {childName}
      </span>
      <Chip tone={TONE[worst.status]}>{t(asKey(`status.${worst.status}`))}</Chip>
      {today.length > 1 ? (
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          {t("parentDashboard.todayCount", { count: today.length })}
        </span>
      ) : null}
    </>
  );

  const row = "flex flex-wrap items-center gap-x-3 gap-y-1.5 p-4";

  if (!href) return <Sheet className={row}>{body}</Sheet>;

  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
    >
      <Sheet className={`${row} transition-colors group-hover:border-[var(--indigo)]`}>
        {body}
      </Sheet>
    </Link>
  );
}
