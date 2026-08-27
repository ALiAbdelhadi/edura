"use client";
import { FinanceDashboard } from "@/features/finance/finance-dashboard";
import { FinanceFirstRun } from "@/features/tour/finance-first-run";

export default function Page() {
  return (
    <>
      <FinanceFirstRun />
      <FinanceDashboard />
    </>
  );
}
