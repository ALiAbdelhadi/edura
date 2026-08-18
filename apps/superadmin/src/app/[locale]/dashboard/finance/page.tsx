"use client";
import { FinanceDashboard } from "@/features/finance/finance-dashboard";
import { FinanceFirstRun } from "@/features/tour/finance-first-run";

export default function Page() {
  return (
    <>
      {/* First entry only: the guided tour offers itself once, then never again
          (user_prefs.tour_completed). Mounted beside the dashboard rather than
          inside it, so a slow or empty first load cannot hide it. */}
      <FinanceFirstRun />
      <FinanceDashboard />
    </>
  );
}
