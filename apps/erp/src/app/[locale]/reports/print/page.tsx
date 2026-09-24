import { AutoPrint } from "@/features/admin/report-print-sheet";
import { getSessionUser } from "@/lib/auth/session";
import { ACCOUNTANT, MANAGER, authorizeCenterActor } from "@/lib/authz/center-actor";
import { AppError } from "@/lib/errors/classes";
import {
  buildReportExport,
  isReportExportKey,
} from "@repo/server-core/services/reports/report-export";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edura — Report",
  robots: { index: false, follow: false },
};

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

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?callbackUrl=/${locale}/reports/print`);
  if (!report || !isReportExportKey(report)) notFound();

  let actor;
  try {
    actor = await authorizeCenterActor(user, { allow: [...ACCOUNTANT, ...MANAGER] });
  } catch {
    notFound();
  }

  let built;
  try {
    built = await buildReportExport({
      key: report,
      user: actor.acting,
      staffRole: actor.staffRole,
      from,
      to,
    });
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }

  const { table, def } = built;
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
