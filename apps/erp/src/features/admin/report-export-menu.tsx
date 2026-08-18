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

/**
 * Export the reports on this screen.
 *
 * Both surfaces hit the SAME registry (`report-export.ts`): the CSV endpoint
 * and the print route each call `buildReportExport`, which calls the report
 * service the screen itself is displaying. So the spreadsheet, the printed
 * sheet and the numbers on screen are one calculation, not three.
 *
 * The date range is passed straight through — exporting "what I am looking
 * at" is the only behaviour that does not surprise anyone.
 *
 * Which reports appear is NOT decided here: the server refuses a report the
 * caller's staff tier may not read (a manager cannot export revenue). Listing
 * them all and letting the server say no keeps one source of truth for the
 * money boundary, at the cost of a possible refusal the operator can read.
 */

const MONEY_REPORTS = ["net-profit", "revenue-by-course", "expenses"] as const;
const OPS_REPORTS = ["course-fill-rates", "attendance-by-course", "enrollment-funnel"] as const;

type ReportKey = (typeof MONEY_REPORTS)[number] | (typeof OPS_REPORTS)[number];

export function ReportExportMenu({ from, to }: { from?: string; to?: string }) {
  const t = useTranslations();
  const locale = useLocale();

  const qs = (report: ReportKey, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ report, locale, ...extra });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  };

  // A real anchor click, not fetch() and not a location assignment: the
  // browser's own download handling honours the Content-Disposition filename,
  // the session cookie rides along, and the page is never navigated away from
  // (an assignment to location would also trip the compiler's immutability
  // rule, and would blank the screen for a moment on a slow report).
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

  // Keys written out in full, never assembled: next-intl can only verify a
  // literal, and a constructed key that misses renders the raw key string to
  // the user. (Same reasoning as the Tailwind dead-class rule.)
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
        {[...MONEY_REPORTS, ...OPS_REPORTS].map((r) => (
          <DropdownMenuItem key={`csv-${r}`} onSelect={() => downloadCsv(r)}>
            {label(r)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-[12px]">
          <Printer className="size-3.5" />
          {t("adminManage.reports.exportPrint")}
        </DropdownMenuLabel>
        {[...MONEY_REPORTS, ...OPS_REPORTS].map((r) => (
          <DropdownMenuItem key={`print-${r}`} onSelect={() => openPrint(r)}>
            {label(r)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
