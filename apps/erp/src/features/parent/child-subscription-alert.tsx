"use client";

import { useCustom } from "@refinedev/core";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { LedgerButton, Sheet } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { asArray } from "@/lib/refine/as-array";
import {
  mostUrgent,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-state";
import { useCoverageWords } from "@/features/subscriptions/subscription-state-chip";

export function ChildSubscriptionAlert({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const t = useTranslations("parentSubscriptions");
  const tShared = useTranslations("shared.subscriptions");
  const words = useCoverageWords();
  const { result } = useCustom({
    url: `me/subscriptions?studentId=${childId}`,
    method: "get",
  });

  const urgent = mostUrgent(asArray<SubscriptionRow>(result?.data));
  if (!urgent) return null;

  const { sub, state } = urgent;
  const course = sub.course?.title ?? "";
  const lapsed = state.kind === "lapsed";

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
            {lapsed
              ? t("alertLapsedTitle", { name: childName, course })
              : t("alertExpiringTitle", { name: childName, course })}
          </p>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-2)" }}>
            {words(state) ?? t("alertBody")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0">
        <LedgerButton variant="primary" asChild>
          <Link href="/dashboard/parent/pay">
            {tShared("renew")}
          </Link>
        </LedgerButton>
      </div>
    </Sheet>
  );
}
