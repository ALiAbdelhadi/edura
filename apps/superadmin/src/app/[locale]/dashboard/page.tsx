"use client";

import { useRouter } from "@/i18n/navigation";
import type { MeResponse } from "@/lib/refine";
import { useGetIdentity } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

const ROLE_HOME: Record<string, string> = {
  super_admin: "/dashboard/superadmin",
  accountant: "/dashboard/finance",
};

export default function DashboardRouter() {
  const router = useRouter();
  const t = useTranslations();
  const { data: identity, isLoading } = useGetIdentity<MeResponse>({ queryOptions: { refetchOnMount: false } });

  useEffect(() => {
    if (isLoading) return;
    if (!identity) {
      router.replace("/login");
      return;
    }
    router.replace(ROLE_HOME[identity.role] ?? "/login");
  }, [identity, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-sm text-ink-2">{t("common.loading")}</div>
    </div>
  );
}
