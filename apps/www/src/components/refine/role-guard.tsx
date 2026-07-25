"use client";

import type { MeResponse } from "@/lib/refine";
import { useGetIdentity } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
    if (!isLoading && identity) {
      if (identity.role !== allowedRole) {
        router.replace("/dashboard");
      }
    }
    if (!isLoading && !identity) {
      router.replace("/login");
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
