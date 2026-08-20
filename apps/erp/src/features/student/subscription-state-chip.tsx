"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/features/student/ledger";
import type { SubscriptionState } from "@/features/student/subscriptions";

/**
 * One state, one chip, one vocabulary — rendered identically on the
 * subscriptions page and on a Subjects row.
 *
 * The tones are the Ledger's, used for what they mean and not for decoration:
 * teal = confirmed, amber = waiting on you, red = blocking, neutral = closed.
 * "قرب يخلص" is amber and not red because nothing is blocked yet; "خلص" is red
 * because the student will be turned away at a counter.
 */
export function SubscriptionStateChip({ state }: { state: SubscriptionState }) {
  const t = useTranslations("studentSubscriptions");

  switch (state.kind) {
    case "active":
      return <Chip tone="teal">{t("stateActive")}</Chip>;
    case "expiring":
      return <Chip tone="amber">{t("stateExpiring")}</Chip>;
    case "lapsed":
      return <Chip tone="red">{t("stateLapsed")}</Chip>;
    case "pending":
      return <Chip tone="amber">{t("statePending")}</Chip>;
    case "cancelled":
      return <Chip tone="neutral">{t("stateCancelled")}</Chip>;
  }
}

/**
 * The countdown in words, or null when there is nothing honest to count.
 *
 * A per-session pass reaches here with `daysLeft: null` and gets no phrase —
 * see the module header in `subscriptions.ts` for why it must not be given one.
 */
export function useCoverageWords() {
  const t = useTranslations("studentSubscriptions");

  return (state: SubscriptionState): string | null => {
    switch (state.kind) {
      case "active":
        return state.daysLeft === null ? null : t("daysLeft", { count: state.daysLeft });
      case "expiring":
        if (state.daysLeft <= 0) return t("endsToday");
        if (state.daysLeft === 1) return t("endsTomorrow");
        return t("daysLeft", { count: state.daysLeft });
      case "lapsed":
        return state.daysAgo === null ? t("stateLapsed") : t("lapsedAgo", { count: state.daysAgo });
      case "pending":
      case "cancelled":
        return null;
    }
  };
}
