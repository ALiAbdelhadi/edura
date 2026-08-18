import * as React from "react";
import { formatEgp, normalizeLocale, type Locale } from "../locale";
import type { WeeklyDigestData } from "../types";
import { Cta, DetailRow, EmailLayout, Note, P } from "./layout";

// =============================================================================
// Weekly center digest.
//
// The one email a center owner gets unprompted, so it has to earn the open:
// last week's money, whether the lessons actually ran, and anything left
// unfinished. Numbers only — no advice, no charts, no "great job!".
//
// EVERY FIGURE COMES FROM THE SAME SERVICE THE DASHBOARD RUNS. The job hands
// them over already computed; this file only formats. An email that re-derived
// revenue would be a second set of books arriving by mail, and the owner would
// have no way to tell which number to believe.
//
// It is a RECORD, not a call to action: the only link goes to the reports
// screen behind the normal login. No token, no figures in the URL — a
// forwarded digest grants nobody anything.
// =============================================================================

const COPY = {
  ar: {
    subject: (range: string) => `ملخص الأسبوع ${range} - Edura`,
    title: "ملخص أسبوعك",
    preview: "إيرادات الأسبوع والحضور وما يحتاج انتباهك",
    intro: (center: string) => `هذا ملخص ما جرى في ${center} الأسبوع الماضي.`,
    period: "الفترة",
    revenue: "الإيرادات",
    expenses: "المصروفات",
    net: "الصافي",
    attendance: "نسبة الحضور",
    sessions: "الحصص المجدولة",
    gaps: "بنود تحتاج انتباهك",
    cta: "افتح التقارير",
    none: "لا شيء معلّق — كل الحصص مكتملة ومسجّلة.",
    quiet: "أسبوع بلا حركة: لا حصص ولا مدفوعات مسجّلة.",
    foot: "رسالة أسبوعية تلقائية. الأرقام هنا هي نفسها الظاهرة في لوحة التحكم.",
  },
  en: {
    subject: (range: string) => `Your week ${range} - Edura`,
    title: "Your week in summary",
    preview: "Last week's revenue, attendance and what needs you",
    intro: (center: string) => `Here is what happened at ${center} last week.`,
    period: "Period",
    revenue: "Revenue",
    expenses: "Expenses",
    net: "Net",
    attendance: "Attendance rate",
    sessions: "Sessions scheduled",
    gaps: "Items needing attention",
    cta: "Open reports",
    none: "Nothing outstanding — every lesson is complete and recorded.",
    quiet: "A quiet week: no sessions and no payments recorded.",
    foot: "An automatic weekly summary. These figures are the same ones on your dashboard.",
  },
} as const;

/** `2026-08-02 → 2026-08-08`, LTR so Arabic mail clients cannot reverse it. */
function rangeLabel(data: WeeklyDigestData): string {
  return `⁦${data.periodStart} → ${data.periodEnd}⁩`;
}

export function weeklyDigestSubject(locale: Locale, data: WeeklyDigestData): string {
  return COPY[normalizeLocale(locale)].subject(rangeLabel(data));
}

export function WeeklyDigestEmail({
  locale: raw,
  data,
}: {
  locale: Locale;
  data: WeeklyDigestData;
}) {
  const locale = normalizeLocale(raw);
  const t = COPY[locale];
  // "Nothing happened" is itself information, and a wall of zeros reads as a
  // broken report rather than a quiet week. Say it in words instead.
  const quiet = data.sessionsCount === 0 && data.revenuePiasters === 0;

  return (
    <EmailLayout locale={locale} title={t.title} preview={t.preview}>
      <P>{t.intro(data.centerName)}</P>
      <DetailRow label={t.period} value={rangeLabel(data)} locale={locale} />
      {quiet ? (
        <Note>{t.quiet}</Note>
      ) : (
        <>
          <DetailRow
            label={t.revenue}
            value={formatEgp(data.revenuePiasters, locale)}
            locale={locale}
          />
          <DetailRow
            label={t.expenses}
            value={formatEgp(data.expensesPiasters, locale)}
            locale={locale}
          />
          <DetailRow
            label={t.net}
            value={formatEgp(data.netPiasters, locale)}
            locale={locale}
            strong
          />
          <DetailRow
            label={t.attendance}
            value={`⁦${data.attendanceRatePct}%⁩`}
            locale={locale}
          />
          <DetailRow
            label={t.sessions}
            value={`⁦${data.sessionsCount}⁩`}
            locale={locale}
          />
        </>
      )}
      {data.gapsCount > 0 ? (
        <DetailRow label={t.gaps} value={`⁦${data.gapsCount}⁩`} locale={locale} strong />
      ) : (
        <Note>{t.none}</Note>
      )}
      {data.link ? <Cta label={t.cta} href={data.link} locale={locale} /> : null}
      <Note>{t.foot}</Note>
    </EmailLayout>
  );
}

export function weeklyDigestText(locale: Locale, data: WeeklyDigestData): string {
  const t = COPY[normalizeLocale(locale)];
  const lines = [t.title, "", t.intro(data.centerName), "", `${t.period}: ${data.periodStart} → ${data.periodEnd}`];
  if (data.sessionsCount === 0 && data.revenuePiasters === 0) {
    lines.push("", t.quiet);
  } else {
    lines.push(
      `${t.revenue}: ${formatEgp(data.revenuePiasters, locale)}`,
      `${t.expenses}: ${formatEgp(data.expensesPiasters, locale)}`,
      `${t.net}: ${formatEgp(data.netPiasters, locale)}`,
      `${t.attendance}: ${data.attendanceRatePct}%`,
      `${t.sessions}: ${data.sessionsCount}`,
    );
  }
  lines.push("", data.gapsCount > 0 ? `${t.gaps}: ${data.gapsCount}` : t.none);
  if (data.link) lines.push("", `${t.cta}: ${data.link}`);
  lines.push("", t.foot);
  return lines.join("\n");
}
