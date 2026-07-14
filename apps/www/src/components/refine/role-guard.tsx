"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGetIdentity } from "@refinedev/core";
import type { MeResponse } from "@/lib/refine";

export default function RoleGuard({
  allowedRole,
  children,
}: {
  allowedRole: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!identity || identity.role !== allowedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Redirecting…</div>
      </div>
    );
  }

  return <>{children}</>;
}
