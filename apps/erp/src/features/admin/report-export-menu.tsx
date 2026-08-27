"use client";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

const MONEY_REPORTS = ["net-profit", "revenue-by-course", "expenses", "shift-reconciliation"] as const;
const OPS_REPORTS = ["course-fill-rates", "attendance-by-course", "enrollment-funnel"] as const;

type ReportKey = (typeof MONEY_REPORTS)[number] | (typeof OPS_REPORTS)[number];

export function ReportExportMenu({
  from,
  to,
  only,
}: {
  from?: string;
  to?: string;
  only?: "money";
}) {
  const t = useTranslations();
  const locale = useLocale();

  const shown: readonly ReportKey[] =
    only === "money" ? MONEY_REPORTS : [...MONEY_REPORTS, ...OPS_REPORTS];

  const qs = (report: ReportKey, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ report, locale, ...extra });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  };

  const downloadCsv = (report: ReportKey) => {
    const a = document.createElement("a");
    a.href = `/api/v1/reports/export?${qs(report)}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openPrint = (report: ReportKey) => {
    window.open(`/${locale}/reports/print?${qs(report, { print: "1" })}`, "_blank");
  };

  const label = (r: ReportKey) => {
    switch (r) {
      case "net-profit":
        return t("adminManage.reports.export_net_profit");
      case "revenue-by-course":
        return t("adminManage.reports.export_revenue_by_course");
      case "expenses":
        return t("adminManage.reports.export_expenses");
      case "course-fill-rates":
        return t("adminManage.reports.export_course_fill_rates");
      case "attendance-by-course":
        return t("adminManage.reports.export_attendance_by_course");
      case "enrollment-funnel":
        return t("adminManage.reports.export_enrollment_funnel");
      case "shift-reconciliation":
        return t("adminManage.reports.export_shift_reconciliation");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="text-[13px]">
          <Download className="size-4" />
          {t("adminManage.reports.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2 text-[12px]">
          <FileSpreadsheet className="size-3.5" />
          {t("adminManage.reports.exportCsv")}
        </DropdownMenuLabel>
        {shown.map((r) => (
          <DropdownMenuItem key={`csv-${r}`} onSelect={() => downloadCsv(r)}>
            {label(r)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-[12px]">
          <Printer className="size-3.5" />
          {t("adminManage.reports.exportPrint")}
        </DropdownMenuLabel>
        {shown.map((r) => (
          <DropdownMenuItem key={`print-${r}`} onSelect={() => openPrint(r)}>
            {label(r)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
