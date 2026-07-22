"use client";

// Manager operational reports — scoped to the endpoints a manager may hit.
// Uses ONLY dashboards/admin (financial fields are stripped server-side for a
// manager) so no financial endpoint is ever called from this screen.
import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/components/card";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";

type Dash = {
  totals: { students: number; teachers: number; activeCourses: number };
  attendanceRate: number;
  pendingEnrollmentRequests: number;
  analytics: {
    courseFillRates: { title: string; enrolled: number; max: number; pct: number }[];
  };
};

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </Card>
  );
}

export function CenterStaffReportsScreen() {
  const t = useTranslations();
  const [d, setD] = useState<Dash | null>(null);

  useEffect(() => {
    api.get("dashboards/admin").json<{ data: Dash }>().then((r) => setD(r.data)).catch(() => {});
  }, []);

  if (!d) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("centerStaff.can.opsReports")} description={t("centerStaff.roleDesc.manager")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("nav.students")} value={d.totals.students} />
        <Kpi label={t("nav.teachers")} value={d.totals.teachers} />
        <Kpi label={t("nav.courses")} value={d.totals.activeCourses} />
        <Kpi label={t("nav.attendance")} value={`${d.attendanceRate}%`} />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 font-semibold text-foreground">
          {t("nav.courses")}
        </div>
        {d.analytics.courseFillRates.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">—</p>
        ) : (
          <ul>
            {d.analytics.courseFillRates.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{c.title}</span>
                <span className="text-muted-foreground">
                  {c.enrolled}/{c.max}
                </span>
                <span className="w-12 text-end font-medium text-foreground">{c.pct}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
