"use client";

import { useTranslations } from "next-intl";
import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";

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
