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

/**
 * "اشتراك نور في الكيميا بيخلص بعد ٣ أيام" — on the parent's home, and
 * nowhere else.
 *
 * ── WHAT IT REPLACES, AND WHY THAT MATTERS ────────────────────────────────
 *
 * The card that stood in this position was «الرسوم المستحقة», and it was
 * computed on the client as `max(Σ enrollments.coursePrice − Σ payments, 0)`.
 * There is no outstanding-balance concept in this product — a subscription is
 * coverage for a period, not a debt, and pay-later is explicitly deferred in
 * CLAUDE.md — so that number counted each active enrollment's list price once
 * regardless of plan or months elapsed, subtracted every payment ever made,
 * and floored at zero so the disagreement never showed. A parent who
 * screenshotted it was holding a figure no server could recognise.
 *
 * This is the honest form of the same worry. It reads
 * `GET /me/subscriptions?studentId=` — parent-scoped since Step 4, with the
 * coverage window on every row, and until now with ZERO parent consumers.
 *
 * ── WHAT KEEPS IT FROM BECOMING WALLPAPER ─────────────────────────────────
 *
 * `mostUrgent` returns at most ONE subscription, only inside the seven-day
 * window or within a fortnight of lapsing. So it appears when something is
 * actually about to break and clears itself when the parent renews — which is
 * why it carries no dismiss button.
 *
 * Nothing here writes. "جدّد" links into the existing Pay screen, which is the
 * one money path.
 */
export function ChildSubscriptionAlert({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const t = useTranslations("parentSubscriptions");
  // "جدّد" and the countdown say nothing about who — they come from the neutral
  // vocabulary both portals read. Only the TITLE names the child, and that is
  // the whole reason this component exists rather than the student's.
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
