"use client";

import { StudentReceiptsSection } from "@/features/student/student-receipts-section";
import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";
import { WALLET_ENABLED } from "@/lib/config/features";
import { useTranslations } from "next-intl";

export default function StudentSubscriptionsPage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <SubscriptionsScreen
        title={t("nav.subscriptions")}
        subtitle={t("studentSubscriptions.subtitle")}
        emptyTitle={t("studentSubscriptions.noneTitle")}
        emptyHint={t("studentSubscriptions.noneHint")}
        emptyCta={t("studentDashboard.quickSubscribe")}
        renewHref="/dashboard/student/subjects"
      />
      {/* Without the wallet screen its receipts tab is gone, so card receipts live here. */}
      {WALLET_ENABLED ? null : <StudentReceiptsSection />}
    </div>
  );
}
