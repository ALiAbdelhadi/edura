"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Chip, Eyebrow, Sheet } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { todayKey } from "@repo/shared/date-key";

const TONE = { present: "teal", late: "amber", absent: "red" } as const;

type Record_ = { date?: string; status: "present" | "absent" | "late" };

export function ChildTodayLine({
  childId,
  childName,
  href,
}: {
  childId: string;
  childName: string;
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
