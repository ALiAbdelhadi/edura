"use client";

import { portalForRole } from "@/lib/auth/portal";
import type { MeResponse } from "@/lib/refine";
import { useGetIdentity } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
      // Go straight to the portal this identity actually owns. Redirecting to
      // "/dashboard" instead made the mismatch a LOOP whenever the role router
      // disagreed about who was signed in: it sent the user back here, and this
      // guard sent them back there. Resolving from `identity` — the same server
      // answer the role router now uses — is a fixed point: one hop, no bounce.
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
