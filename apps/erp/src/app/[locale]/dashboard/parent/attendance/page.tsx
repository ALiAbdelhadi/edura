"use client";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { useChildSelector } from "@/components/ui/child-selector";
import { AttendanceScreen } from "@/features/attendance/attendance-screen";
import { ChildTodayLine } from "@/features/parent/child-today-line";
import { ParentRecentAttendance } from "@/features/parent/parent-recent-attendance";
import { Link } from "@/i18n/navigation";
import { Button } from "@repo/ui/components/button";
import { SkeletonRows } from "@repo/ui/components/ledger";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations();
  const { childId, childName, isLoading } = useChildSelector();

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          eyebrow={t("roles.parent")}
          title={t("parentAttendance.title")}
          description={t("parentAttendance.subtitle")}
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
          title={t("parentAttendance.title")}
          description={t("parentAttendance.subtitle")}
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
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={
          childName
            ? t("parentAttendance.titleFor", { name: childName })
            : t("parentAttendance.title")
        }
        description={t("parentAttendance.subtitle")}
      />
      <ChildTodayLine childId={childId} childName={childName} />
      <AttendanceScreen
        studentId={childId}
        recent={<ParentRecentAttendance childId={childId} />}
      />
    </div>
  );
}
