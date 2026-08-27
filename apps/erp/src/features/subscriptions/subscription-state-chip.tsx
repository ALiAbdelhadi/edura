"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/components/ledger";
import type { SubscriptionState } from "./subscription-state";

export function SubscriptionStateChip({ state }: { state: SubscriptionState }) {
  const t = useTranslations("shared.subscriptions");

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

export function useCoverageWords() {
  const t = useTranslations("shared.subscriptions");

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
