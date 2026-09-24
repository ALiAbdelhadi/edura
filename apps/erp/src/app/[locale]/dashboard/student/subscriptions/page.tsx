"use client";

import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";
import { useTranslations } from "next-intl";

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
