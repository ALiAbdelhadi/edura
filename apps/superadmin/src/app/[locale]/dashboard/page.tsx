"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGetIdentity } from "@refinedev/core";
import type { MeResponse } from "@/lib/refine";

const ROLE_HOME: Record<string, string> = {
  super_admin: "/dashboard/superadmin",
  accountant: "/dashboard/finance",
};

export default function DashboardRouter() {
  const router = useRouter();
  const { data: identity, isLoading } = useGetIdentity<MeResponse>();

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
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}
