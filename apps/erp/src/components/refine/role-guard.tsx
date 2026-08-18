"use client";

import { useRouter } from "@/i18n/navigation";
import { portalForRole } from "@/lib/auth/portal";
import type { MeResponse } from "@/lib/refine";
import { useGetIdentity } from "@refinedev/core";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";

export default function RoleGuard({
  allowedRole,
  children,
}: {
  allowedRole: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations();
  const { data: identity, isLoading } = useGetIdentity<MeResponse>();

  useEffect(() => {
    if (isLoading) return;
    if (!identity) {
      router.replace("/login");
      return;
    }
    if (identity.role !== allowedRole) {
      router.replace(portalForRole(identity.role) ?? "/login");
    }
  }, [isLoading, identity, allowedRole, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!identity || identity.role !== allowedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">{t("common.redirecting")}</div>
      </div>
    );
  }

  return <>{children}</>;
}
