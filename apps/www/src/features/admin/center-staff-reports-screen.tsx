"use client";

import { api } from "@/lib/api/client";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { EmptyState, Eyebrow, Num, PageHead, Sheet, SheetHead } from "./ledger";

type Dash = {
  totals: { students: number; teachers: number; activeCourses: number };
  attendanceRate: number;
  pendingEnrollmentRequests: number;
  analytics: {
    courseFillRates: { title: string; enrolled: number; max: number; pct: number }[];
  };
};

/**
 * The manager's operational read. No money — a manager sees the shape of the
 * operation, not the books; that is the accountant's tier. So no ledger money
 * treatment here, just mono figures and the same paper.
 */
export function CenterStaffReportsScreen() {
  const t = useTranslations();
  const [d, setD] = useState<Dash | null>(null);

  useEffect(() => {
    api.get("dashboards/admin").json<{ data: Dash }>().then((r) => setD(r.data)).catch(() => {});
  }, []);

  if (!d) {
    return (
      <div className="p-8 text-center text-[13px] text-[var(--ink-3)]">
        {t("centerStaff.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("centerStaff.can.opsReports")}
        subtitle={t("centerStaff.roleDesc.manager")}
      />

      <Sheet>
        <div className="flex flex-wrap gap-x-8 gap-y-4 p-[18px]">
          <Figure label={t("nav.students")} value={d.totals.students} />
          <Figure label={t("nav.teachers")} value={d.totals.teachers} />
          <Figure label={t("nav.courses")} value={d.totals.activeCourses} />
          <Figure label={t("nav.attendance")} value={`${d.attendanceRate}%`} />
        </div>
      </Sheet>

      <Sheet>
        <SheetHead title={t("centerStaff.fillRate")} />
        {d.analytics.courseFillRates.length === 0 ? (
          <EmptyState title={t("shared.ledger.empty")} />
        ) : (
          <table className="lg-table">
            <thead>
              <tr>
                <th scope="col">{t("nav.courses")}</th>
                <th scope="col" data-numeric="true">
                  {t("centerStaff.enrolledOfMax")}
                </th>
                <th scope="col" data-numeric="true">
                  {t("centerStaff.fillRate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.analytics.courseFillRates.map((c, i) => (
                <tr key={i}>
                  <td>
                    <span className="text-[13px] text-[var(--ink)]">{c.title}</span>
                  </td>
                  <td data-numeric="true">
                    <Num className="text-[13px] text-[var(--ink-2)]">
                      {c.enrolled}/{c.max}
                    </Num>
                  </td>
                  <td data-numeric="true">
                    <Num className="text-[13px] font-semibold text-[var(--ink)]">{c.pct}%</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sheet>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-[112px]">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 mb-0">
        <Num className="text-[27px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
          {value}
        </Num>
      </p>
    </div>
  );
}
