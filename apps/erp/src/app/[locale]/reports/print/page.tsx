import { AutoPrint } from "@/features/admin/report-print-sheet";
import { serviceGet } from "@/lib/server/service-fetch";
import type { ExportTable } from "@repo/server-core/services/reports/report-export";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edura — Report",
  robots: { index: false, follow: false },
};

// `def.load` does not survive JSON; the page renders only the title.
type ReportPrintWire = { table: ExportTable; def: { title: { ar: string; en: string } } };

export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ report?: string; from?: string; to?: string; print?: string }>;
}) {
  const { locale } = await params;
  const { report, from, to, print } = await searchParams;
  const lang = locale === "en" ? "en" : "ar";

  // One read, same doors in the same order: 401 is the signed-out visitor;
  // an unknown key, a caller outside ACCOUNTANT/MANAGER (403) or a build-time
  // AppError (404) were all notFound() before.
  const res = await serviceGet<ReportPrintWire>("/api/v1/reports/print", {
    key: report ?? "",
    from,
    to,
  });
  if (res.status === 401) redirect(`/${locale}/login?callbackUrl=/${locale}/reports/print`);
  if (!res.data) notFound();

  const { table, def } = res.data;
  const range = from || to ? `${from ?? "…"} → ${to ?? "…"}` : lang === "ar" ? "كل الفترات" : "All time";
  const money = (v: number) => (v / 100).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const cell = (row: Record<string, string | number | null>, key: string, type?: string) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (type === "money" && typeof v === "number") return money(v);
    if (type === "percent") return `${v}%`;
    return String(v);
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="report-print">
      <AutoPrint enabled={print === "1"} />
      <style>{`
        .report-print { padding: 24px; color: #17150f; background: #fff; font-size: 13px; min-height: 100vh; }
        .report-print h1 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
        .report-print .meta { color: #6b6867; font-size: 12px; margin-bottom: 16px; }
        .report-print table { width: 100%; border-collapse: collapse; }
        .report-print th, .report-print td { padding: 6px 8px; text-align: start; }
        .report-print thead th { border-bottom: 1px solid #17150f; font-weight: 600; }
        .report-print tbody tr { border-bottom: 1px solid rgba(23,21,15,0.16); }
        .report-print tfoot td { border-top: 2px double #17150f; font-weight: 600; padding-top: 8px; }
        .report-print .num { font-variant-numeric: tabular-nums; unicode-bidi: isolate; direction: ltr; display: inline-block; }
        @media print {
          @page { margin: 14mm; }
          .report-print { padding: 0; }
        }
      `}</style>

      <h1>{def.title[lang]}</h1>
      <p className="meta">
        {lang === "ar" ? "الفترة" : "Period"}: <span className="num">{range}</span>
      </p>

      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.key}>{c.header[lang]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {table.columns.map((c) => (
                <td key={c.key}>
                  {c.type === "text" ? (
                    cell(row, c.key, c.type)
                  ) : (
                    <span className="num">{cell(row, c.key, c.type)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {table.totalRow && (
          <tfoot>
            <tr>
              {table.columns.map((c) => (
                <td key={c.key}>
                  {c.type === "text" ? (
                    cell(table.totalRow!, c.key, c.type)
                  ) : (
                    <span className="num">{cell(table.totalRow!, c.key, c.type)}</span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
