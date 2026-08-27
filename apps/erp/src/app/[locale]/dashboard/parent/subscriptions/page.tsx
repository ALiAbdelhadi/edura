"use client";

import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { SkeletonRows } from "@repo/ui/components/ledger";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Link } from "@/i18n/navigation";
import { useChildSelector } from "@/components/ui/child-selector";
import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";

export default function Page() {
  const t = useTranslations();
  const { childId, childName, isLoading } = useChildSelector();

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          eyebrow={t("roles.parent")}
          title={t("nav.childSubscriptions")}
        />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (!childId) {
    return (
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          eyebrow={t("roles.parent")}
          title={t("nav.childSubscriptions")}
        />
        <EmptyState
          icon={UsersRound}
          title={t("parentLinking.noLinkedChildren")}
          action={
            <Button asChild>
              <Link href="/dashboard/parent/children">
                {t("parentChild.link")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <SubscriptionsScreen
      studentId={childId}
      title={
        childName
          ? t("parentSubscriptions.titleFor", { name: childName })
          : t("nav.childSubscriptions")
      }
      subtitle={t("parentSubscriptions.subtitle")}
      emptyTitle={t("parentSubscriptions.noneTitle")}
      emptyHint={t("parentSubscriptions.noneHint")}
      emptyCta={t("parentDashboard.payFor", { name: childName })}
      renewHref="/dashboard/parent/pay"
    />
  );
}
