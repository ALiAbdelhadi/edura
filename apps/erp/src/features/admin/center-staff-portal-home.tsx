"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";
import { Badge, PageHead, Sheet } from "./ledger";
import { CenterCounterScreen } from "./counter/center-counter-screen";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { staffTourSteps } from "@/features/admin/staff-tour/steps";

type StaffRole = "receptionist" | "manager" | "center_accountant";

export function CenterStaffPortalHome({
  role,
  centerName,
}: {
  role: StaffRole;
  centerName: string | null;
}) {
  const t = useTranslations();
  const tour = useTourGate();

  return (
    <div className="flex flex-col gap-5">
      <GuidedTour
        steps={staffTourSteps(role)}
        namespace="adminHome.staffTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      <PageHead
        title={centerName ?? t("centerStaff.portalTitle")}
        subtitle={t(`centerStaff.roleDesc.${role}` as Parameters<typeof t>[0])}
        actions={
          <Badge tone="info" icon={<ShieldCheck className="size-3.5" />}>
            {t(`centerStaff.roleName.${role}` as Parameters<typeof t>[0])}
          </Badge>
        }
      />

      {role === "receptionist" || role === "manager" ? (
        <CenterCounterScreen embedded />
      ) : null}

      {role === "center_accountant" ? (
        <Sheet className="p-4">
          <p className="m-0 text-[15px] font-semibold text-[var(--ink)]">
            {t("centerStaff.noMessagingTitle")}
          </p>
          <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-[var(--ink-2)]">
            {t("centerStaff.noMessagingBody")}
          </p>
        </Sheet>
      ) : null}

      <p className="m-0 text-xs text-[var(--ink-3)]">{t("centerStaff.auditNote")}</p>
    </div>
  );
}
