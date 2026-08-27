"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { asArray } from "@/lib/refine/as-array";
import { LedgerButton, Sheet } from "@/features/student/ledger";
import { mostUrgent, type SubscriptionRow } from "@/features/subscriptions/subscription-state";
import { useCoverageWords } from "@/features/subscriptions/subscription-state-chip";

export function SubscriptionAlert() {
  const t = useTranslations("studentSubscriptions");
  const tShared = useTranslations("shared.subscriptions");
  const words = useCoverageWords();
  const { result } = useCustom({ url: "me/subscriptions", method: "get" });

  const urgent = mostUrgent(asArray<SubscriptionRow>(result?.data));
  if (!urgent) return null;

  const { sub, state } = urgent;
  const course = sub.course?.title ?? "";
  const lapsed = state.kind === "lapsed";
  const detail = words(state);

  return (
    <Sheet
      blocking={lapsed}
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      style={lapsed ? undefined : { borderColor: "var(--amber)" }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <CalendarClock
          className="mt-0.5 size-4 shrink-0"
          style={{ color: lapsed ? "var(--red)" : "var(--amber)" }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {lapsed ? t("alertLapsedTitle", { course }) : t("alertExpiringTitle", { course })}
          </p>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-2)" }}>
            {detail ? `${detail} · ` : ""}
            {t("alertBody")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <LedgerButton variant="primary" asChild>
          <Link href="/dashboard/student/subjects">{tShared("renew")}</Link>
        </LedgerButton>
        <LedgerButton asChild>
          <Link href="/dashboard/student/subscriptions">{t("alertOpen")}</Link>
        </LedgerButton>
      </div>
    </Sheet>
  );
}
