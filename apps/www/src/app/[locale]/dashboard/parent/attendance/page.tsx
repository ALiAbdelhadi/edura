"use client";

import React from "react";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { AttendanceScreen } from "@/features/attendance/attendance-screen";
import { useChildSelector, ChildSelectorBar } from "@/components/ui/child-selector";
import { EmptyState } from "@/components/kit/empty-state";

export default function Page() {
  const t = useTranslations();
  const { childId } = useChildSelector();

  if (!childId) {
    return (
      <EmptyState
        icon={UsersRound}
        title={t("parentLinking.noLinkedChildren")}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ChildSelectorBar />
      <AttendanceScreen studentId={childId} />
    </div>
  );
}
