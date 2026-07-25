"use client";

import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Card } from "@repo/ui/components/card";
import { BarChart3, CheckCircle2, DollarSign, Handshake, Home, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import React, { useEffect, useState } from "react";

type StaffRole = "receptionist" | "manager" | "center_accountant";

type Me = { role: StaffRole; title: string | null; centerName: string | null };

const CARDS: Record<StaffRole, { key: string; href: string | null; icon: React.ElementType }[]> = {
  receptionist: [
    { key: "checkin", href: "/dashboard/staff/checkin", icon: CheckCircle2 },
    { key: "walkin", href: "/dashboard/staff/checkin", icon: Users },
    { key: "topup", href: "/dashboard/staff/checkin", icon: DollarSign },
    { key: "students", href: "/dashboard/staff/students", icon: Users },
  ],
  manager: [
    { key: "checkin", href: "/dashboard/staff/checkin", icon: CheckCircle2 },
    { key: "students", href: "/dashboard/staff/students", icon: Users },
    { key: "rooms", href: "/dashboard/staff/rooms", icon: Home },
    { key: "collaboration", href: null, icon: Handshake },
    { key: "opsReports", href: "/dashboard/staff/reports", icon: BarChart3 },
  ],
  center_accountant: [
    { key: "finance", href: "/dashboard/staff/finance", icon: DollarSign },
  ],
};

export function CenterStaffPortalHome() {
  const t = useTranslations();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api.get("center/staff/me").json<{ data: Me }>().then((r) => setMe(r.data)).catch(() => {});
  }, []);

  if (!me) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const cards = CARDS[me.role] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={me.centerName ?? t("centerStaff.portalTitle")}
        description={t(`centerStaff.roleDesc.${me.role}` as Parameters<typeof t>[0])}
        actions={
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="size-3.5" />
            {t(`centerStaff.roleName.${me.role}` as Parameters<typeof t>[0])}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const inner = (
            <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <span className="font-medium text-foreground">
                {t(`centerStaff.can.${c.key}` as Parameters<typeof t>[0])}
              </span>
            </Card>
          );
          return c.href ? (
            <Link key={c.key} href={c.href}>
              {inner}
            </Link>
          ) : (
            <div key={c.key}>{inner}</div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("centerStaff.auditNote")}</p>
    </div>
  );
}
