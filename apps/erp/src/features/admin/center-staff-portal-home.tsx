"use client";

import { api } from "@/lib/api/client";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { Badge, PageHead, Sheet } from "./ledger";
import { CenterCounterScreen } from "./counter/center-counter-screen";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { staffTourSteps } from "@/features/admin/staff-tour/steps";

type StaffRole = "receptionist" | "manager" | "center_accountant";

type Me = { role: StaffRole; title: string | null; centerName: string | null };

export function CenterStaffPortalHome() {
  const t = useTranslations();
  const [me, setMe] = useState<Me | null>(null);
  // Declared above the loading return: hooks cannot sit behind a branch.
  const tour = useTourGate();

  useEffect(() => {
    api.get("center/staff/me").json<{ data: Me }>().then((r) => setMe(r.data)).catch(() => {});
  }, []);

  if (!me) {
    return (
      <div className="p-8 text-center text-[13px] text-[var(--ink-3)]">
        {t("centerStaff.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* First entry only. The STEPS depend on the sub-role, because this
          portal's navigation already does — a receptionist, a manager and an
          accountant do not share a job, and a step about revenue reports shown
          to a receptionist walks them to a door their tier does not open. */}
      <GuidedTour
        steps={staffTourSteps(me.role)}
        namespace="adminHome.staffTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      <PageHead
        title={me.centerName ?? t("centerStaff.portalTitle")}
        subtitle={t(`centerStaff.roleDesc.${me.role}` as Parameters<typeof t>[0])}
        actions={
          <Badge tone="info" icon={<ShieldCheck className="size-3.5" />}>
            {t(`centerStaff.roleName.${me.role}` as Parameters<typeof t>[0])}
          </Badge>
        }
      />

      {/*
        ONE ROW, NOT A STACK.

        The board, the shortcuts and the team board were three full-width bands
        down the middle of the page, each of them short, each with empty screen
        beside it — so the operator scrolled through three screens of mostly
        nothing. On `xl` the board takes the main column and the two small
        blocks become a side column beside it; below that they stack, which is
        right on the one column a phone has.

        `center_accountant` gets no board: that tier is read-only and the
        counter routes refuse it (allow: RECEPTION), so rendering it would show
        an operator a screen that 403s. Absence, not disablement — and with no
        board the side column simply becomes the page.
      */}
      {/*
        THE HOME IS THE BOARD, AND NOTHING ELSE.

        What used to sit beside it — four shortcut tiles and a compact copy of
        the team-notes board — were both second copies of things the sidebar
        already carries. The tiles pointed at pages already listed there (two of
        them at the SAME page as each other), and the notes board is its own nav
        entry at `/notes`. With the subtitle's prose above naming this desk's
        capabilities, one screen was saying the same thing three times.

        NOTHING WAS TAKEN AWAY: every destination is one click from the sidebar,
        and the two capabilities that are not their own page (walk-in
        registration, cash top-up) are still named in the subtitle so nobody has
        to guess which screen holds them.

        ONE CONSEQUENCE WORTH KNOWING: listing the notes board is what registers
        a read receipt, so staff receipts now register when they open `/notes`
        rather than on every visit here. The receipts still work; they just
        record reading rather than passing by, which is the more honest reading
        of "قرأها".
      */}
      {me.role === "receptionist" || me.role === "manager" ? (
        <CenterCounterScreen embedded />
      ) : null}

      {/*
        The accountant tier appears on no messaging edge in chat-scope.ts, so it
        reaches nobody and gets no Messages entry in the sidebar. Absence
        without explanation reads as a broken portal; state the boundary
        instead. This tier has no board above, so this IS its page.
      */}
      {me.role === "center_accountant" ? (
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
