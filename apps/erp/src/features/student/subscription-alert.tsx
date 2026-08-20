"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { asArray } from "@/lib/refine/as-array";
import { LedgerButton, Sheet } from "@/features/student/ledger";
import { mostUrgent, type SubscriptionRow } from "@/features/student/subscriptions";
import { useCoverageWords } from "@/features/student/subscription-state-chip";

/**
 * "اشتراكك في الكيميا بيخلص بعد ٣ أيام" — on the home screen, and nowhere else.
 *
 * ── WHY A BANNER, WHEN THERE IS A WHOLE PAGE FOR THIS ─────────────────────
 *
 * Because the student does not go looking. A monthly plan is manual-renewal by
 * design, the expiry sweep flips it without telling anyone, and there is no
 * pre-expiry notification job — so the first signal today is being turned away
 * at a counter. A page answers the question when it is asked; this asks it for
 * them, once, on the screen they already open.
 *
 * ── WHAT KEEPS IT FROM BECOMING WALLPAPER ─────────────────────────────────
 *
 * `mostUrgent` returns at most ONE subscription, only inside the seven-day
 * window or within a fortnight of lapsing. So it appears when something is
 * actually about to break, and clears itself the moment the student renews or
 * stops caring — which is why it carries no dismiss button. Compare
 * `PracticeInvite`, which uses the same self-clearing rule.
 *
 * Nothing here writes: "جدّد" links into the Subjects checkout that already
 * exists, and the alert reads `GET /me/subscriptions` only.
 */
export function SubscriptionAlert() {
  const t = useTranslations("studentSubscriptions");
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
          <Link href="/dashboard/student/subjects">{t("renew")}</Link>
        </LedgerButton>
        <LedgerButton asChild>
          <Link href="/dashboard/student/subscriptions">{t("alertOpen")}</Link>
        </LedgerButton>
      </div>
    </Sheet>
  );
}
