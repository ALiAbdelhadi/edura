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

/**
 * اشتراكات {الابن} — "الاشتراك خلص؟", answered for one child.
 *
 * ── WHY THIS PAGE DID NOT EXIST ───────────────────────────────────────────
 *
 * `GET /me/subscriptions?studentId=` has been parent-scoped since Step 4 —
 * `listMySubscriptions` requires the parameter for a parent and calls
 * `assertApprovedChild` — and it had ZERO consumers in this portal. So the
 * third of a parent's five daily questions had no answer anywhere in the
 * product, while the thing that DID occupy the space, «الرسوم المستحقة», was a
 * figure the client invented. See CLEANUP_NOTES.md §7.
 *
 * The screen is the student's, shared: identical rows, different sentences.
 * "جدّد" points at the parent's own Pay screen rather than the student's
 * Subjects, because that is where a parent's money path starts — no new money
 * path, and nothing on this page writes.
 */
export default function Page() {
  const t = useTranslations();
  const { childId, childName, isLoading } = useChildSelector();

  // Loading is not empty — the same distinction the attendance page draws.
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
