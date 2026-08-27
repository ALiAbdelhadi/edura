import { NextResponse } from "next/server";
import { ACCOUNTANT, centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { parseProvenance } from "@/lib/http/provenance";
import { BusinessRuleError } from "@/lib/errors/classes";
import {
  buildReportExport,
  exportFilename,
  isReportExportKey,
  toCsv,
} from "@repo/server-core/services/reports/report-export";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (req, _ctx, actor) => {
    const url = new URL(req.url);
    const key = url.searchParams.get("report") ?? "";
    if (!isReportExportKey(key)) {
      throw new BusinessRuleError("Unknown report");
    }

    const { table, def } = await buildReportExport({
      key,
      user: actor.acting,
      staffRole: actor.staffRole,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      provenance: parseProvenance(url),
    });

    const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";
    const stamp = new Date().toISOString();
    const csv = toCsv(table, {
      locale,
      title: def.title[locale],
      meta: [
        { label: locale === "ar" ? "الفترة" : "Period", value: rangeLabel(url) },
        { label: locale === "ar" ? "تاريخ التصدير" : "Exported", value: stamp.slice(0, 16).replace("T", " ") },
      ],
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(key, stamp)}"`,
        "cache-control": "no-store",
      },
    });
  },
  { allow: [...ACCOUNTANT, ...MANAGER] },
);

function rangeLabel(url: URL): string {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from && !to) return "—";
  return `${from ?? "…"} → ${to ?? "…"}`;
}
