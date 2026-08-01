import * as React from "react";
import { normalizeLocale, type Locale } from "../locale";
import type { WelcomeData } from "../types";
import { Cta, EmailLayout, FallbackLink, Note, P, CodeBox } from "./layout";

// Copy carried over verbatim from apps/www/src/lib/services/onboarding/
// welcome-email.ts, which this replaces. The wording was already reviewed and
// shipped; the only thing that changed is the shell it renders into.
const COPY = {
  ar: {
    subject: "أهلاً بك في إدورا — أكمل ملفك الشخصي",
    title: (name: string) => `أهلاً ${name} 👋`,
    preview: "أكمل ملفك الشخصي على إدورا",
    intro:
      "إدورا تربطك بمعلميك ومراكزك — الجدول والحضور والدرجات والمدفوعات في مكان واحد.",
    cta: "أكمل ملفك الشخصي",
    codeLabel: "رمز الطالب الخاص بك",
    codeHint: "شارك هذا الرمز مع ولي أمرك ليتابع تقدمك الدراسي.",
    expiry: (d: number) =>
      `صلاحية زر الرابط ${d} أيام — يمكنك طلب رابط جديد من صفحة إكمال الملف.`,
  },
  en: {
    subject: "Welcome to Edura — complete your profile",
    title: (name: string) => `Welcome, ${name} 👋`,
    preview: "Complete your Edura profile",
    intro:
      "Edura connects you with your teachers and centers — schedule, attendance, grades and payments in one place.",
    cta: "Complete your profile",
    codeLabel: "Your Student ID",
    codeHint: "Share this ID with your parent so they can follow your progress.",
    expiry: (d: number) =>
      `The button link expires in ${d} days — you can request a new one from your onboarding page.`,
  },
} as const;

/** XXXX-XXXX-XXXX — the same code, just readable over a phone call. */
export function groupFamilyCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

export function welcomeSubject(locale: Locale): string {
  return COPY[locale].subject;
}

export function WelcomeEmail({ locale: raw, data }: { locale: Locale; data: WelcomeData }) {
  const locale = normalizeLocale(raw);
  const t = COPY[locale];
  const code = data.studentCode ? groupFamilyCode(data.studentCode) : null;

  return (
    <EmailLayout locale={locale} title={t.title(data.name)} preview={t.preview}>
      <P>{t.intro}</P>
      <Cta label={t.cta} href={data.link} locale={locale} />
      <FallbackLink href={data.link} locale={locale} />
      {code ? (
        <>
          {/* The fallback URL above ends flush; without this the Student ID
              heading reads as part of it. */}
          <div style={{ height: "20px" }} />
          <P>
            <strong>{t.codeLabel}</strong>
          </P>
          <CodeBox value={code} />
          <P muted small>
            {t.codeHint}
          </P>
        </>
      ) : null}
      <Note>{t.expiry(data.expiryDays)}</Note>
    </EmailLayout>
  );
}

export function welcomeText(locale: Locale, data: WelcomeData): string {
  const t = COPY[locale];
  const lines = [t.title(data.name), "", t.intro, "", data.link, ""];
  if (data.studentCode) {
    lines.push(`${t.codeLabel}: ${groupFamilyCode(data.studentCode)}`, t.codeHint, "");
  }
  lines.push(t.expiry(data.expiryDays));
  return lines.join("\n");
}
