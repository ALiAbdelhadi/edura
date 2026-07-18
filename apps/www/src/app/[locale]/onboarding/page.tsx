"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useRouter } from "@/i18n/navigation";
import { StudentWizard } from "@/features/onboarding/student-wizard";
import { TeacherWizard } from "@/features/onboarding/teacher-wizard";
import { CenterWizard } from "@/features/onboarding/center-wizard";

const DASHBOARD_BY_ROLE: Record<string, string> = {
  student: "/dashboard/student",
  teacher: "/dashboard/teacher",
  parent: "/dashboard/parent",
  center_admin: "/dashboard/admin",
  super_admin: "/dashboard/superadmin",
  accountant: "/dashboard/finance",
};

export default function OnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editMode = params.get("edit") === "1";
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/api/v1/me");
        if (meRes.status === 401) return router.replace("/login");
        const me = (await meRes.json()).data;
        if (me.role !== "student" && me.role !== "teacher" && me.role !== "center_admin")
          return router.replace(DASHBOARD_BY_ROLE[me.role] ?? "/dashboard/student");

        const obRes = await fetch("/api/v1/me/onboarding");
        const ob = (await obRes.json()).data;
        if (ob?.onboardingCompleted && !editMode)
          return router.replace(DASHBOARD_BY_ROLE[me.role] ?? "/");

        if (!cancelled) setRole(me.role);
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, editMode]);

  if (role === "student") return <StudentWizard />;
  if (role === "teacher") return <TeacherWizard />;
  if (role === "center_admin") return <CenterWizard />;
  return (
    <div className="mx-auto grid max-w-2xl gap-4 px-4 py-16">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
