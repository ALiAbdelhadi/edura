"use client";

import { useTranslations } from "next-intl";
import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";

/**
 * اشتراكاتي — the student reading their own.
 *
 * The screen is shared with the parent portal, which reads one approved
 * child's rows off the same endpoint. Only the sentences differ, so they
 * arrive from here; see `subscriptions-screen.tsx`.
 */
export default function StudentSubscriptionsPage() {
  const t = useTranslations();

  return (
    <SubscriptionsScreen
      title={t("nav.subscriptions")}
      subtitle={t("studentSubscriptions.subtitle")}
      emptyTitle={t("studentSubscriptions.noneTitle")}
      emptyHint={t("studentSubscriptions.noneHint")}
      emptyCta={t("studentDashboard.quickSubscribe")}
      renewHref="/dashboard/student/subjects"
    />
  );
}
