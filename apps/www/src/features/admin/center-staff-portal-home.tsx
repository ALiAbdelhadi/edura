"use client";

import { api } from "@/lib/api/client";
import { BarChart3, CheckCircle2, DollarSign, Handshake, Home, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import React, { useEffect, useState } from "react";
import { Badge, PageHead, Sheet } from "./ledger";

type StaffRole = "receptionist" | "manager" | "center_accountant";

type Me = { role: StaffRole; title: string | null; centerName: string | null };

/**
 * Every card is a door. `href` is deliberately NOT nullable: a card without a
 * destination renders as an affordance for something the operator cannot reach,
 * which is the same defect as a nav entry for an unbuilt feature. Making it
 * required means that mistake is a type error rather than a dead tile.
 *
 * Several cards share a destination because one screen genuinely hosts several
 * capabilities — walk-in registration lives on the check-in screen, cash top-up
 * lives on the student detail screen behind the student list. The card names the
 * capability; the href names where it is performed.
 *
 * Sub-roles differ by ABSENCE, not disablement: a receptionist has no rooms
 * entry at all, rather than a greyed one. A disabled control advertises a
 * capability the account does not have.
 */
const CARDS: Record<StaffRole, { key: string; href: string; icon: React.ElementType }[]> = {
  receptionist: [
    { key: "checkin", href: "/dashboard/staff/checkin", icon: CheckCircle2 },
    { key: "walkin", href: "/dashboard/staff/checkin", icon: Users },
    { key: "topup", href: "/dashboard/staff/students", icon: DollarSign },
    { key: "students", href: "/dashboard/staff/students", icon: Users },
  ],
  manager: [
    { key: "checkin", href: "/dashboard/staff/checkin", icon: CheckCircle2 },
    { key: "students", href: "/dashboard/staff/students", icon: Users },
    { key: "rooms", href: "/dashboard/staff/rooms", icon: Home },
    { key: "collaboration", href: "/dashboard/staff/collaborations", icon: Handshake },
    { key: "opsReports", href: "/dashboard/staff/reports", icon: BarChart3 },
  ],
  center_accountant: [{ key: "finance", href: "/dashboard/staff/finance", icon: DollarSign }],
};

export function CenterStaffPortalHome() {
  const t = useTranslations();
  const [me, setMe] = useState<Me | null>(null);

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

  const cards = CARDS[me.role] ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={me.centerName ?? t("centerStaff.portalTitle")}
        subtitle={t(`centerStaff.roleDesc.${me.role}` as Parameters<typeof t>[0])}
        actions={
          <Badge tone="info" icon={<ShieldCheck className="size-3.5" />}>
            {t(`centerStaff.roleName.${me.role}` as Parameters<typeof t>[0])}
          </Badge>
        }
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.key}
              href={c.href}
              className="lg-card flex min-h-[76px] items-center gap-3.5 p-4 transition-colors hover:bg-[var(--rule-2)]"
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-[7px] bg-[var(--indigo-soft)] text-[var(--indigo)]"
              >
                <Icon className="size-5" />
              </span>
              <span className="text-[15px] font-semibold text-[var(--ink)]">
                {t(`centerStaff.can.${c.key}` as Parameters<typeof t>[0])}
              </span>
            </Link>
          );
        })}
      </div>

      {/*
        The accountant tier appears on no messaging edge in chat-scope.ts, so it
        reaches nobody and gets no Messages entry in the sidebar. Absence without
        explanation reads as a broken portal; state the boundary instead.
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
